# 1. Record architecture decisions

Date: 2026-11-19
Status: Accepted

## Context

Seamwise is moving from a single generative checklist to decision models, a large question bank, caps and a longevity model. These choices are hard to reverse, and the reasons behind them will matter when results come in.

## Decision

Record each significant decision as a short ADR in `docs/adr/`, numbered in order, using the format: Context, Decision, Consequences, Alternatives considered.

- A new ADR starts as **Proposed**. It becomes **Accepted** when the project owner agrees.
- An ADR is never edited to change its decision. A new ADR **supersedes** it, and the old one's status links to the new one.
- Plans (`docs/*-plan.md`) describe how and when; ADRs describe what was decided and why.

## Consequences

- Each decision has one place that explains it.
- Benchmark results that overturn a decision lead to a new ADR, not a silent change.
