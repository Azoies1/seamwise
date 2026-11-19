/**
 * The fixed checklist the vision model answers for every image.
 * Every question has a "not_visible" answer, and the model is told to use it.
 * The model never outputs a grade or a score.
 */
import { z } from "zod";

export const SHOT_TYPES = [
  "full_garment", "on_model", "fabric_macro", "seam_interior", "care_label", "brand_label",
  "hardware_closeup", "backlit_fabric", "other_detail", "not_clothing",
] as const;

export const ImageChecklistSchema = z.object({
  image_index: z.number().int().describe("Zero-based index of the image this entry describes"),
  shot_type: z.enum(SHOT_TYPES),
  image_quality: z.enum(["good", "usable", "poor"]).describe("poor = too blurry, dark or small to judge detail"),
  photo_flags: z.array(z.enum(["studio_retouched", "clipped_or_pinned", "render_not_photo", "heavy_filter"]))
    .describe("Signs the photo is marketing rather than a faithful record. Empty if none."),
  stitch_regularity: z.enum(["even", "slightly_uneven", "irregular", "not_visible"]),
  stitch_density: z.enum(["high", "medium", "low", "not_visible"]).describe("Stitches per centimetre, only if individual stitches can be resolved"),
  seam_puckering: z.enum(["none", "slight", "pronounced", "not_visible"]),
  seam_finish: z.enum(["enclosed", "overlocked_neat", "overlocked_loose", "raw_unfinished", "not_visible"])
    .describe("enclosed = flat-felled, French or bound. Only answer from an interior or seam close-up."),
  loose_threads: z.enum(["none", "few", "many", "not_visible"]),
  pattern_matching: z.enum(["matched", "mismatched", "no_pattern", "not_visible"]).describe("Whether stripes/checks line up across seams"),
  hem_finish: z.enum(["clean", "uneven", "not_visible"]),
  lining: z.enum(["fully_lined", "partially_lined", "unlined", "not_visible"]),
  hardware_quality: z.enum(["branded_premium", "solid_generic", "flimsy", "no_hardware", "not_visible"])
    .describe("branded_premium only if a maker's mark is legible on the zipper/snap"),
  hardware_brand_text: z.string().nullable().describe("Exact maker's mark read off the hardware, e.g. YKK. null if none legible."),
  button_attachment: z.enum(["secure_shanked", "secure", "loose", "no_buttons", "not_visible"]),
  fabric_surface: z.enum(["smooth_dense", "moderate", "fuzzy_or_pilled", "not_visible"]).describe("Only from a close-up of the fabric"),
  fabric_opacity: z.enum(["opaque", "semi_sheer", "sheer", "not_visible"]).describe("Only from a backlit shot or where a layer beneath shows through"),
  knit_or_weave_density: z.enum(["tight", "medium", "loose", "not_visible"]).describe("Only from a close-up where the structure is resolved"),
  wear_signs: z.enum(["none", "light", "heavy", "not_visible"]).describe("Pilling, holes, fraying, fading on a worn garment"),
  label: z.object({
    composition: z.array(z.object({
      fiber: z.string().describe("Fibre name exactly as printed, translated to English"),
      percent: z.number(),
    })).describe("Only what is legibly printed on a label in this image. Empty if no label or illegible."),
    origin_country: z.string().nullable(),
    brand_text: z.string().nullable(),
  }),
});
export type ImageChecklist = z.infer<typeof ImageChecklistSchema>;

export const VisionReportSchema = z.object({
  garment_category: z.enum(["tee", "knitwear", "denim", "outerwear", "shirt", "other", "not_clothing"])
    .describe("tee = t-shirts and jersey tops; knitwear = sweaters/cardigans; denim = jeans and denim garments; outerwear = jackets and coats; shirt = woven shirts and tailoring; not_clothing if no garment is shown"),
  images: z.array(ImageChecklistSchema),
});
export type VisionReport = z.infer<typeof VisionReportSchema>;

export const VISION_SYSTEM_PROMPT = `You inspect photos of clothing and fill in a fixed checklist, one entry per image. Your answers are evidence for a downstream scorer; you never judge overall quality yourself.

How to answer:
- Report only what is actually visible in that specific image. If a feature is not shown, is out of focus, or is too small to judge, answer "not_visible". A wrong guess is far more harmful than "not_visible", because every answer you give is treated as an observed fact.
- A full-garment or on-model shot almost never resolves individual stitches, seam finishes or fabric structure. Expect mostly "not_visible" for those images; that is the correct answer, not a failure.
- Interior seam finish can only be judged from an inside view or a seam close-up.
- For labels, transcribe only text you can read. Do not infer composition from how the fabric looks. Give fibre names in English and percentages as printed.
- For hardware, "branded_premium" requires a legible maker's mark; put the exact mark in hardware_brand_text.
- Use "no_pattern", "no_hardware" and "no_buttons" only when the relevant area is clearly visible and the feature is absent; otherwise "not_visible".
- Flag retailer-style photos (studio lighting, retouching, clips or pins pulling the garment, a 3D render) in photo_flags.
- If an image does not show clothing, set shot_type to "not_clothing" and answer "not_visible" throughout.
- Return exactly one entry per image, with image_index matching the label given before each image.`;
