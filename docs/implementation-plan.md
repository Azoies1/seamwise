# Implementation and test plan

Status: proposal, 2026-11-19. Implements `docs/quality-rubric.md` (question bank, scoring, longevity) on top of `docs/decision-providers-plan.md` (decision-model providers).

## Key design decision

The decision-model path produces `Evidence` directly from the answers. It does not squeeze them into the old `VisionReport` checklist.

- The bank has about 150 questions with probabilities. `VisionReport` has 16 hard answers. Converting would throw away the probabilities, which are the point.
- `GeminiVision` and `AnthropicVision` keep the old checklist path through `src/extract/visionEvidence.ts`, unchanged. They are also the label OCR step.
- The pipeline picks the path by provider kind. Both paths end in `Evidence[]`, so `score()`, `nextBestEvidence()`, the API shape and the iOS client keep working.

## What changes, file by file

| File | Change |
|---|---|
| `src/vision/bank.ts` (new) | The question bank as data: id, type, question text, options or levels with their values, gate, dimension, categories, section. One place to audit and edit wording. Exports `BANK_VERSION`. |
| `src/vision/decision.ts` (new) | `DecisionAdapter` interface (`ask(image, questions) -> answers`), `DecisionVision` (one call per image, splits into batches of 64 for Clef), shared answer types, error mapping to `VisionError`. |
| `src/vision/adapters/gemini.ts`, `clef.ts`, `jev.ts` (new) | One adapter each, about 40 lines. Gemini uses the installed SDK with `api_version: "v1beta"`. Clef and Jev use `fetch`. |
| `src/extract/decisionEvidence.ts` (new) | Answers to `Evidence[]`: gate check, 0.7/0.3 noul bands, expected value over probabilities, SD from `sharpness` and photo flags, category filter, and which images need label OCR. |
| `src/rubric.ts` | Add `CAPS` (red-flag ceilings), update `WEIGHTS` to Part 2.4, add capture prompts for the new shots. |
| `src/scorer.ts` | Apply caps: a dimension's mean and upper range cannot exceed its cap. Each applied cap is reported as an `against` reason. |
| `src/longevity.ts` (new) | Failure modes per category, multipliers from evidence keys and label facts, weakest-link lifespan range, weakest mode, care tip, repairability. |
| `src/extract/reviews.ts` | Detect failure reports with a time ("pilled after two washes") and emit longevity evidence. |
| `src/pipeline.ts` | Route by provider kind, run the label OCR step for flagged images, call `longevity()`, fill the new fields. A failed OCR call adds a warning and never fails the assessment. |
| `src/types.ts` | `Assessment` gains `longevity` and `repairability`. `EvidenceSource` image entries gain an optional `question` id. `CAPTURE_KINDS` gains `fabric_with_coin` and `seam_outside` if the probes show the existing kinds aren't enough. |
| `src/vision/factory.ts`, `.env.example` | `SEAMWISE_PROVIDER=gemini-decisions | clef | clef-flash | jev`, plus `SEAMWISE_DECISION_MODEL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN`, `AIMLAPI_KEY`, `SEAMWISE_OCR_PROVIDER`. |
| `docs/openapi.yaml`, `ios/SeamwiseClient.swift` | New `longevity` and `repairability` fields, optional so old clients keep decoding. |
| `backtest/` | `decisions-probe.ts` gains `--provider` and `--bank`. New `bench.ts` runs the benchmarks from Part 3 of the rubric. |

## Phases

Each phase ends with `npm test`, `npm run typecheck` and `npm run backtest` passing. No phase needs a network call in its unit tests.

### Phase 1: question bank and Gemini path

Build:
1. `bank.ts` with sections 1.0–1.5, 1.7 and 1.10 of the rubric (gates, fabric, stitching, seams, edges, hardware, label questions).
2. `decision.ts` and the Gemini adapter.
3. `decisionEvidence.ts`.
4. Factory entry `gemini-decisions`, plus routing in `pipeline.ts`.

