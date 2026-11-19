# Photos for the live vision back-test

Put real garment photos here (JPEG, PNG or WebP, under 5 MB each), then describe
what each one truly shows in `labels.json` in this folder:

```json
{
  "tee-label.jpg":   { "shot_type": "care_label", "label_composition": { "cotton": 100 } },
  "tee-seam.jpg":    { "seam_finish": "overlocked_neat", "stitch_regularity": "even", "loose_threads": "none" },
  "tee-flat.jpg":    { "seam_finish": "not_visible", "stitch_density": "not_visible" },
  "jacket-zip.jpg":  { "hardware_quality": "branded_premium" }
}
```

List only the items you are sure of. The allowed answers for each item are in
`src/vision/schema.ts`. Include some `"not_visible"` labels on whole-garment
shots: that is what catches the model claiming detail it cannot see.

A useful first set is 5 garments you own, 4 photos each: care label, inside
seam, fabric close-up, whole garment. Pick a mix of well-made and cheap ones.

Then, with `ANTHROPIC_API_KEY` set in `.env`:

    npm run backtest:vision

Photos in this folder are ignored by git.
