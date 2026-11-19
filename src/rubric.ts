/**
 * The rubric: every number that turns a fact into a quality estimate lives here.
 *
 * These are expert-rubric starting values, not learned weights. Until there is
 * ground truth (lab tests, long-term reviews) the system is a rubric, not a
 * validated model. Change numbers here, then run `npm run backtest`.
 */
import type { Category, Dimension, Grade } from "./types.js";

/** Reliability tiers, expressed as the sd of a claim's implied quality. */
export const SD = { high: 9, medium: 13, low: 18, weak: 24, faint: 32 } as const;

/** Before any evidence: the typical garment, and we know very little. */
export const PRIOR = { mean: 50, sd: 20 } as const;

/**
 * How much of a garment's quality is shared across dimensions (a maker that
 * cuts corners on fabric tends to cut them on seams). 0.5 = half the prior
 * variance is a general quality level, half is specific to each dimension.
 */
export const DIMENSION_CORRELATION = 0.5;

/** 80% interval. */
export const RANGE_Z = 1.2816;

/** Overall sd thresholds. Above `insufficient` the service refuses to grade. */
export const CONFIDENCE_SD = { high: 6, medium: 9, insufficient: 13 } as const;

export const GRADE_FLOORS: { grade: Grade; min: number }[] = [
  { grade: "Excellent", min: 73 },
  { grade: "Good", min: 60 },
  { grade: "Average", min: 47 },
  { grade: "Below average", min: 36 },
  { grade: "Poor", min: 0 },
];

export function gradeFor(score: number): Grade {
  for (const g of GRADE_FLOORS) if (score >= g.min) return g.grade;
  return "Poor";
}

export const WEIGHTS: Record<Category, Record<Dimension, number>> = {
  tee: { fabric: 0.45, construction: 0.3, hardware: 0, durability: 0.25 },
  knitwear: { fabric: 0.5, construction: 0.25, hardware: 0, durability: 0.25 },
  denim: { fabric: 0.35, construction: 0.3, hardware: 0.15, durability: 0.2 },
  outerwear: { fabric: 0.3, construction: 0.3, hardware: 0.25, durability: 0.15 },
  shirt: { fabric: 0.35, construction: 0.35, hardware: 0.15, durability: 0.15 },
  other: { fabric: 0.4, construction: 0.3, hardware: 0.1, durability: 0.2 },
};

/** Upper price bound of each band, in USD. Above the last bound is "luxury". */
export const PRICE_BANDS: Record<Category, [number, number, number]> = {
  tee: [20, 50, 120],
  knitwear: [50, 130, 300],
  denim: [50, 120, 250],
  outerwear: [80, 250, 600],
  shirt: [40, 100, 220],
  other: [40, 100, 250],
};
export const BAND_NAMES = ["budget", "mid", "premium", "luxury"] as const;
export type PriceBand = (typeof BAND_NAMES)[number];

/** Price is a weak signal on its own: small shift, very wide sd. */
export const PRICE_PRIOR: Record<PriceBand, number> = { budget: 43, mid: 50, premium: 56, luxury: 60 };
/** The quality a buyer could fairly expect at each band; used only for the value view. */
export const PRICE_EXPECTATION: Record<PriceBand, number> = { budget: 42, mid: 50, premium: 59, luxury: 66 };

export function priceBand(category: Category, price: number): PriceBand {
  const [a, b, c] = PRICE_BANDS[category];
  return price < a ? "budget" : price < b ? "mid" : price < c ? "premium" : "luxury";
}

/**
 * Brand track record. Deliberately tiered rather than per-brand scores: quality
 * varies inside a brand, so this only sets a baseline and is medium reliability.
 * The seed list is illustrative. Replace it with your own data.
 */
