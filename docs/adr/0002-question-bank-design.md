# 2. The model observes, code judges: question bank design

Date: 2026-11-19
Status: Proposed

## Context

"Is this high quality?" mixes many judgments into one number that can't be explained, tested or tuned. A choice question also always picks an option, even when the seam isn't in the photo. A wrong observation is worse than a missing one, because the scorer treats it as fact.

## Decision

- **Observations only.** Each question asks about one thing a person could point at ("Are the stitches evenly spaced?"). No question asks for a verdict on quality, value or lifespan. Questions joined by "or" are split, and score levels are written as situations that read on their own. Values, weights, caps and grades live in code.
- **Visibility gates.** Each section has a yes/no gate ("Is the inside of a seam visible?"). The section counts only when the gate is ≥ 0.7. Otherwise it is not seen, which is no evidence rather than bad evidence. This replaces the `not_visible` options.
- **Thresholds.** Yes at ≥ 0.7, no at ≤ 0.3, unknown in between. Choice and score answers use the expected value over all options, and a split score distribution widens the uncertainty. Thresholds change only on benchmark evidence (B2, B4).
- **Ask everything, read what applies.** The whole bank is sent for each image; code ignores closed gates and other categories.
- **One versioned module.** All questions live in `src/vision/bank.ts` with `BANK_VERSION`. A snapshot test fails on any wording change without a version bump. Option names describe their content, never `a` or `option_1`.

## Consequences

- Every point of the grade traces to a named observation on a named photo.
- Over-claiming is measurable against the gates.
- The bank is large (about 150 questions), which decision models handle cheaply.
- Rubric values become the main lever on accuracy and need expert review (B3).

## Alternatives considered

Ask for a grade directly, or broad questions per dimension (verdicts that can't be tested). A `not_visible` option per question (mixes two judgments). Use the `confidence` field as the gate (it measures spread, not visibility). Gates in a first call and sections in a second (doubles latency).
