# 5. Decision answers become evidence directly; generative models read labels

Date: 2026-11-19
Status: Proposed

## Context

The pipeline today is: vision provider, then `VisionReport` (16 hard answers), then `extractVision` in `src/extract/visionEvidence.ts`, then `Evidence[]`, then `score()`.

The new bank has about 150 questions with probabilities. Forcing them into `VisionReport` would drop the probabilities and most of the questions.

Decision models cannot transcribe text, so they cannot read a care label's composition, origin or RN number.

## Decision

- Add a second path: decision provider, then answers, then `extractDecisions` in `src/extract/decisionEvidence.ts`, then `Evidence[]`. Both paths end in the same `Evidence` type, so `score()`, `nextBestEvidence()`, the API and the iOS client are unchanged.
- The pipeline chooses the path by provider kind.
- **Hybrid label reading:** when an image's `vis_label_text` gate is ≥ 0.7, send only that image to the generative provider (`SEAMWISE_OCR_PROVIDER`, default `gemini`). The text goes through the existing `parseComposition`. If that call fails, the assessment completes with a warning.
- Keep `VisionReport` and the generative checklist path until benchmark B8 shows whether they are still needed for anything besides labels. Retiring them will be a new ADR.

## Consequences

- The scorer gains probability-weighted evidence with no change to its interface.
- `EvidenceSource` for images gains an optional question id, so every reason can name both its question and its photo.
- Two extraction modules to maintain for now.
- Label reading still depends on a slower generative call, but only for label photos.

## Alternatives considered

- **Extend `VisionReport` to hold probabilities.** A large schema change for a structure the decision path doesn't need.
- **OCR with a dedicated OCR library.** Care labels are small, curved, multilingual and often printed on satin. A vision model handles them better. Revisit if cost matters.
- **Skip label reading.** Composition is one of the strongest fabric signals, so this was rejected.