export const BRAND_TIERS: Record<string, { label: string; mean: number }> = {
  fast_fashion: { label: "fast-fashion", mean: 40 },
  mass_market: { label: "mass-market", mean: 49 },
  quality_basics: { label: "quality-focused basics", mean: 60 },
  heritage_maker: { label: "specialist or heritage maker", mean: 70 },
};
export const BRAND_SEED: Record<string, keyof typeof BRAND_TIERS> = {
  shein: "fast_fashion",
  "fashion nova": "fast_fashion",
  boohoo: "fast_fashion",
  zara: "fast_fashion",
  "h&m": "fast_fashion",
  primark: "fast_fashion",
  gap: "mass_market",
  "old navy": "mass_market",
  uniqlo: "mass_market",
  "j.crew": "mass_market",
  "levi's": "mass_market",
  "banana republic": "mass_market",
  "american giant": "quality_basics",
  asket: "quality_basics",
  "lady white co": "quality_basics",
  "sunspel": "quality_basics",
  "iron heart": "heritage_maker",
  "the real mccoy's": "heritage_maker",
  "inis meain": "heritage_maker",
  "william lockie": "heritage_maker",
  "loro piana": "heritage_maker",
};
export const BRAND_PRIOR_SD = 16;

// ---------------------------------------------------------------- fibers ---

export type Fiber =
  | "cotton" | "premium_cotton" | "organic_cotton" | "linen" | "hemp" | "wool" | "merino"
  | "lambswool" | "cashmere" | "alpaca" | "mohair" | "silk" | "polyester" | "recycled_polyester"
  | "nylon" | "acrylic" | "viscose" | "modal" | "lyocell" | "elastane" | "down" | "leather";

export const FIBER_NAMES: Record<Fiber, string> = {
  cotton: "cotton", premium_cotton: "long-staple cotton", organic_cotton: "organic cotton",
  linen: "linen", hemp: "hemp", wool: "wool", merino: "merino wool", lambswool: "lambswool",
  cashmere: "cashmere", alpaca: "alpaca", mohair: "mohair", silk: "silk", polyester: "polyester",
  recycled_polyester: "recycled polyester", nylon: "nylon", acrylic: "acrylic", viscose: "viscose",
  modal: "modal", lyocell: "lyocell", elastane: "elastane", down: "down", leather: "leather",
};

/** Longest synonyms first so "recycled polyester" wins over "polyester". */
export const FIBER_SYNONYMS: [string, Fiber][] = ([
  ["recycled polyester", "recycled_polyester"], ["recycled polyamide", "nylon"], ["recycled nylon", "nylon"],
  ["organic cotton", "organic_cotton"], ["supima cotton", "premium_cotton"], ["pima cotton", "premium_cotton"],
  ["egyptian cotton", "premium_cotton"], ["sea island cotton", "premium_cotton"],
  ["long-staple cotton", "premium_cotton"], ["long staple cotton", "premium_cotton"],
  ["supima", "premium_cotton"], ["pima", "premium_cotton"],
  ["merino wool", "merino"], ["extrafine merino", "merino"], ["merino", "merino"],
  ["lambswool", "lambswool"], ["lamb's wool", "lambswool"], ["virgin wool", "wool"], ["wool", "wool"],
  ["cashmere", "cashmere"], ["alpaca", "alpaca"], ["mohair", "mohair"], ["silk", "silk"],
  ["linen", "linen"], ["flax", "linen"], ["hemp", "hemp"],
  ["polyester", "polyester"], ["polyamide", "nylon"], ["nylon", "nylon"], ["acrylic", "acrylic"],
  ["viscose", "viscose"], ["rayon", "viscose"], ["bamboo", "viscose"], ["modal", "modal"],
  ["lyocell", "lyocell"], ["tencel", "lyocell"],
  ["elastane", "elastane"], ["spandex", "elastane"], ["lycra", "elastane"],
  ["goose down", "down"], ["duck down", "down"], ["down", "down"],
  ["leather", "leather"], ["cotton", "cotton"],
] as [string, Fiber][]).sort((a, b) => b[0].length - a[0].length);

