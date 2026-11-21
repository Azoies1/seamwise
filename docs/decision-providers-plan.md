# Plan: decision-model vision providers

Status: proposal, 2026-11-18. Phase 1 built 2026-11-21 on the `letsdecide` library (see "Built" below). Probe script in `backtest/decisions-probe.ts`.

## Verdict

Yes, run the checklist on decision models. They fit the checklist better than generative models do.

- Every checklist item in `src/vision/schema.ts` is a closed enum with a `not_visible` option. That is exactly a decision model's `choice` question.
- Decision models return a probability for every option and a confidence score. Today the scorer gets one hard answer per item. With probabilities, `Belief` can weight evidence by how sure the model was, and `not_visible` becomes a measured probability rather than a judgement the model makes in prose.
- No JSON parsing, no schema drift and no output tokens. The answer can only be one of the listed options.
- Gemini Decision 1 claims 150–250 ms per call for text. The probe measured a median of 2.8 s for up to 4 photos on the free tier (worst case 34 s), against about 48 s per photo for `gemini-3.5-flash`.

The gap: decision models cannot transcribe text. The label fields (`label.composition`, `origin_country`, `brand_text`, `hardware_brand_text`) need OCR. Keep a generative provider for those, and call it only when a label is in the shot.

## Providers

| Provider | Model IDs | Images | Questions per call | Input price per 1M tokens | Status |
|---|---|---|---|---|---|
| Gemini Decisions | `gemini-decision-1` | Yes, base64 `data` or `uri` | 1,000 | $0.10, free tier | Released Nov 11, 2026. Works with the existing `GEMINI_API_KEY` via `@google/genai` 3.5 `client.decisions.create(...)`, which needs `api_version: "v1beta"`. |
| Cloudflare Clef | `@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash` | Up to 4, base64 data URL, about 1024 px wide in practice | 64 | $0.24 (Clef), $0.09 (flash), 10k free Neurons/day | Open weights (Apache 2.0). REST `POST /client/v4/accounts/{id}/ai/run/@cf/cloudflare/clef`. Image calls reported at 13–30 s on launch day. |
| TypeSafe Jev | `jev-1.14.0` | Base64 in an `assets` map, referenced by key in the instructions | No stated limit | About $0.042 native | Image input and `box` questions are marked experimental, not production-ready. New TypeSafe signups paused since Sept 22, so access is through AIML API (`POST https://api.aimlapi.com/v1/decisions`, model `typesafe/jev-1.14`). |

All three share the same question types (`noul` = yes/no probability, `choice`, `score`) and nearly the same answer shape (`choice`, `probabilities`, `confidence`). Clef says it is Jev-API compatible. Jev alone adds `box` (a bounding box), which could locate the care label or a seam for a follow-up crop.

## Design

Keep the `VisionProvider` interface (`analyze(images) -> VisionReport`). The scorer, server and tests stay unchanged in phase 1.

1. **`src/vision/questions.ts`** builds the decision questions from `ImageChecklistSchema`. The zod enum gives the options and `.describe()` gives the instructions, so the schema stays the single source of truth. That gives about 16 choice questions plus `shot_type`, `image_quality` and `garment_category`. All three providers fit them in one call.
2. **`src/vision/decision.ts`** holds a `DecisionVision` class that takes a small adapter (`ask(images, questions) -> answers`). It sends one call per image, because the report needs one entry per image and Clef caps a call at 4 images. It turns answers into a checklist entry: take the top option, but use `not_visible` when confidence is below a threshold (`SEAMWISE_DECISION_MIN_CONFIDENCE`, default 0.6, tuned by the backtest). Label text fields stay empty.
3. **Adapters**, each about 30 lines:
   - `GeminiDecisionAdapter` uses the SDK that is already installed.
   - `ClefAdapter` uses `fetch` against the REST API. Images over the size limit are rejected with a clear `VisionError` rather than resized. Resizing would need an image library such as `sharp`; decide on that only if Clef wins the backtest.
   - `JevAdapter` uses `fetch` against AIML API. It puts images in `assets` and references them as `` `img0` `` in the instructions.
4. **`HybridVision`** runs the decision provider first. When an image comes back as `care_label` or `brand_label` with p ≥ 0.5, it sends only that image to the generative provider (`GeminiVision` or `AnthropicVision`) to fill the label fields.
5. **Factory.** `SEAMWISE_PROVIDER` gains `gemini-decisions`, `clef`, `clef-flash`, `jev` and `hybrid`. New env vars: `SEAMWISE_DECISION_MODEL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AUTH_TOKEN`, `AIMLAPI_KEY`. `.env.example` documents them. When nothing is set, the current behaviour stays: Anthropic first, then Gemini.

Phase 2, after the backtest shows the probabilities are calibrated: add optional `probabilities` per item to `VisionReport`, and let the scorer use the expected value instead of the top answer. This is also what the "next best photo" idea needs: ask for the shot that would cut the remaining uncertainty most.

## Experiments

1. **Fibre and price tier from retailer photos** (`backtest/decisions-probe.ts`, done for Gemini). Ground truth is the scraped JSON. Results are below.
2. **Same probe on Clef and Jev**, once keys exist. Compare accuracy, confidence calibration, latency and cost per product.
3. **Checklist agreement.** Run `GeminiVision` and `DecisionVision` on the same photos. Where they disagree, check by eye which one is right.
4. **Calibration.** Bucket answers by confidence and check that 0.8-confidence answers are right about 80% of the time. If they are, phase 2 can use the probabilities directly.
5. **Phone photos.** Garments you own: care label, inside seam, fabric macro, and backlit fabric next to a coin. This is the real target. Retailer photos are studio shots and over-represent cotton tees.

