# 9. Longevity and repairability are reported separately from the grade

Date: 2026-11-19
Status: Proposed

## Context

Users want to know how long a garment will last and what will fail first. The `durability` dimension feeds the grade, but garments with the same grade can age very differently: a well-made linen shirt and a well-made fleece wear out in different ways and at different rates.

## Decision

- Add `src/longevity.ts`, which uses a **weakest-link** model. Each category has failure modes (for a tee: neck rib stretches, pilling, twisting, shrinking, print cracking, seam opening, fading). Each mode has a base life in wear-and-wash cycles. Evidence from photos, labels and reviews multiplies each mode's life. The predicted lifespan is the shortest mode's life, and that mode is reported as the weakest point, with a care tip chosen for it.
- **Repairability** is a separate rating (Easy, Repairable, Hard), based on sewn-on buttons, replaceable zippers, stitched rather than bonded seams, and spare seam or hem fabric.
- Both are new optional fields on `Assessment` (`longevity`, `repairability`). Neither changes the grade.
- Lifespans are shown as wide ranges and labelled as estimates until benchmark B7 (the wear test) or follow-up survival data calibrates them.
- Failure reports in reviews ("pilled after two washes") become longevity evidence through `extractReviews`.

## Consequences

- The user gets an answer to "how long will this last?" plus one actionable care tip.
- The base lives and multipliers start as estimates. Fixed multipliers are a shortcut; replace them with fitted survival curves once there are a few hundred records.
- Two more fields for the API, OpenAPI spec and iOS client. They are optional, so old clients keep working.

## Alternatives considered

- **Fold longevity into the grade.** Hides the most useful information (what will fail first) inside one number.
- **One overall lifespan with no failure modes.** Can't say what to watch or how to care for the garment.
- **Wait for data before shipping anything.** Ranges labelled as estimates are still useful, and shipping them is what produces the follow-up data.
