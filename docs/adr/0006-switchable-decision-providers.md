# 6. Switchable decision providers behind one adapter interface

Date: 2026-11-19
Status: Proposed

## Context

Three decision models are available, each with trade-offs:

| Provider | Strengths | Limits |
|---|---|---|
| Gemini Decision 1 | Works with the existing key and SDK, up to 1,000 questions per call, free tier | Closed model; the free tier may use inputs for training |
| Cloudflare Clef / Clef-flash | Open weights (Apache 2.0), cheap, Jev-compatible API | 64 questions and 4 images per call; large images fail in practice (about 1024 px wide works) |
| TypeSafe Jev 1.14 | Box questions that locate regions | Image input marked experimental; new signups paused, so access is through AIML API |

None has been compared on garment photos yet.

## Decision

- Define one `DecisionAdapter` interface (`ask(image, questions) -> answers`), with an adapter of about 40 lines per provider. `DecisionVision` handles batching and error mapping once.
- Select the provider with `SEAMWISE_PROVIDER` (`gemini-decisions`, `clef`, `clef-flash`, `jev`), with credentials in `.env`. Existing values (`gemini`, `anthropic`) keep working.
- The default is `gemini-decisions` until benchmark B8 picks the cheapest provider within 3 points of the best.
- The same adapter test suite runs against every adapter, and each has a recorded real response as a contract fixture.
- Jev is optional because of its access and maturity limits.

## Consequences

- Switching provider is a config change, so benchmark comparisons need no code changes.
- Providers with different limits (questions per call) are handled once, in `DecisionVision`.
- More credentials to manage. Missing credentials make the factory return no provider, and the service already handles that by scoring without photos.

## Alternatives considered

- **Gemini only.** Simplest, but no fallback when the model is overloaded and no way to compare.
- **A third-party gateway (AIML API, Vercel AI Gateway) for all three.** One key, but an extra hop, extra cost, and image support that varies by route.
