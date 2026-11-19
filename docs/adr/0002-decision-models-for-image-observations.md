# 2. Use decision models for image observations

Date: 2026-11-19
Status: Proposed

## Context

Today a generative model (`GeminiVision` or `AnthropicVision`) fills a 16-field JSON checklist for each request. Observed problems:

- Slow: about 48 s per photo on the Gemini free tier, and a 503 "high demand" error after about 100 s on `gemini-3.8-flash`.
- One hard answer per item, with no measure of how sure the model was.
- Output has to be parsed and re-validated against the schema.

Decision models (Gemini Decision 1, Cloudflare Clef, TypeSafe Jev) answer typed questions (yes/no, choice, score) with a probability for every option and no generated text. Every checklist item is already a closed set of options. A probe on 45 retailer products with `gemini-decision-1` (`backtest/decisions-probe.ts`) ran with no failures at a median of 2.8 s per product. Every fibre answer with confidence ≥ 0.8 was correct, and every wrong one had confidence ≤ 0.71.

## Decision

Use decision models for all visual observations. Send one image per call, with the whole applicable question bank for that image.

Keep a generative model only for what decision models cannot do: transcribing label text (see ADR 5).

## Consequences

- Probabilities per answer become available to the scorer (ADR 5) and to next-best-photo selection.
- Much faster and cheaper per image, with no parsing failures.
- One image per call keeps every answer traceable to a photo, and fits Clef's limit of 4 images per call.
- Accuracy beyond retailer cotton tees is unproven. The probe dataset was 86% cotton, so "always cotton" nearly matched it. Benchmarks B2 and B8 decide whether this holds.
- Two vision paths exist until the generative checklist is retired.

## Alternatives considered

- **Keep the generative checklist and add retries.** Keeps the latency and the missing probabilities.
- **Ask a generative model for probabilities in JSON.** Self-reported probabilities are not calibrated.
- **Train our own classifier.** No labelled data yet. Revisit once benchmark data exists.