## Results: experiment 1 (Gemini Decision 1)

See the run log in `backtest/out/decisions-probe.log`.

Run 2026-11-18: 45 products with photos, up to 4 retailer photos each, 0 failures. Median 2.8 s per product.

| Question | Score | Baseline |
|---|---|---|
| Dominant fibre | 40/44 (91%) after the parser fix (34/38 before) | Always guessing "cotton" scores 38/44 (86%) |
| Dominant fibre, confidence ≥ 0.8 | 17/17 (100%) | All 17 were cotton |
| Contains synthetic (yes/no, p ≥ 0.5) | 41/45 (91%) | |
| Price tier, exact | 22/45 (49%) | |
| Price tier, high (premium/luxury) vs low | 41/45 (91%) | Likely helped by logos |

By true fibre: cotton 37/38, polyester 2/3, linen 1/2, acrylic 0/1.

What it means:

- **Confidence is informative.** Every wrong fibre answer had confidence ≤ 0.71, and most were below 0.45. Every answer at 0.8 or above was right. This supports the threshold design and phase 2.
- **Accuracy is barely above the baseline.** The dataset is almost all cotton, so it cannot yet show whether the model tells fibres apart. The misses were the harder cases: a polyester fleece read as wool, an acrylic sweater read as viscose, and 50/50 or 55/45 cotton-linen blends where either answer is defensible.
- **Budget items get read as mid-market.** 12 of 19 budget items were rated mid or premium. Studio photography flatters cheap garments, which is another reason to target phone photos.
- **Parser gap found and fixed (2026-11-19).** `parseComposition` returned nothing for "Cotton 100%" (fibre before percent), so 6 H&M and Gap products had no ground truth. It now falls back to fibre-first order. The model had answered cotton for all 6, which is correct.

Next: add non-cotton products to the scrape (wool, polyester, viscose, blends), and run the same probe on Clef.

## Built (2026-11-21): phase 1 on letsdecide

The three adapters are not hand-written: every decision call goes through the published [`letsdecide`](https://www.npmjs.com/package/letsdecide) 0.3.0 library (`src/vision/decisions.ts`). It builds each provider's request (Gemini typed blocks, Clef data URLs, Jev assets) and checks each reply, so switching provider is a `"provider/model"` string. Jev through AIML API is a letsdecide dialect (`aiml/typesafe/jev-1.14`).

- `src/vision/questions.ts` derives 16 choice questions, 4 photo-flag yes/no questions and `garment_category` (21 in all, under Clef's 64) from the zod schema.
- `src/vision/decision.ts` (`DecisionVision`) sends one call per image, falls back to `not_visible` below `SEAMWISE_DECISION_MIN_CONFIDENCE` (default 0.6), sets flags at p ≥ 0.5, and sums category probabilities across images.
- `SEAMWISE_PROVIDER` takes `gemini-decisions`, `clef`, `clef-flash`, `jev` and `decisions` (any `SEAMWISE_DECISION_MODEL`). Unset, the generative default is unchanged.
- The probe now runs on letsdecide too, with its `retry` middleware for free-tier 429s.

Verified live on `gemini-decision-1` (2026-11-21): a full `POST /v1/assessments` with two retailer photos (1.1 s, `vision.status: analyzed`), and the probe re-run on all 45 products with 0 failures: dominant fibre 39/44, 10/10 right at confidence ≥ 0.8, synthetic 42/45, price tier 20/45 exact and 38/45 high vs low, median 1.6 s per product, $0.018 estimated in total. That is within noise of the 2026-11-18 direct-SDK run. Not verified: Clef and Jev (no keys here), and checklist accuracy on real phone photos (experiment 3).

Node note: Node's built-in `fetch` ignores `HTTPS_PROXY`. Behind a proxy, run with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

Still open: `HybridVision` for label OCR, `backtest/vision.ts --provider`, and the ADR 0002 question bank with visibility gates, which would replace the schema-derived questions.

## Risks

- **Retailer photos are a biased test.** Most products are 100% cotton tees, so "always cotton" already scores well. Report the scores per fibre, not only overall.
- **The price tier leaks through logos and styling** even when the instructions say to ignore them. Treat it as a curiosity, not a quality measure.
- **Free-tier privacy.** Google may use free-tier inputs. Retailer photos are public, but phone photos of real users must not go through the free tier.
- **Jev access.** Signups are paused and image input is experimental. Treat it as optional.
- **Clef image limits.** Large photos fail. Either resize on the phone before upload (the iOS client already controls capture) or add `sharp`.

## Tasks

- [x] `questions.ts`: derive questions from the schema, plus a test that every enum maps
- [x] `decision.ts`: `DecisionVision`, the confidence threshold, and a test with a fake adapter
- [x] Gemini Decisions adapter (letsdecide `gemini/*`)
- [x] Clef adapter (letsdecide `clef/*`; not yet called live)
- [x] Jev adapter (letsdecide `aiml/*` dialect and `jev/*`; not yet called live)
- [ ] `HybridVision` for label OCR
- [x] Factory and `.env.example` entries, plus a test for provider selection
- [ ] `backtest/vision.ts`: accept `--provider` so the same photos can be compared across providers
- [ ] Experiments 2–5
