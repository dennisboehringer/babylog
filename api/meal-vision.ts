// Vercel Serverless Function — meal photo → foods + nutrition.
//
// Diverges from the chat/insight/report pattern: this endpoint orchestrates
// (Claude vision call → USDA/OFF lookup) rather than proxying the body
// verbatim. Reasons documented in MEAL_AI_CONTRACT.md.
//
// Required env vars:
//   ANTHROPIC_API_KEY
//   USDA_FDC_API_KEY    (free at https://api.data.gov/signup/)

import { lookupNutrition, type NutritionResult } from './_nutrition';

export const config = { runtime: 'edge' };

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateState = new Map<string, { count: number; resetAt: number }>();

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

// ----------------------------------------------------------------------------
// Frozen contract — keep in sync with MEAL_AI_CONTRACT.md.
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a meal-photo analyzer for a baby/toddler nutrition tracker.
Identify each visible food item and estimate its portion size in grams.

STRICT RULES:
1. Output STRICTLY matches the log_meal tool schema. No commentary text.
2. Identify foods you can see with reasonable certainty. If uncertain
   what something is, omit it rather than guessing.
3. Estimate portion grams from visual cues (utensil size, plate diameter
   if visible, comparable familiar objects). When grams cannot be
   reasonably estimated, return null — do NOT fabricate a number.
4. Per-food confidence (0.0–1.0) reflects YOUR certainty in BOTH the food
   identification AND the portion estimate. Be calibrated, not optimistic.
   A familiar food clearly visible at a known portion: ~0.9. A partially
   obscured item with rough portion guess: ~0.5. An ambiguous item: omit.
5. Use simple, generic food names that match common nutrition databases
   ("banana, raw"; "whole milk yogurt, plain"; "scrambled egg") rather
   than brand names or descriptive flourishes.
6. NEVER:
   - Estimate calories or any nutrient values (a database does this).
   - Comment on healthiness, balance, appropriateness, or quantity.
   - Provide medical, dietary, or feeding advice.
   - Identify or describe any person in the photo.
   - Reference the child's age, stage, or context to judge the meal.
7. If the image is unclear, very dark, or doesn't contain food, return
   an empty foods array with a descriptive warning string.

