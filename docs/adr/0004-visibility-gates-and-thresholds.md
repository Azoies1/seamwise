# 4. Visibility gates and probability thresholds

Date: 2026-11-19
Status: Proposed

## Context

A decision model's choice question always picks an option, even when the seam is not in the photo. The current checklist handles this with a `not_visible` option on every item, which mixes "can I see it?" with "what does it look like?" in one answer.

A wrong observation is worse than a missing one, because the scorer treats it as fact.

## Decision

- Each section of the bank has a **gate**: a yes/no question asking whether that region is visible ("Is the inside of a seam visible in `photo`?"). The section's answers are read only when the gate's probability is ≥ 0.7. Below that, the section counts as not seen, which is no evidence rather than bad evidence.
- Yes/no answers count as **yes at ≥ 0.7** and **no at ≤ 0.3**. Between the two they count as unknown and produce no evidence.
- Choice and score answers use the **expected value** over all options' values, not only the top option. A score whose probabilities have two peaks gets a wider uncertainty.
- Every question in the bank is sent for each image, and code ignores what does not apply (gate closed, wrong category).
- Thresholds are starting values. They change only on benchmark evidence (B2 over-claim rate, B4 calibration), and the change is recorded.

## Consequences

- Over-claiming, meaning answers about things that weren't in the photo, can be measured directly against the gates (benchmark B2).
- Missing regions become a signal for the next-best-photo prompt.
- Sending every question wastes a few on irrelevant sections. That costs little, and avoids a second round trip.
- The thresholds are not tuned yet. They come from the TypeSafe guidance and need B4 to confirm.

## Alternatives considered

- **Keep a `not_visible` option per question.** TypeSafe's guidance says a separate yes/no question works better than a "none of the above" option. It also mixes two judgments.
- **Use the answer's `confidence` field as the gate.** Confidence measures how concentrated the distribution is, not whether the region is visible.
- **Two calls: gates first, then only the open sections.** Halves the questions but doubles latency.
