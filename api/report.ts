// Vercel Serverless Function — Claude proxy for report generation.
// Keeps the Anthropic API key server-side. Forwards the request body verbatim
// and returns the response JSON. Rate-limited per-IP in-memory (good enough
// for v1; a single parent household will never hit it).
//
// Required env var: ANTHROPIC_API_KEY

export const config = { runtime: 'edge' };

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10; // 10 report generations per IP per minute
const rateState = new Map<string, { count: number; resetAt: number }>();

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
  // Reflect the request origin if it matches our allowed patterns; otherwise
  // fall back to a wildcard for dev. In production you may want to lock this
  // down to your exact domain via an ALLOWED_ORIGIN env var.
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

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : undefined;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: 'Server misconfigured: ANTHROPIC_API_KEY not set' } }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const { allowed, resetAt } = rateLimit(ip);
  if (!allowed) {
    return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded. Try again in a moment.' } }), {
      status: 429,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON' } }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
}
