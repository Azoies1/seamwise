# 7. The question bank is versioned data in one module

Date: 2026-11-19
Status: Proposed

## Context

The wording of questions, options, levels and values is what gets audited and tuned most. A small wording change can move answers across many garments, so benchmark results only mean something when the exact bank version is known.

## Decision

- All questions live in `src/vision/bank.ts` as data. Each entry has: id, type, question text, options or levels with their values, gate, dimension, categories, section.
- The module exports `BANK_VERSION`. A test compares a snapshot of the bank with the version, so a wording change without a version bump fails.
- Every benchmark result and every assessment records the provider, model ID and `BANK_VERSION`.
- Option names describe their content (`flat_felled`, never `a` or `option_1`), because option names are sent to the model.

## Consequences

- One file to review for any change in what the model is asked.
- Any result can be reproduced against the exact wording that produced it.
- A version bump on every wording change is a small amount of friction, on purpose.

## Alternatives considered

- **Questions inline in each adapter or extractor.** Spreads the wording across files and makes audits hard.
- **Questions in JSON or YAML outside the code.** Loses type checking against `Dimension` and `Category`.