Output via the log_meal tool only.`;

const TOOL_SCHEMA = {
  name: 'log_meal',
  description: 'Record the foods visible in this meal photo.',
  input_schema: {
    type: 'object',
    properties: {
      foods: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:       { type: 'string' },
            grams:      { type: ['number', 'null'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['name', 'grams', 'confidence'],
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['foods', 'warnings'],
  },
} as const;

// ----------------------------------------------------------------------------
// Request / response shapes
// ----------------------------------------------------------------------------

interface MealVisionRequest {
  image: string;                                                  // base64, no data: prefix
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  context: {
    stage: 'newborn' | 'weaning' | 'toddler' | 'preschool';
    ageMonths: number;
    locale: string;
  };
}

interface AiFood {
  name: string;
  grams: number | null;
  confidence: number;
}

interface MealVisionResponseFood extends NutritionResult {
  name: string;
  grams: number | null;
  source: 'ai';
  confidence: number;
}

// ----------------------------------------------------------------------------
// Boilerplate (matches existing endpoints)
// ----------------------------------------------------------------------------

function rateLimit(ip: string): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const entry = rateState.get(ip);
  if (!entry || entry.resetAt < now) {
    const resetAt = now + RATE_WINDOW_MS;
    rateState.set(ip, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }
  entry.count++;
  return { allowed: entry.count <= RATE_MAX, resetAt: entry.resetAt };
}

function corsHeaders(origin: string | null): HeadersInit {
  const ok = !origin
    || origin.endsWith('.vercel.app')
    || origin.startsWith('http://localhost')
    || origin === (typeof process !== 'undefined' ? process.env.ALLOWED_ORIGIN : '');
  return {
    'Access-Control-Allow-Origin': ok && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(status: number, message: string, cors: HeadersInit, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  });
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

function validateBody(b: unknown): MealVisionRequest | string {
  if (!b || typeof b !== 'object') return 'Invalid body';
  const o = b as Record<string, unknown>;
  if (typeof o.image !== 'string' || o.image.length === 0) return 'image (base64) required';
  if (o.image.length > 7_000_000) return 'image too large (max ~5MB raw)'; // ~5MB raw → ~6.7M base64
  const mime = o.imageMimeType;
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    return 'imageMimeType must be jpeg, png, or webp';
  }
  if (!o.context || typeof o.context !== 'object') return 'context required';
  const c = o.context as Record<string, unknown>;
  if (!['newborn', 'weaning', 'toddler', 'preschool'].includes(c.stage as string)) return 'invalid stage';
  if (typeof c.ageMonths !== 'number' || c.ageMonths < 0 || c.ageMonths > 240) return 'invalid ageMonths';
  if (typeof c.locale !== 'string') return 'locale required';
  return b as MealVisionRequest;
}

// ----------------------------------------------------------------------------
// Anthropic vision call
// ----------------------------------------------------------------------------

async function callClaude(req: MealVisionRequest, apiKey: string): Promise<{ foods: AiFood[]; warnings: string[] }> {
  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'log_meal' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: req.imageMimeType, data: req.image },
        },
        {
          // Minimal text — context only, no prompting toward judgment.
          type: 'text',
          text: `Stage: ${req.context.stage}. Age: ${Math.round(req.context.ageMonths)} months. Locale: ${req.context.locale}. Analyze the meal.`,
        },
      ],
    }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    content?: Array<{ type: string; name?: string; input?: { foods?: AiFood[]; warnings?: string[] } }>;
  };
  const tool = json.content?.find(c => c.type === 'tool_use' && c.name === 'log_meal');
  if (!tool?.input) throw new Error('Anthropic returned no tool call');

  return {
    foods: Array.isArray(tool.input.foods) ? tool.input.foods : [],
    warnings: Array.isArray(tool.input.warnings) ? tool.input.warnings : [],
  };
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed', cors);

  const apiKey = typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : undefined;
  if (!apiKey) return jsonError(500, 'Server misconfigured: ANTHROPIC_API_KEY not set', cors);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const { allowed, resetAt } = rateLimit(ip);
  if (!allowed) {
    return jsonError(429, 'Rate limit exceeded. Try again in a moment.', cors, {
      'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
    });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonError(400, 'Invalid JSON', cors); }

  const validated = validateBody(raw);
  if (typeof validated === 'string') return jsonError(400, validated, cors);

  // 1. Vision call.
  const aiStart = Date.now();
  let aiFoods: AiFood[];
  let warnings: string[];
  try {
    const out = await callClaude(validated, apiKey);
    aiFoods = out.foods;
    warnings = out.warnings;
  } catch (e: unknown) {
    return jsonError(502, `Vision analysis failed: ${e instanceof Error ? e.message : 'unknown'}`, cors);
  }
  const ai_ms = Date.now() - aiStart;

  // 2. Nutrition lookup, parallel across foods.
  const usdaStart = Date.now();
  const enriched: MealVisionResponseFood[] = await Promise.all(
    aiFoods.map(async (f): Promise<MealVisionResponseFood> => {
      const nutr = await lookupNutrition(f.name, f.grams);
      return {
        name: f.name,
        grams: f.grams,
        source: 'ai',
        confidence: f.confidence,
        ...nutr,
      };
    }),
  );
  const usda_ms = Date.now() - usdaStart;

  // 3. Aggregate confidence.
  const aiConfidence = enriched.length > 0
    ? +(enriched.reduce((s, f) => s + f.confidence, 0) / enriched.length).toFixed(3)
    : 0;

  return new Response(JSON.stringify({
    foods: enriched,
    aiModel: MODEL,
    aiConfidence,
    warnings,
    timing: { ai_ms, usda_ms },
  }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