const BASE_FIBER: Record<Fiber, number> = {
  cotton: 55, premium_cotton: 73, organic_cotton: 57, linen: 63, hemp: 62, wool: 64, merino: 70,
  lambswool: 66, cashmere: 76, alpaca: 70, mohair: 68, silk: 70, polyester: 38, recycled_polyester: 40,
  nylon: 44, acrylic: 30, viscose: 44, modal: 56, lyocell: 57, elastane: 50, down: 68, leather: 70,
};

/** The right answer changes by category; these override the base table. */
const CATEGORY_FIBER: Partial<Record<Category, Partial<Record<Fiber, number>>>> = {
  knitwear: { acrylic: 22, polyester: 28, cotton: 54, nylon: 46, viscose: 40 },
  denim: { cotton: 62, organic_cotton: 63, polyester: 40, lyocell: 54 },
  outerwear: { nylon: 60, polyester: 56, recycled_polyester: 57, acrylic: 48, cotton: 58, wool: 68 },
  shirt: { cotton: 60, organic_cotton: 61, premium_cotton: 75, linen: 66, polyester: 34 },
};

export function fiberValue(category: Category, fiber: Fiber): number {
  return CATEGORY_FIBER[category]?.[fiber] ?? BASE_FIBER[fiber];
}

/**
 * Elastane is judged on its own because the same percentage means different
 * things: 2% in jeans is ordinary, 5% in a dress shirt is a warning sign.
 * Returns the points to add to the composition value, and a reason if non-zero.
 */
export function elastaneAdjustment(category: Category, pct: number): { delta: number; reason: string | null } {
  if (pct <= 0) return { delta: 0, reason: null };
  switch (category) {
    case "denim":
      if (pct <= 3) return { delta: 0, reason: null };
      if (pct <= 6) return { delta: -3, reason: `${pct}% elastane is on the high side for denim` };
      return { delta: -9, reason: `${pct}% elastane is high for denim and tends to bag out` };
    case "shirt":
      if (pct <= 2) return { delta: -3, reason: null };
      return { delta: -10, reason: `${pct}% elastane is a warning sign in a woven shirt` };
    case "knitwear":
      return pct <= 3 ? { delta: -1, reason: null } : { delta: -6, reason: `${pct}% elastane is unusual for knitwear` };
    case "outerwear":
      return { delta: 0, reason: null };
    default:
      return pct <= 5 ? { delta: -1, reason: null } : { delta: -6, reason: `${pct}% elastane is high` };
  }
}

/** Synthetics a knit should not be built on; a little nylon for strength is fine. */
export function knitSyntheticWarning(fiber: Fiber, pct: number): string | null {
  if (fiber === "acrylic" && pct >= 10) return `${pct}% acrylic is a red flag in knitwear (pills, holds odour)`;
  if (fiber === "polyester" && pct >= 20) return `${pct}% polyester is a weak base for knitwear`;
  return null;
}

// ----------------------------------------------------- fabric weight -------

export function weightValue(category: Category, gsm: number): { value: number; label: string } | null {
  if (category === "tee") {
    if (gsm < 140) return { value: 38, label: "lightweight" };
    if (gsm < 170) return { value: 50, label: "mid-weight" };
    if (gsm < 210) return { value: 62, label: "substantial" };
    return { value: 69, label: "heavyweight" };
  }
  if (category === "denim") {
    const oz = gsm / 33.906;
    if (oz < 10) return { value: 47, label: "lightweight" };
    if (oz < 12.5) return { value: 58, label: "mid-weight" };
    return { value: 68, label: "heavyweight" };
  }
  if (category === "shirt") {
    if (gsm < 90) return { value: 44, label: "very light" };
    if (gsm < 170) return { value: 58, label: "typical shirting weight" };
    return { value: 62, label: "heavy shirting" };
  }
  return null; // weight is not a quality signal on its own for knitwear/outerwear
}

