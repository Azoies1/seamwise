# 3. The model observes, code judges

Date: 2026-11-19
Status: Proposed

## Context

A question like "Is this garment high quality?" mixes many judgments into one number that cannot be explained, tested or tuned. The existing scorer already works this way for the checklist: the model never grades, and `src/rubric.ts` holds the values.

## Decision

- Every question in the bank asks about **one observable thing** a person could point at in the photo ("Are the stitches evenly spaced?"). No question asks for a verdict on quality, value or lifespan.
- Questions joined by "or" or "and" are split. Direction and magnitude are separate questions.
- Score levels are written as situations that read on their own.
- All values, weights, caps and the grade boundaries live in code (`src/rubric.ts`, `src/longevity.ts`), where they are visible, reviewable and covered by tests.

## Consequences

- Every point of the grade traces back to a named observation on a named photo, which is what the user-facing reasons need.
- Values can be retuned from benchmark results without touching the questions, and the reverse.
- The bank becomes large (about 150 questions). That is acceptable, because decision models answer many questions in one call at little extra cost.
- The quality of the rubric (values and caps) becomes the main lever on accuracy, so it needs expert review (benchmark B3).

## Alternatives considered

- **Ask for an overall grade directly.** Unexplainable and untestable, and it can't be tuned.
- **A few broad questions per dimension** ("How good is the construction?"). Fewer questions, but still verdicts, and the answers drift with wording.
