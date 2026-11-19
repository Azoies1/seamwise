# 3. Red-flag caps in the grade; longevity reported separately

Date: 2026-11-19
Status: Proposed

## Context

The scorer averages evidence with uncertainty, which lets one severe defect be averaged away: raw seams with excellent fabric could still grade "Good". Users also ask how long a garment will last, and garments with the same grade can age very differently.

## Decision

- **Caps.** `CAPS` in `src/rubric.ts` lists findings with a ceiling on one dimension. For example, raw seam edges cap construction at 35, and skipped stitches or a failed seam cap it at 40. `score()` applies caps after combining evidence. A cap lowers the mean and upper bound, never raises them, and the lowest cap wins. A cap fires only on a confident observation: gate ≥ 0.7 and the answer ≥ 0.7. Each applied cap shows as an `against` reason.
- **Longevity.** `src/longevity.ts` uses a weakest-link model. Each category has failure modes (for a tee: neck rib, pilling, twisting, shrinkage, print, seams, fading). Each mode has a base life in washes, and evidence from photos, labels and review failure reports multiplies it. The predicted lifespan is the shortest mode, which is also reported as the weakest point, with a care tip.
- **Repairability** is a separate rating (Easy, Repairable, Hard).
- Both are new optional `Assessment` fields and don't change the grade. Lifespans are shown as wide ranges labelled as estimates until the wear test (B7) or follow-up data calibrates them.

## Consequences

- Grades match how experts treat serious defects. The scorer is no longer purely probabilistic, so a false observation that triggers a cap does more harm; the confidence trigger and the B2 over-claim rate keep that in check.
- Users learn what will fail first and how to delay it.
- Longevity multipliers start as estimates. Fixed multipliers are a shortcut until a few hundred survival records allow fitted curves.

## Alternatives considered

Very low values instead of caps (still averaged with good evidence). No caps (flawed garments grade as acceptable). Longevity folded into the grade (hides what will fail first). A single lifespan with no failure modes (no care advice).
