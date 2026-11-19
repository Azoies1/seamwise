# 8. Red-flag findings cap a dimension's score

Date: 2026-11-19
Status: Proposed

## Context

The scorer combines evidence as a weighted average with uncertainty. That works well for many moderate signals, but it lets one severe defect get averaged away: a garment with raw, unfinished seams and excellent fabric could still grade "Good". A garment technologist would not accept that.

## Decision

- Add `CAPS` to `src/rubric.ts`: a list of findings, each with a ceiling for one dimension. For example, raw seam edges cap construction at 35, and skipped stitches or a failed seam cap it at 40.
- `score()` applies caps after combining evidence. A cap lowers both the dimension's mean and its upper bound, and never raises anything. When two caps hit the same dimension, the lower one wins.
- Each applied cap appears as an `against` reason, naming the finding and the photo.
- A cap only fires on a confident observation: a gate ≥ 0.7, plus a yes ≥ 0.7 or a top choice with probability ≥ 0.7.

## Consequences

- The grade matches how experts treat serious defects.
- The scorer stops being purely probabilistic, which needs explaining in code and in its tests.
- A false observation that triggers a cap does more harm than an ordinary wrong answer. The high-confidence trigger and the B2 over-claim rate keep that in check.

## Alternatives considered

- **Very low values with small uncertainty instead of caps.** Gets close, but still averages with strong evidence elsewhere, and the result depends on how much other evidence there is.
- **No caps.** Simpler, but it grades obviously flawed garments as acceptable.