// ------------------------------------------------- keyword lexicons --------

export interface Term {
  key: string;
  pattern: RegExp;
  dimension: Dimension;
  value: number;
  sd: number;
  claim: string;
  /** Only meaningful in these categories; omitted = all. */
  only?: Category[];
}

/**
 * Terms found in product copy. Brands only mention what flatters them, so
 * positive copy terms are medium reliability at best.
 */
export const COPY_TERMS: Term[] = [
  // yarn and fabric
  { key: "fabric.yarn.ring_spun", pattern: /\bring[- ]?spun\b/i, dimension: "fabric", value: 62, sd: SD.low, claim: "ring-spun yarn" },
  { key: "fabric.yarn.combed", pattern: /\bcombed\b/i, dimension: "fabric", value: 63, sd: SD.low, claim: "combed yarn" },
  { key: "fabric.yarn.open_end", pattern: /\b(open[- ]end|carded open)\b/i, dimension: "fabric", value: 38, sd: SD.medium, claim: "open-end yarn" },
  { key: "fabric.yarn.two_ply", pattern: /\b(two|2)[- ]?ply\b/i, dimension: "fabric", value: 70, sd: SD.medium, claim: "two-ply yarn" },
  { key: "fabric.yarn.long_staple", pattern: /\b(extra[- ])?long[- ]staple\b/i, dimension: "fabric", value: 72, sd: SD.medium, claim: "long-staple fibre" },
  { key: "fabric.finish.mercerized", pattern: /\bmerceri[sz]ed\b/i, dimension: "fabric", value: 66, sd: SD.low, claim: "mercerized finish" },
  { key: "fabric.finish.preshrunk", pattern: /\b(pre[- ]?shrunk|sanfori[sz]ed)\b/i, dimension: "fabric", value: 59, sd: SD.weak, claim: "pre-shrunk" },
  { key: "fabric.finish.garment_dyed", pattern: /\bgarment[- ]dyed\b/i, dimension: "fabric", value: 59, sd: SD.weak, claim: "garment-dyed" },
  { key: "fabric.selvedge", pattern: /\bselv(e|a)dge\b/i, dimension: "fabric", value: 72, sd: SD.medium, claim: "selvedge denim", only: ["denim"] },
  { key: "fabric.loopwheel", pattern: /\bloop[- ]?wheel(ed)?\b/i, dimension: "fabric", value: 76, sd: SD.medium, claim: "loopwheeled fabric" },
  { key: "fabric.mill_named", pattern: /\b(kaihara|kurabo|cone mills|candiani|albini|thomas mason|loro piana fabric|todd & duncan|cariaggi|vitale barberis)\b/i, dimension: "fabric", value: 74, sd: SD.medium, claim: "fabric from a named mill" },
  // construction
  { key: "construction.flat_felled", pattern: /\bflat[- ]fell(ed)?\b/i, dimension: "construction", value: 72, sd: SD.medium, claim: "flat-felled seams" },
  { key: "construction.french_seams", pattern: /\bfrench seams?\b/i, dimension: "construction", value: 74, sd: SD.medium, claim: "French seams" },
  { key: "construction.bound_seams", pattern: /\bbound seams?\b/i, dimension: "construction", value: 70, sd: SD.medium, claim: "bound seams" },
  { key: "construction.taped_seams", pattern: /\b(fully )?(taped|sealed) seams?\b/i, dimension: "construction", value: 68, sd: SD.medium, claim: "taped seams", only: ["outerwear"] },
  { key: "construction.full_canvas", pattern: /\bfull(y)?[- ]canvas(sed|ed)?\b/i, dimension: "construction", value: 82, sd: SD.high, claim: "full-canvas construction" },
  { key: "construction.half_canvas", pattern: /\bhalf[- ]canvas(sed|ed)?\b/i, dimension: "construction", value: 71, sd: SD.medium, claim: "half-canvas construction" },
  { key: "construction.fused", pattern: /\bfused (construction|front|chest)\b/i, dimension: "construction", value: 42, sd: SD.medium, claim: "fused construction" },
  { key: "construction.single_needle", pattern: /\bsingle[- ]needle\b/i, dimension: "construction", value: 72, sd: SD.medium, claim: "single-needle stitching", only: ["shirt"] },
  { key: "construction.double_needle", pattern: /\b(double|twin)[- ]needle\b/i, dimension: "construction", value: 60, sd: SD.low, claim: "double-needle stitching" },
  { key: "construction.chain_stitch", pattern: /\bchain[- ]?stitch(ed)?\b/i, dimension: "construction", value: 65, sd: SD.low, claim: "chain-stitched hems" },
  { key: "construction.bartack", pattern: /\b(bar[- ]?tack(s|ed)?|reinforced (seams?|stress points?|stitching))\b/i, dimension: "construction", value: 64, sd: SD.low, claim: "reinforced stress points" },
  { key: "construction.fully_fashioned", pattern: /\bfully[- ]fashioned\b/i, dimension: "construction", value: 72, sd: SD.medium, claim: "fully fashioned knit", only: ["knitwear"] },
  { key: "construction.hand_linked", pattern: /\bhand[- ](linked|framed|finished)\b/i, dimension: "construction", value: 75, sd: SD.medium, claim: "hand-linked or hand-finished" },
  { key: "construction.fully_lined", pattern: /\bfully[- ]lined\b/i, dimension: "construction", value: 66, sd: SD.low, claim: "fully lined", only: ["outerwear", "shirt", "other"] },
  { key: "construction.side_seam_tubular", pattern: /\b(tubular|side[- ]seam(less)?( free)?) (knit|body|construction)\b/i, dimension: "construction", value: 62, sd: SD.weak, claim: "tubular body", only: ["tee"] },
  // hardware and finishing
  { key: "hardware.premium_zip", pattern: /\b(riri|excella|lampo|raccagni)\b/i, dimension: "hardware", value: 82, sd: SD.high, claim: "premium zipper (Riri, Excella or Lampo)" },
  { key: "hardware.ykk", pattern: /\bykk\b/i, dimension: "hardware", value: 64, sd: SD.medium, claim: "YKK zipper" },
  { key: "hardware.natural_buttons", pattern: /\b(mother[- ]of[- ]pearl|horn buttons?|corozo|trocas)\b/i, dimension: "hardware", value: 76, sd: SD.medium, claim: "natural-material buttons" },
  { key: "hardware.plastic_buttons", pattern: /\bplastic buttons?\b/i, dimension: "hardware", value: 44, sd: SD.low, claim: "plastic buttons" },
  { key: "hardware.rivets", pattern: /\b(copper|hidden|branded) rivets?\b/i, dimension: "hardware", value: 66, sd: SD.low, claim: "copper or hidden rivets", only: ["denim"] },
];

export const CAPTURE_PROMPTS: Record<string, { dimension: Dimension; prompt: string; typicalSd: number }> = {
  care_label: { dimension: "fabric", prompt: "A photo of the care label would settle the fabric question.", typicalSd: 11 },
  fabric_macro: { dimension: "fabric", prompt: "A close-up of the fabric surface would show how dense and even it is.", typicalSd: 16 },
  seam_interior: { dimension: "construction", prompt: "A photo of an inside seam would show how well it is put together.", typicalSd: 12 },
  hardware_closeup: { dimension: "hardware", prompt: "A close-up of the zipper or buttons would show the hardware quality.", typicalSd: 13 },
  reviews: { dimension: "durability", prompt: "Reviews written after a few months of wear would show how it holds up.", typicalSd: 11 },
  product_page: { dimension: "fabric", prompt: "The product page text (composition, weight, construction details) would narrow this down.", typicalSd: 13 },
};
