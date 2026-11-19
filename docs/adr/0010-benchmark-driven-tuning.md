# 10. Tune only on benchmarks, with a held-out set

Date: 2026-11-19
Status: Proposed

## Context

The bank wording, values, caps, thresholds and longevity multipliers can all be tuned. Tuning them on a few garments tends to fit those garments and break on new ones (TypeSafe calls wording written to force a particular answer "prompt gymnastics").

## Decision

- Accuracy is measured with the benchmarks in `docs/quality-rubric.md` (B1–B11), run with `npm run bench`.
- **Held-out set:** 10 of the 30 B2 garments are never used for tuning. Pass bars are judged on them.
- Questions are tuned on B2 (observation accuracy and over-claim rate). Values and caps are tuned on B3 (agreement with expert rankings). Neither is tuned on single garments.
- A wording change that improves one question but drops another by more than 3 points is rejected.
- Every result in `docs/benchmarks.md` records the provider, model ID, `BANK_VERSION` and date.
- **Test rules:** unit tests never call the network; they assert bands and orderings, never an exact probability. Each provider's real response shape is covered by a recorded fixture. Live probes and benchmarks are run by hand and are never part of `npm test`.

## Consequences

- Reported accuracy reflects garments the system was not tuned on.
- Changes need benchmark data, which needs photo collection and labelling (about 3–4 hours of the owner's time for B2 and B5) and an expert session for B3.
- The test suite stays fast, free and deterministic.

## Alternatives considered

- **Tune by eye on whatever photos are at hand.** Fast, but the results can't be trusted.
- **Run live API calls in CI.** Costs money, is flaky, and depends on provider load.
