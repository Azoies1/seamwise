# 4. Benchmark-driven tuning and photo data policy

Date: 2026-11-19
Status: Proposed

## Context

Bank wording, values, caps, thresholds and longevity multipliers can all be tuned, and tuning on a few garments overfits them. Free tiers may use inputs for training, and users' photos can include faces, rooms and personal details.

## Decision

- **Benchmarks.** Accuracy is measured with B1–B11 from `docs/quality-rubric.md`, run with `npm run bench`. Questions are tuned on B2 (observation accuracy, over-claim rate). Values and caps are tuned on B3 (expert rankings). Nothing is tuned on single garments.
- **Held-out set.** 10 of the 30 B2 garments are never used for tuning, and pass bars are judged on them. A wording change that drops another question by more than 3 points is rejected.
- **Traceability.** Every result in `docs/benchmarks.md` records the provider, model ID, `BANK_VERSION` and date.
- **Tests.** Unit tests never call the network and assert bands and orderings, never exact probabilities. Each provider has a recorded response fixture. Live probes and benchmarks run by hand, never in `npm test`.
- **Photo policy.** Free tiers receive only public retailer images and garment-only photos with no people or personal details. Real users' photos go only to paid tiers whose terms exclude training on inputs, before any public launch. API keys stay on the server.

## Consequences

- Reported accuracy reflects garments the system was not tuned on.
- Benchmarks need the owner's time: about 3–4 hours of photos and labelling, plus an expert session.
- The test suite stays fast, free and deterministic.
- Launch depends on a paid key. Self-hosting Clef's open weights is the fallback if provider terms are unacceptable.

## Alternatives considered

Tune by eye on photos at hand (results can't be trusted). Live API calls in CI (costly, flaky).
