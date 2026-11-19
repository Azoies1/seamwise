# 1. Decision models for vision, behind switchable providers

Date: 2026-11-19
Status: Proposed

## Context

Today a generative model (`GeminiVision` or `AnthropicVision`) fills a 16-field JSON checklist. It is slow: about 48 s per photo on the Gemini free tier, plus a 503 error after about 100 s on `gemini-3.8-flash`. It gives one hard answer per item with no measure of certainty, and its output needs parsing.

Decision models answer typed questions (yes/no, choice, score) with a probability per option and no generated text. Three are available:

| Provider | Strengths | Limits |
|---|---|---|
| Gemini Decision 1 | Existing key and SDK, 1,000 questions per call, free tier | Free tier may use inputs for training |
| Cloudflare Clef / Clef-flash | Open weights, cheap, Jev-compatible API | 64 questions and 4 images per call; about 1024 px images in practice |
| TypeSafe Jev 1.14 | Box questions that locate regions | Image input experimental; signups paused |

A probe on 45 retailer products with `gemini-decision-1` had no failures, a median of 2.8 s per product, and no wrong fibre answer at confidence ≥ 0.8.

## Decision

- Use decision models for all visual observations: one image per call, with the whole applicable question bank.
- Answers become `Evidence` directly in a new `src/extract/decisionEvidence.ts`, keeping their probabilities. `score()`, the API and the iOS client are unchanged.
- Decision models can't transcribe text, so when a label is legible, only that image goes to a generative model (`SEAMWISE_OCR_PROVIDER`) to read the label. If that call fails, the assessment completes with a warning.
- Providers sit behind one `DecisionAdapter` interface, selected by `SEAMWISE_PROVIDER` (`gemini-decisions`, `clef`, `clef-flash`, `jev`). The default is `gemini-decisions` until benchmark B8 picks the cheapest provider within 3 points of the best. Jev is optional.
- The generative checklist (`VisionReport`) stays until B8 shows whether it's still needed beyond labels.

## Consequences

- Faster and cheaper, with calibrated probabilities available for scoring and next-best-photo.
- Switching provider is a config change.
- Accuracy beyond retailer cotton tees is unproven; B2 and B8 decide it.
- Two vision paths to maintain for now.

## Alternatives considered

Keep the generative checklist with retries (keeps the latency, no probabilities). Ask a generative model for probabilities (not calibrated). Train our own classifier (no labelled data yet).
