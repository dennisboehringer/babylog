# Meal-vision eval — scoring & rubric

Quantitative gate on the meal-photo pipeline. Run before any provider/prompt
change ships. Lives next to the contract: `MEAL_AI_CONTRACT.md`.

## Layout

```
evals/meal-vision/
  cases/        # one JSON per labeled photo
  fixtures/     # the photo files referenced by cases
  run.ts        # iterates cases → POSTs to /api/meal-vision → scores
  rubric.md     # this file
```

## Case file shape

`cases/001-yogurt-banana.json`:

```json
{
  "id": "001-yogurt-banana",
  "image": "fixtures/001-yogurt-banana.jpg",
  "imageMimeType": "image/jpeg",
  "context": { "stage": "toddler", "ageMonths": 15, "locale": "en-US" },
  "groundTruth": {
    "foods": [
      { "name": "whole milk yogurt", "grams": 100, "toleranceGrams": 30 },
      { "name": "banana",            "grams":  60, "toleranceGrams": 20 }
    ]
  }
}
```

`name` matching is fuzzy (token overlap, lowercase, ignore punctuation). A
ground-truth `"banana"` matches AI's `"banana, raw"`.

## Per-case metrics

| Metric | Definition |
|---|---|
| Recall | matched_truth / total_truth |
| Precision | matched_ai / total_ai |
| Portion accuracy | for matched foods: % within `toleranceGrams` |
| Hallucinations | AI-identified foods with no ground-truth match (= 1 - precision) |

Foods with `grams: null` count toward recall/precision but skip portion accuracy.

## Aggregate scoring

Per run: weighted average across cases, with hallucination as a hard cap.

```
overall = 0.4 × recall + 0.3 × precision + 0.3 × portionAccuracy
fail_if hallucinationRate > 0.10
```

## Acceptance thresholds (v1, calibrate after first 30 real photos)

| Metric | Threshold |
|---|---|
| Recall | ≥ 80% |
| Precision | ≥ 80% |
| Portion accuracy | ≥ 60% |
| Hallucination rate | ≤ 10% (hard cap — auto-fail above) |

These are aspirational. Numbers will move once we have real Sofia meals.

## Shipping rule

> The photo flow does NOT go to Florencia (or anyone outside the dev loop)
> until the harness passes on at least **10 real Sofia meals**.

Synthetic / stock photos do not count toward the 10. They go in `cases/`
for regression purposes only.

## Provider swap workflow

1. Change `MODEL` in `meal-vision.ts` (or swap to a non-Anthropic provider —
   the abstraction is the JSON contract, not the SDK).
2. Run `tsx evals/meal-vision/run.ts` against the new provider.
3. Compare aggregate score + per-case diffs against the previous run.
4. If equal-or-better and hallucination cap holds, ship.
5. Archive the prior run's results JSON under `evals/meal-vision/runs/`
   (gitignored — local only).

## What this rubric does NOT measure

- Real-world parent satisfaction (qualitative, lives outside this harness)
- Speed (tracked separately via `timing.ai_ms` returned by the endpoint)
- Cost per meal (tracked separately; trivial at family scale)
- Database completeness for unusual foods (USDA/OFF coverage gap shows as
  `nutritionSource: null` in production logs — not a vision failure)
