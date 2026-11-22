# Seamwise

Clothing quality rating service. Send photos of a garment and/or the product-page
text and reviews; get back a grade with a likely range, a confidence level, and
reasons that each point to a piece of evidence:

> Good, likely range Average to Good, medium confidence.

This is the backend for the design in "Clothing quality rating system: design".
The iOS app is not built yet; everything it needs to talk to is here.

## Run it

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:8787 for the test console. From an iPhone on the same
Wi-Fi, open `http://<this PC's IP>:8787` in Safari to take and upload photos
before any app exists.

To analyse photos, put a key in `.env` (already created from `.env.example`): `GEMINI_API_KEY`
(Google AI Studio, has a free tier) or `ANTHROPIC_API_KEY`, then restart. Set
`SEAMWISE_PROVIDER` to choose when both are present. The Gemini free tier may use uploads
for training and human review: photograph garments only, no people or personal details. Without a key the service still runs: it scores
from text and reviews, accepts photos, and reports `vision.status: "skipped_no_provider"`.

**Decision models (faster, with probabilities):** set `SEAMWISE_PROVIDER=gemini-decisions`
(same `GEMINI_API_KEY`), `clef-flash`, `clef` or `jev`. These go through the
[`letsdecide`](https://www.npmjs.com/package/letsdecide) library, so any of its providers works via
`SEAMWISE_PROVIDER=decisions` and `SEAMWISE_DECISION_MODEL=provider/model`. They fill the checklist in
about 1–2 s per photo, but leave label text empty. See `.env.example` and
[docs/decision-providers-plan.md](docs/decision-providers-plan.md).

Before exposing it beyond your own machine, set `SEAMWISE_API_TOKEN` in `.env`.

## Test it

| Command | What it checks | Needs a key |
|---|---|---|
| `npm test` | 64 tests: scoring rules, extraction, the HTTP API with real multipart uploads | no |
| `npm run backtest` | 38 hand-graded cases: grade agreement, refusals, orderings | no |
| `npm run backtest:vision` | Whether the vision model reads your real photos correctly | yes (either provider), plus photos |
| `npm run typecheck` | TypeScript | no |

### What has and has not been verified

Verified here, without a key:

- Scoring, extraction, explanations, refusal, ranking, the value view.
- The HTTP layer: multipart and JSON uploads, 5 MB real files, type sniffing,
  size and count limits, HEIC rejection, auth, storage, the ranked list.
- Everything downstream of the vision model, by replaying canned checklists.

Not verified yet:

- **Decision-model vision** (`src/vision/decision.ts`) ran end to end on `gemini-decision-1`
  with retailer photos; Clef and Jev have not been called. Checklist accuracy on phone photos is untested.
- **The Anthropic vision call** (`src/vision/provider.ts`) type-checks but has never run
  against the real API.
- **Gemini on real garments.** `src/vision/gemini.ts` ran once end to end against the real API
  with a synthetic fabric image (`gemini-3.5-flash`, about 48 s on the free tier;
  `gemini-3.8-flash` returned 503 "high demand"). It is untested on real garment photos.
  Override the model with `SEAMWISE_GEMINI_MODEL`.
- **Vision accuracy on real photos.** See `backtest/images/README.md`.
- **The Swift client** in `ios/`. It has never been compiled.

### Back-test result

Expected grades were written before the scorer was run on them.

| Measure | Result |
|---|---|
| Grade matches exactly | 22 of 33 |
| Grade within one band | 33 of 33 |
| Graded when it should refuse | 3 of 5 |
| Refused when it should grade | 0 of 33 |
| Pairwise orderings correct | 14 of 15 |

Read these as a consistency check, not a validation: the same person wrote the
rubric and the expected grades. Real validation needs outside ground truth
(lab tests, long-term reviews, resale data).

Known patterns in the misses:

- **It is cautious at the extremes.** Most off-by-one cases are an expected
  "Excellent" graded "Good", or "Poor" graded "Below average". Every estimate
  starts from an average garment and needs strong evidence to move far.
- **Composition alone gets "Average, low confidence", not a refusal.** A page that
  says only "100% cotton" is graded with a range spanning three bands. Raising
  `CONFIDENCE_SD.insufficient` in `src/rubric.ts` would make it refuse instead,
  but would also refuse brand-only fast-fashion pages, which the design says
  should read "Average, low confidence". One floor cannot do both.

## How it works

```
photos ──► vision model fills a fixed checklist ──┐
page text ──► deterministic extractor ────────────┼─► typed evidence ─► scorer ─► grade, range,
reviews ──► deterministic review mining ──────────┤                               confidence, reasons
brand, price ──► priors ──────────────────────────┘
```

- The vision model only answers a checklist, with "not visible" always available.
  It never produces a grade, a score, or any sentence shown to the user.
- Every piece of evidence is a typed record: claim, source, implied quality, reliability.
- The scorer is a Gaussian update over a general quality level plus one deviation
  per dimension. Missing evidence widens the range; it never lowers the score.
- Explanations are assembled only from evidence records.
- Photos are never stored. Assessments are kept in `data/assessments.json`.

| File | What lives there |
|---|---|
| `src/rubric.ts` | Every number: fibre values, weights, bands, thresholds, brand tiers |
| `src/scorer.ts` | The scoring model |
| `src/extract/` | Page text, reviews, and checklist-to-evidence mapping |
| `src/vision/` | The checklist schema, the prompt, the model call |
| `src/pipeline.ts` | Collect, score, build the response |
| `src/server.ts` | HTTP API |
| `backtest/golden.ts` | The hand-graded cases |
| `docs/openapi.yaml` | API contract |
| `ios/SeamwiseClient.swift` | Swift models and client for the app |

## Things to know before shipping

- The brand list in `src/rubric.ts` is a small illustrative seed. Replace it with your own data.
- Price bands are in USD. Other currencies are used as given, with a warning.
- Publicly grading a named brand has legal exposure; the evidence-linked reasons and stated confidence are the defence. Keep them visible.
- Categories covered: tee, knitwear, denim, outerwear, shirt. Anything else uses a generic rubric.
