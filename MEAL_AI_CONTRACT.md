# Meal AI Contract — frozen v1

Single source of truth for the meal-photo → nutrition pipeline. Both the server
endpoint and the client UI reference this document. Changes here require council
sign-off (AI Lead + Pediatric Safety + Trust Guardian).

## Architecture

```
[ Client ]                           [ /api/meal-vision (Edge) ]                 [ External ]
   │                                    │
   │   POST { image, mime, context }    │
   │ ─────────────────────────────────▶ │
   │                                    │── Anthropic Claude Sonnet 4.6 ───▶ vision + tool_use
   │                                    │     (system prompt + log_meal tool)
   │                                    │ ◀── { foods: [{name, grams, conf}], warnings }
   │                                    │
   │                                    │── for each food, parallel ─────▶ USDA FDC
   │                                    │     (search → detail)
   │                                    │   if no match ─────────────────▶ Open Food Facts
   │                                    │     (search)
   │                                    │ ◀── per-100g nutrients, scaled
   │                                    │
   │ ◀── { foods: FoodItem[], warnings, aiConfidence }
```

**Why server orchestration** (diverges from `chat`/`insight`/`report`):
- USDA FDC API key must stay server-side
- Prompt + tool schema upgradeable without a client release
- Native iOS client hits the same endpoint with the same contract — no logic duplication

## Frozen system prompt (verbatim)

```
You are a meal-photo analyzer for a baby/toddler nutrition tracker.
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

Output via the log_meal tool only.
```

## Frozen tool schema

```json
{
  "name": "log_meal",
  "description": "Record the foods visible in this meal photo.",
  "input_schema": {
    "type": "object",
    "properties": {
      "foods": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name":       { "type": "string" },
            "grams":      { "type": ["number", "null"] },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
          },
          "required": ["name", "grams", "confidence"]
        }
      },
      "warnings": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["foods", "warnings"]
  }
}
```

`tool_choice: { type: 'tool', name: 'log_meal' }` forces structured output.

## Request shape

```ts
POST /api/meal-vision
{
  image: string,                          // base64, no data: prefix; client pre-resizes to 1024px max
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  context: {
    stage: 'newborn' | 'weaning' | 'toddler' | 'preschool',
    ageMonths: number,                    // integer
    locale: string                        // e.g. 'en-US'
  }
}
```

**Explicitly NOT sent:** babyId, name, dob, prior meal history, dietary restrictions.
The server cannot tie meals across requests — only an IP for rate limiting.

## Response shape — success (200)

```ts
{
  foods: FoodItem[],                      // shape matches src/types.ts FoodItem
  aiModel: 'claude-sonnet-4-6',
  aiConfidence: number,                   // mean per-food confidence
  warnings: string[],                     // e.g. ["Low light — portion estimates may be unreliable"]
  timing: { ai_ms: number, usda_ms: number }
}
```

## Response shape — failure

Any non-200 → client treats as "AI unavailable, log manually." No retry, no fake estimate.

| Status | Meaning |
|---|---|
| 400 | Bad request shape (validation failed) |
| 413 | Image too large |
| 429 | Rate limit (with `Retry-After` header) |
| 500 | Server misconfigured (missing env var) |
| 502 | Upstream Anthropic failure or no tool call returned |

## Confidence bands (UI contract)

| Aggregate confidence | Band | UI treatment |
|---|---|---|
| < 0.5 | Low | Amber border on confirmation sheet; "Please review carefully" |
| 0.5 – 0.8 | Medium | Default state; foods editable, parent can save with one tap |
| > 0.8 | High | Solid state; same edit affordances, no review nudge |

Per-food confidence drives the same banding on individual chips. Placeholders
for v1; tune after real-meal data lands.

## Nutrition source priority

1. **USDA FDC** — Foundation + SR Legacy data types preferred (research-grade).
2. **USDA FDC** — Branded data type as a secondary USDA fallback.
3. **Open Food Facts** — European-led free database; covers branded gaps.
4. **No match** — `nutritionSource: null`, all nutrient fields `null`. UI shows
   "—" placeholders and lets the parent enter manually.

LLM nutrition values are **never** used. Hallucination floor is the database.

## Privacy promise (server-side, codified)

| Data | Handling |
|---|---|
| Image bytes | Forwarded to Anthropic only; never stored, never logged on our servers |
| Foods identified | Returned to client; never stored, never logged |
| Baby identifiers (id/name/dob) | Never sent to server (client-enforced) |
| IP address | Logged briefly for rate limiting (matches existing endpoints) |
| Anthropic data retention | Standard API terms — no training on API traffic |
| USDA / OFF queries | Generic food names only, no PII |

## In-app copy block — "What the AI never does"

This block appears in Settings and as a first-use modal. Wording is part of
the contract; changes require council sign-off.

```
Meal Photo Analysis

What we do:
• Identify visible foods and estimate portions
• Look up nutrition from the USDA database (and Open Food Facts in Europe)
• Let you correct anything before saving

What we will never do:
• Tell you if your child has eaten "enough"
• Recommend calorie or nutrient targets
• Flag allergies, deficiencies, or growth concerns
• Read medical meaning into a meal
• Save anything you haven't reviewed

Photos stay on your device. Only the parsed food list (no image)
syncs across your family.
```

## Failure-mode matrix

| Failure | Server status | Client UX |
|---|---|---|
| Network unreachable | n/a | "AI unavailable. Tap to log manually." |
| Server 5xx | `{ error }` | Same as above |
| Claude returns no tool call | 502 + log | Same |
| Claude returns empty foods + warning | 200 with empty `foods[]` | Show warning + "log manually" link |
| USDA + OFF both miss for a food | `nutritionSource: null` | Food chip shows "—"; user can enter manually |
| Rate limit | 429 + `Retry-After` | "Too many requests, try again in a moment" |
| Image > 5MB | 413 | "Photo too large — try again" (client should pre-resize) |

Client never spins, never fakes a number, never silently saves.

## Eval harness

Lives in `babylog/evals/meal-vision/`. See `rubric.md` there for scoring,
acceptance thresholds, and the rule:

> Don't ship the photo flow to Florencia until the harness passes on at
> least 10 real Sofia meals.

## Environment variables

| Var | Required | Source | Behavior if missing |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | https://console.anthropic.com | Endpoint returns **500** — meal flow unusable |
| `USDA_FDC_API_KEY` | yes | https://api.data.gov/signup/ (free, instant) | USDA lookups silently return empty → every food falls back to **Open Food Facts**. Coverage degrades, especially for whole foods (banana, oatmeal, etc.). Not user-visible as an error, but observable as `nutritionSource: 'off'` for foods that should have been `'usda'`. |
| `ALLOWED_ORIGIN` | optional | — | CORS reflects `*` for unknown origins (dev-friendly). Lock to your deployed domain in production. |

**Setup checklist before deploying:**
1. Sign up at api.data.gov (instant, email confirmation only).
2. Add `USDA_FDC_API_KEY` to your Vercel project env vars (Production + Preview).
3. Verify with a test request — response foods should carry `nutritionSource: 'usda'` for common items.

If you skip step 2, the endpoint will still appear to work; nutrition quality will silently degrade to OFF-only.