Unit tests (`test/bank.test.ts`, `test/decision.test.ts`, `test/decisionEvidence.test.ts`):
- **Bank integrity:** ids are unique; every `gate` names an existing noul; every choice has 2–255 options and every score 2–10 levels; every value is 0–100; every category named exists; no option name is positional (`a`, `option_1`); the bank snapshot matches `BANK_VERSION` (a wording change without a version bump fails).
- **Request building:** for a fake image, the payload sent to the adapter matches a stored snapshot. Clef batching splits at 64 and keeps every question exactly once.
- **Error mapping:** 401/403 is not retryable; 404 names the model; 429 and 5xx are retryable. A failed call raises `VisionError` and is never read as an answer.
- **Answer mapping (table-driven):**
  - gate 0.69 gives no evidence from that section; gate 0.71 does
  - noul 0.5 gives no evidence; 0.8 counts as yes; 0.2 counts as no
  - expected value: a choice split 0.5/0.5 between values 80 and 20 gives 50
  - a score whose probabilities have two peaks gets a wider SD than a single peak with the same mean
  - `sharpness` 3 with a coin present gives a smaller SD than `sharpness` 1
  - `is_render` ≥ 0.7 widens the SD of every item from that image
  - denim questions produce nothing for a tee
- **Contract fixtures:** one recorded real response per provider in `test/fixtures/decisions/`. The parser must accept it. `backtest/record-fixtures.ts` re-records them (manual, uses keys).

Live check (manual, free tier, retailer photos only): run the probe with `--bank` on the 45 retailer products. Look at individual answers, not only totals.

Exit: `SEAMWISE_PROVIDER=gemini-decisions npm start` grades a garment from photos end to end. The old providers still pass their tests.

### Phase 2: scoring changes

Build: `CAPS` and their application in `score()`, new `WEIGHTS`, label OCR routing (`SEAMWISE_OCR_PROVIDER`, default `gemini`).

Tests:
- A cap lowers both the mean and the upper bound, never raises them, and shows up as an `against` reason.
- Two caps on the same dimension: the lower one wins.
- Weights per category sum to 1. Without hardware evidence, the hardware weight moves to construction.
- OCR runs only for images whose `vis_label_text` ≥ 0.7. When OCR fails, the assessment still completes with a warning.
- The golden backtest (`backtest/golden.ts`) still passes. Any golden case that changes is updated in the same change, with a one-line reason in the case.

### Phase 3: benchmark data and tuning (needs you)

Collect:
- **B2 truth set:** 30 garments you own, mixed categories and price tiers, 5 phone shots each (the Part 4 shots). Garments only: no people, faces or personal details.
- Label each photo in `data/benchmarks/b2/labels.json`, keyed by file name and question id. Only label what you are sure of, and label gates too ("seam inside not visible"). A small labelling page could speed this up; decide after labelling the first 5 garments by hand.
- **B5 repeatability:** 5 of those garments shot 5 times each, with different light, angle and, if possible, phone.

Run `npm run bench -- b2 b4 b5`:
- B2: per-question accuracy and over-claim rate.
- B4: calibration error per question type.
- B5: SD of the overall score across repeated shots.

Tune: reword or split questions that fail, in the bank only, with a version bump. Tune values and caps on B3 later, never on B2 single garments. Hold out 10 of the 30 garments that are never used for tuning, and report results on them.

Exit: B2 accuracy ≥ 80% and over-claim ≤ 5% on the held-out garments; B5 SD ≤ 5 points.

### Phase 4: longevity and repairability

Build: `longevity.ts`, the 7 new `lg_*` questions in the bank, review failure mining, the API and iOS fields.

Tests (`test/longevity.test.ts`):
- For each category, a garment with no evidence returns the base modes and the widest range, labelled as low confidence.
- A single strong factor changes the right mode: 8% elastane shortens the tee's neck-rib life; acrylic shortens knitwear pilling life; long-staple cotton lengthens tee pilling life.
- The weakest mode reported is the one with the shortest life, and its care tip matches it.
- Repairability: bonded seams or a coated shell give "Hard to repair"; spare button, sewn seams and deep hems give "Easy".
- Review mining, table-driven: "pilled after two washes" gives pilling, early; "neck stretched out after a month" gives neck rib, early; "still going strong after 3 years" counts as survival; "pills on the menu" gives nothing.
- API test: `longevity` and `repairability` are present, and an old client fixture without those fields still decodes.

