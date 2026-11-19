/**
 * Hand-graded back-test set.
 *
 * Each case is the evidence a client could send, plus the grade a careful human
 * would give from that evidence alone. The expected grades were written before
 * the scorer was run on them.
 *
 * Cases with `vision` replay a canned checklist (what the vision model would
 * return), so they test everything after the model call, not the model itself.
 */
import type { AssessmentInput, Grade } from "../src/types.js";
import type { ImageChecklist, VisionReport } from "../src/vision/schema.js";

export interface GoldenCase {
  id: string;
  input: AssessmentInput;
  vision?: { category: VisionReport["garment_category"]; images: Partial<ImageChecklist>[] };
  expect: { status: "graded"; grade: Grade } | { status: "insufficient_information" };
}

const reviews = (...groups: [number, string][]) =>
  groups.flatMap(([count, text], g) => Array.from({ length: count }, (_, i) => ({ id: `r${g}-${i}`, text })));

const FILLER = "Nice colour and it arrived quickly. Fits as expected.";
const label = (...parts: [number, string][]) => ({
  composition: parts.map(([percent, fiber]) => ({ percent, fiber })), origin_country: null, brand_text: null,
});

export const GOLDEN: GoldenCase[] = [
  // ---------------------------------------------------------------- tees
  { id: "tee-heavy-supima",
    input: { category: "tee", price: 55, page_text: "100% Supima cotton. 220 GSM ring-spun, combed jersey. Double-needle stitching at hems. Pre-shrunk." },
    expect: { status: "graded", grade: "Good" } },
  { id: "tee-thin-open-end",
    input: { category: "tee", price: 8, page_text: "100% cotton. 120 GSM open-end yarn." },
    expect: { status: "graded", grade: "Below average" } },
  { id: "tee-composition-only",
    input: { category: "tee", price: 25, page_text: "100% cotton." },
    expect: { status: "insufficient_information" } },
  { id: "tee-fast-fashion-bare",
    input: { category: "tee", brand: "Zara", price: 18, page_text: "100% cotton. Round neck, short sleeves." },
    expect: { status: "graded", grade: "Average" } },
  { id: "tee-fast-fashion-bad-reviews",
    input: { category: "tee", brand: "Zara", price: 18, page_text: "100% cotton. Round neck, short sleeves.",
      reviews: reviews([4, "Shrunk a full size after two washes."], [3, "Started pilling after a few wears."], [23, FILLER]) },
    expect: { status: "graded", grade: "Below average" } },
  { id: "tee-specialist-full",
    input: { category: "tee", brand: "Lady White Co", price: 60,
      page_text: "100% cotton, 220 GSM ring-spun jersey. Tubular body with no side seams. Garment-dyed. Made in USA.",
      reviews: reviews([6, "Had it for two years and it still looks great."], [14, FILLER]) },
    expect: { status: "graded", grade: "Good" } },
  { id: "tee-poly-blend-cheap",
    input: { category: "tee", price: 10, page_text: "60% polyester, 40% cotton. 130 GSM." },
    expect: { status: "graded", grade: "Below average" } },
  { id: "tee-premium-price-silent",
    input: { category: "tee", price: 90, page_text: "100% cotton. Relaxed fit. Machine wash cold." },
    expect: { status: "insufficient_information" } },
  { id: "tee-organic-midweight",
    input: { category: "tee", price: 35, page_text: "100% organic cotton, 180 GSM. Pre-shrunk." },
    expect: { status: "graded", grade: "Average" } },
  { id: "tee-good-reviews",
    input: { category: "tee", price: 30, page_text: "100% cotton.",
      reviews: reviews([12, "Held up really well, washes well and no shrinking."], [48, FILLER]) },
    expect: { status: "graded", grade: "Average" } },
  { id: "tee-photos-well-made",
    input: {},
    vision: { category: "tee", images: [
      { shot_type: "care_label", label: label([100, "Cotton"]) },
      { shot_type: "seam_interior", stitch_regularity: "even", stitch_density: "high", seam_puckering: "none", seam_finish: "overlocked_neat", loose_threads: "none", hem_finish: "clean" },
      { shot_type: "fabric_macro", fabric_surface: "smooth_dense", knit_or_weave_density: "tight" },
      { shot_type: "backlit_fabric", fabric_opacity: "opaque" },
    ] },
    expect: { status: "graded", grade: "Good" } },
  { id: "tee-photos-badly-made",
    input: {},
    vision: { category: "tee", images: [
      { shot_type: "care_label", label: label([65, "Polyester"], [35, "Cotton"]) },
      { shot_type: "seam_interior", stitch_regularity: "irregular", seam_puckering: "pronounced", seam_finish: "overlocked_loose", loose_threads: "many", hem_finish: "uneven" },
      { shot_type: "fabric_macro", fabric_surface: "fuzzy_or_pilled", knit_or_weave_density: "loose" },
      { shot_type: "backlit_fabric", fabric_opacity: "sheer" },
    ] },
    expect: { status: "graded", grade: "Poor" } },
  { id: "tee-no-facts",
    input: { category: "tee", price: 200, page_text: "Classic fit tee. Machine wash cold." },
    expect: { status: "insufficient_information" } },

  // ------------------------------------------------------------ knitwear
  { id: "knit-cashmere-two-ply",
    input: { category: "knitwear", brand: "William Lockie", price: 350, page_text: "100% cashmere, 2-ply. Fully fashioned and hand-linked. Made in Scotland." },
    expect: { status: "graded", grade: "Excellent" } },
  { id: "knit-acrylic",
    input: { category: "knitwear", price: 30, page_text: "100% acrylic. Soft touch knit." },
    expect: { status: "graded", grade: "Below average" } },
  { id: "knit-merino-pilling",
    input: { category: "knitwear", price: 80, page_text: "100% merino wool.",
      reviews: reviews([5, "Pilling badly after a month of wear."], [3, "It pills under the arms."], [32, FILLER]) },
    expect: { status: "graded", grade: "Average" } },
  { id: "knit-lambswool-nylon",
    input: { category: "knitwear", price: 120, page_text: "80% lambswool, 20% nylon. Fully fashioned." },
    expect: { status: "graded", grade: "Good" } },
  { id: "knit-fast-fashion-blend",
    input: { category: "knitwear", brand: "H&M", price: 35, page_text: "52% acrylic, 30% polyester, 15% wool, 3% elastane." },
    expect: { status: "graded", grade: "Poor" } },
  { id: "knit-cheap-cashmere-bad-reviews",
    input: { category: "knitwear", price: 60, page_text: "100% cashmere.",
      reviews: reviews([4, "Holes appeared after a few weeks."], [3, "Pilled within two wears."], [18, FILLER]) },
    expect: { status: "graded", grade: "Average" } },
  { id: "knit-photos-worn-acrylic",
    input: {},
    vision: { category: "knitwear", images: [
      { shot_type: "care_label", label: label([100, "Acrylic"]) },
      { shot_type: "fabric_macro", fabric_surface: "fuzzy_or_pilled", knit_or_weave_density: "loose", wear_signs: "heavy" },
      { shot_type: "seam_interior", seam_finish: "overlocked_loose", loose_threads: "few" },
    ] },
    expect: { status: "graded", grade: "Poor" } },

  // --------------------------------------------------------------- denim
  { id: "denim-heavy-selvedge-specialist",
    input: { category: "denim", brand: "Iron Heart", price: 350, page_text: "100% cotton 21oz selvedge denim. Chain-stitched hems, hidden rivets, bartacked stress points." },
    expect: { status: "graded", grade: "Excellent" } },
  { id: "denim-fast-fashion-stretch",
    input: { category: "denim", brand: "Shein", price: 30, page_text: "68% cotton, 22% polyester, 8% viscose, 2% elastane." },
    expect: { status: "graded", grade: "Below average" } },
  { id: "denim-mass-market",
    input: { category: "denim", brand: "Levi's", price: 90, page_text: "98% cotton, 2% elastane. 12 oz denim. YKK zip fly." },
    expect: { status: "graded", grade: "Average" } },
  { id: "denim-raw-unbranded",
    input: { category: "denim", price: 180, page_text: "100% cotton 14.5oz sanforized selvedge denim. Chain-stitched hems and copper rivets." },
    expect: { status: "graded", grade: "Good" } },
  { id: "denim-photos-well-made",
    input: {},
    vision: { category: "denim", images: [
      { shot_type: "care_label", label: label([100, "Cotton"]) },
      { shot_type: "seam_interior", seam_finish: "enclosed", stitch_regularity: "even", stitch_density: "high", loose_threads: "none" },
      { shot_type: "hardware_closeup", hardware_quality: "branded_premium", hardware_brand_text: "YKK", button_attachment: "secure_shanked" },
      { shot_type: "fabric_macro", knit_or_weave_density: "tight", fabric_surface: "smooth_dense" },
    ] },
    expect: { status: "graded", grade: "Good" } },

  // ----------------------------------------------------------- outerwear
  { id: "outer-technical-shell",
    input: { category: "outerwear", price: 300, page_text: "100% nylon shell with fully taped seams. YKK zippers throughout. Fully lined." },
    expect: { status: "graded", grade: "Good" } },
  { id: "outer-wool-cashmere-coat",
    input: { category: "outerwear", price: 700, page_text: "90% wool, 10% cashmere. Fully lined. Riri zipper and horn buttons." },
    expect: { status: "graded", grade: "Good" } },
  { id: "outer-fast-fashion-failing",
    input: { category: "outerwear", brand: "Shein", price: 25, page_text: "100% polyester.",
      reviews: reviews([5, "Zipper broke after two weeks."], [3, "The seam came apart at the shoulder."], [12, FILLER]) },
    expect: { status: "graded", grade: "Poor" } },
  { id: "outer-composition-only",
    input: { category: "outerwear", price: 120, page_text: "Shell: 100% polyester." },
    expect: { status: "insufficient_information" } },
  { id: "outer-fast-fashion-no-facts",
    input: { category: "outerwear", brand: "Zara", price: 60, page_text: "Relaxed fit jacket with front pockets." },
    expect: { status: "graded", grade: "Average" } },

  // -------------------------------------------------------------- shirts
  { id: "shirt-oxford-well-specified",
    input: { category: "shirt", price: 140, page_text: "100% cotton two-ply oxford. Single-needle stitching, flat-felled seams, mother-of-pearl buttons." },
    expect: { status: "graded", grade: "Good" } },
  { id: "shirt-stretch-plastic-buttons",
    input: { category: "shirt", price: 40, page_text: "95% cotton, 5% elastane. Plastic buttons." },
    expect: { status: "graded", grade: "Below average" } },
  { id: "shirt-fast-fashion-poly",
    input: { category: "shirt", brand: "Boohoo", price: 15, page_text: "100% polyester." },
    expect: { status: "graded", grade: "Below average" } },
  { id: "shirt-linen-good-reviews",
    input: { category: "shirt", price: 120, page_text: "100% linen. French seams and mother-of-pearl buttons. Made in Portugal.",
      reviews: reviews([4, "Three summers in and it has held up beautifully."], [11, FILLER]) },
    expect: { status: "graded", grade: "Good" } },
  { id: "shirt-specialist-brand-no-facts",
    input: { category: "shirt", brand: "Iron Heart", price: 300, page_text: "Work shirt in a regular fit." },
    expect: { status: "graded", grade: "Good" } },
  { id: "shirt-photos-well-made",
    input: {},
    vision: { category: "shirt", images: [
      { shot_type: "care_label", label: label([100, "Cotton"]) },
      { shot_type: "seam_interior", seam_finish: "enclosed", stitch_regularity: "even", stitch_density: "high", pattern_matching: "matched" },
      { shot_type: "hardware_closeup", button_attachment: "secure_shanked", hardware_quality: "solid_generic" },
    ] },
    expect: { status: "graded", grade: "Good" } },
  { id: "shirt-photos-badly-made",
    input: {},
    vision: { category: "shirt", images: [
      { shot_type: "care_label", label: label([65, "Polyester"], [35, "Cotton"]) },
      { shot_type: "seam_interior", seam_finish: "overlocked_loose", stitch_regularity: "irregular", pattern_matching: "mismatched", loose_threads: "few" },
      { shot_type: "hardware_closeup", button_attachment: "loose", hardware_quality: "flimsy" },
    ] },
    expect: { status: "graded", grade: "Poor" } },

  // ---------------------------------------------------- photos that show nothing
  { id: "photos-retailer-only",
    input: { category: "tee" },
    vision: { category: "tee", images: [
      { shot_type: "on_model", photo_flags: ["studio_retouched"] },
      { shot_type: "full_garment", photo_flags: ["studio_retouched", "clipped_or_pinned"] },
    ] },
    expect: { status: "insufficient_information" } },
];

/** [better, worse]: the first should score higher than the second. */
export const ORDERINGS: [string, string][] = [
  ["tee-heavy-supima", "tee-organic-midweight"],
  ["tee-organic-midweight", "tee-thin-open-end"],
  ["tee-specialist-full", "tee-fast-fashion-bare"],
  ["tee-fast-fashion-bare", "tee-fast-fashion-bad-reviews"],
  ["tee-photos-well-made", "tee-photos-badly-made"],
  ["knit-cashmere-two-ply", "knit-lambswool-nylon"],
  ["knit-lambswool-nylon", "knit-acrylic"],
  ["knit-acrylic", "knit-fast-fashion-blend"],
  ["denim-heavy-selvedge-specialist", "denim-raw-unbranded"],
  ["denim-raw-unbranded", "denim-mass-market"],
  ["denim-mass-market", "denim-fast-fashion-stretch"],
  ["outer-wool-cashmere-coat", "outer-fast-fashion-failing"],
  ["outer-technical-shell", "outer-fast-fashion-no-facts"],
  ["shirt-oxford-well-specified", "shirt-stretch-plastic-buttons"],
  ["shirt-photos-well-made", "shirt-photos-badly-made"],
];