Exit: the API returns a lifespan range, weakest point, care tip and repair rating. The ranges are labelled as estimates until B7 data exists.

### Phase 5: other providers

Build the Clef and Jev adapters (Jev optional, since signups are paused). Run B1 and B2 across providers (benchmark B8).

Tests: the same adapter test suite runs against each adapter (shared test helper). Clef rejects oversized images with a clear error before sending.

Exit: a comparison table in `docs/benchmarks.md` (accuracy, over-claim, calibration, median latency, cost per garment). The default provider is the cheapest one within 3 points of the best.

### Phase 6: everyday experience and next-best photo

Build: the Part 4 output (grade, three reasons each tied to a photo, one next check), wording rules, capture prompts for each section gate.

Tests:
- Each reason names the image it came from.
- A section whose gate said "not visible" produces "Couldn't see …", never a claim.
- `nextBestEvidence` asks for the inside seam when construction is the widest dimension and no seam gate passed.
- The prompt order follows expected range reduction, so a garment already graded with high confidence asks for nothing more.

### Phase 7: long-running ground truth (start early)

| Benchmark | What you need | When to start |
|---|---|---|
| B3 expert ranking | A garment technologist or designer, 20 pairs, about 2 hours | After Phase 2 |
| B6 measured specs | Kitchen scale, ruler, light meter app, the B2 garments | With Phase 3 |
| B7 wear test | 20 tees across price tiers, 20 wash-and-wear cycles, about 10 weeks | Buy and score them in week 1 so the clock starts |
| B9 logo-masked tier | Blur logos on the retailer photos | Any time |
| B10, B11 longevity | B7 results plus review failure reports | After B7 ends |

## Testing layers

| Layer | Runs | Network | What it guards |
|---|---|---|---|
| Unit (vitest) | Every change, `npm test` | Never | Bank integrity, request building, answer-to-evidence maths, caps, longevity, API shape |
| Contract fixtures | Every change | Never (recorded) | Each provider's real response shape still parses |
| Golden backtest | Every change, `npm run backtest` | Never | End-to-end grades on the existing golden cases |
| Live probe | Manually, after bank or provider changes | Yes, cost-bounded | Answers on real photos, read one by one |
| Benchmarks | Per milestone, `npm run bench` | Yes | Accuracy, over-claim, calibration, repeatability, agreement with experts |

Rules for every benchmark run:
- Record the provider, model ID, `BANK_VERSION` and date with each result in `docs/benchmarks.md`.
- Keep the held-out set out of tuning.
- No test asserts an exact probability. Tests assert bands and orderings.
- A wording change that improves one question but drops another by more than 3 points is not accepted.

## Order and size

| Phase | Depends on | Rough size |
|---|---|---|
| 1 Bank and Gemini path | – | Large: about 600 lines including tests |
| 2 Scoring changes | 1 | Small |
| 3 Benchmark data | 1, your photos | Mostly your time: about 3–4 hours of shooting and labelling |
| 4 Longevity | 1 | Medium |
| 5 Other providers | 1, keys | Small per adapter |
| 6 Everyday output | 2, 3 | Medium |
| 7 Long-running ground truth | 2 | Your time over weeks |

Phases 2, 4 and 5 can run in parallel once Phase 1 lands; they touch different files.

## Open decisions

- **Retire `VisionReport`?** Keep it until Phase 5 shows whether a generative model is still needed for anything besides label OCR.
- **Paid tier.** The free Gemini tier may use inputs for training. B2 photos are your own garments, which is fine; real users' photos need a paid key before launch.
- **Labelling tool.** Hand-edited JSON is fine for 30 garments. Build a page only if labelling turns out to be the bottleneck.
