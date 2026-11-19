/**
 * Turns checklist answers into typed evidence. The mapping is a plain table,
 * so what a given answer is worth is reviewable and testable.
 */
import { COPY_TERMS, SD } from "../rubric.js";
import type { Category, Dimension, Evidence, Note } from "../types.js";
import type { ImageChecklist, VisionReport } from "../vision/schema.js";
import { compositionEvidence, normalizeFiber, type FiberPart } from "./pageText.js";

type ChecklistKey =
  | "stitch_regularity" | "stitch_density" | "seam_puckering" | "seam_finish" | "loose_threads"
  | "pattern_matching" | "hem_finish" | "lining" | "hardware_quality" | "button_attachment"
  | "fabric_surface" | "fabric_opacity" | "knit_or_weave_density" | "wear_signs";

interface Rule { dimension: Dimension; value: number; sd: number; claim: string; only?: Category[] }

/** Answers missing from a table (not_visible, no_pattern, unlined, ...) carry no evidence. */
const RULES: Record<ChecklistKey, Record<string, Rule>> = {
  stitch_regularity: {
    even: { dimension: "construction", value: 67, sd: 15, claim: "Stitching is even" },
    slightly_uneven: { dimension: "construction", value: 47, sd: 16, claim: "Stitching is slightly uneven" },
    irregular: { dimension: "construction", value: 30, sd: 14, claim: "Stitching is irregular" },
  },
  stitch_density: {
    high: { dimension: "construction", value: 70, sd: 17, claim: "High stitch density" },
    medium: { dimension: "construction", value: 55, sd: 20, claim: "Medium stitch density" },
    low: { dimension: "construction", value: 38, sd: 17, claim: "Low stitch density" },
  },
  seam_puckering: {
    none: { dimension: "construction", value: 63, sd: 18, claim: "Seams lie flat with no puckering" },
    slight: { dimension: "construction", value: 46, sd: 17, claim: "Slight seam puckering" },
    pronounced: { dimension: "construction", value: 30, sd: 15, claim: "Pronounced seam puckering" },
  },
  seam_finish: {
    enclosed: { dimension: "construction", value: 76, sd: 13, claim: "Seams are enclosed (felled, French or bound)" },
    overlocked_neat: { dimension: "construction", value: 55, sd: 17, claim: "Seams are neatly overlocked" },
    overlocked_loose: { dimension: "construction", value: 37, sd: 15, claim: "Seams are loosely overlocked" },
    raw_unfinished: { dimension: "construction", value: 28, sd: 16, claim: "Seam allowances are left raw" },
  },
  loose_threads: {
    none: { dimension: "construction", value: 60, sd: 22, claim: "No loose threads" },
    few: { dimension: "construction", value: 45, sd: 18, claim: "A few loose threads" },
    many: { dimension: "construction", value: 29, sd: 15, claim: "Many loose threads" },
  },
  pattern_matching: {
    matched: { dimension: "construction", value: 74, sd: 14, claim: "Pattern is matched across seams" },
    mismatched: { dimension: "construction", value: 36, sd: 15, claim: "Pattern is not matched across seams" },
  },
  hem_finish: {
    clean: { dimension: "construction", value: 61, sd: 20, claim: "Hem is cleanly finished" },
    uneven: { dimension: "construction", value: 38, sd: 16, claim: "Hem is uneven" },
  },
  lining: {
    fully_lined: { dimension: "construction", value: 67, sd: 17, claim: "Fully lined", only: ["outerwear", "shirt", "other"] },
    partially_lined: { dimension: "construction", value: 58, sd: 22, claim: "Partially lined", only: ["outerwear", "shirt", "other"] },
  },
  hardware_quality: {
    branded_premium: { dimension: "hardware", value: 72, sd: 14, claim: "Hardware carries a maker's mark" },
    solid_generic: { dimension: "hardware", value: 56, sd: 18, claim: "Hardware looks solid but unbranded" },
    flimsy: { dimension: "hardware", value: 32, sd: 14, claim: "Hardware looks flimsy" },
  },
  button_attachment: {
    secure_shanked: { dimension: "hardware", value: 72, sd: 14, claim: "Buttons are shanked and secure" },
    secure: { dimension: "hardware", value: 58, sd: 19, claim: "Buttons are securely attached" },
    loose: { dimension: "hardware", value: 32, sd: 14, claim: "Buttons are loosely attached" },
  },
  fabric_surface: {
    smooth_dense: { dimension: "fabric", value: 64, sd: 18, claim: "Fabric surface is smooth and dense" },
    moderate: { dimension: "fabric", value: 52, sd: 22, claim: "Fabric surface is average" },
    fuzzy_or_pilled: { dimension: "fabric", value: 35, sd: 16, claim: "Fabric surface is fuzzy or pilled" },
  },
  fabric_opacity: {
    opaque: { dimension: "fabric", value: 61, sd: 22, claim: "Fabric is opaque", only: ["tee", "shirt", "denim", "other"] },
    semi_sheer: { dimension: "fabric", value: 44, sd: 20, claim: "Fabric is semi-sheer", only: ["tee", "shirt", "denim", "other"] },
    sheer: { dimension: "fabric", value: 33, sd: 18, claim: "Fabric is sheer", only: ["tee", "shirt", "denim", "other"] },
  },
  knit_or_weave_density: {
    tight: { dimension: "fabric", value: 68, sd: 16, claim: "Knit or weave is tight" },
    medium: { dimension: "fabric", value: 54, sd: 21, claim: "Knit or weave is of medium density" },
    loose: { dimension: "fabric", value: 38, sd: 17, claim: "Knit or weave is loose" },
  },
  wear_signs: {
    light: { dimension: "durability", value: 46, sd: 21, claim: "Light signs of wear (pilling, fraying or fading)" },
    heavy: { dimension: "durability", value: 30, sd: 17, claim: "Heavy signs of wear (pilling, holes or fading)" },
  },
};

const MARKETING_FLAGS = new Set(["studio_retouched", "clipped_or_pinned", "render_not_photo", "heavy_filter"]);

/** How bad an answer is, for breaking ties toward the cautious reading. */
function ruleFor(key: ChecklistKey, answer: string, category: Category): Rule | null {
  const rule = RULES[key][answer];
  if (!rule) return null;
  if (rule.only && !rule.only.includes(category)) return null;
  return rule;
}

export interface VisionExtraction {
  evidence: Evidence[];
  notes: Note[];
  warnings: string[];
  shotTypes: Set<string>;
}

export function extractVision(category: Category, report: VisionReport, imageCount: number): VisionExtraction {
  const evidence: Evidence[] = [];
  const notes: Note[] = [];
  const warnings: string[] = [];
  const shotTypes = new Set<string>();

  // Ignore entries for images that were never sent, duplicates, and unusable photos.
  const seen = new Set<number>();
  const usable: ImageChecklist[] = [];
  for (const img of report.images) {
    if (!Number.isInteger(img.image_index) || img.image_index < 0 || img.image_index >= imageCount) continue;
    if (seen.has(img.image_index)) continue;
    seen.add(img.image_index);
    if (img.shot_type === "not_clothing") {
      warnings.push(`Image ${img.image_index + 1} does not appear to show clothing and was ignored.`);
      continue;
    }
    shotTypes.add(img.shot_type);
    if (img.image_quality === "poor") {
      warnings.push(`Image ${img.image_index + 1} was too blurry or dark to judge detail.`);
      continue;
    }
    usable.push(img);
  }

  // One evidence item per checklist question, however many photos show it.
  for (const key of Object.keys(RULES) as ChecklistKey[]) {
    const byAnswer = new Map<string, { rule: Rule; images: number[]; marketing: number }>();
    for (const img of usable) {
      const answer = img[key];
      const rule = ruleFor(key, answer, category);
      if (!rule) continue;
      const entry = byAnswer.get(answer) ?? { rule, images: [], marketing: 0 };
      entry.images.push(img.image_index);
      if (img.photo_flags.some((f) => MARKETING_FLAGS.has(f))) entry.marketing++;
      byAnswer.set(answer, entry);
    }
    if (byAnswer.size === 0) continue;
    // Most photos win; on a tie, the less flattering answer wins.
    const ranked = [...byAnswer.values()].sort((a, b) => b.images.length - a.images.length || a.rule.value - b.rule.value);
    const top = ranked[0]!;
    const conflicting = ranked.length > 1;
    let sd = top.rule.sd;
    if (conflicting) sd += 6; // photos disagree
    else if (top.images.length >= 2) sd *= 0.9; // photos agree
    // Retailer photos are marketing: a flattering answer from one is worth less.
    if (top.marketing === top.images.length && top.rule.value > 50) sd += 5;
    evidence.push({
      key: `vision.${key}`, dimension: top.rule.dimension, claim: top.rule.claim,
      source: { type: "image", images: [...top.images].sort((a, b) => a - b) }, value: top.rule.value, sd,
    });
  }

  // Maker's marks read off hardware are matched against the lexicon; free text never passes through.
  for (const img of usable) {
    if (!img.hardware_brand_text) continue;
    const term = COPY_TERMS.find((t) => t.dimension === "hardware" && t.pattern.test(img.hardware_brand_text!));
    if (term && !evidence.some((e) => e.key === term.key)) {
      evidence.push({
        key: term.key, dimension: "hardware", claim: `${term.claim}, read from the hardware`,
        source: { type: "image", images: [img.image_index] }, value: term.value, sd: term.sd,
      });
    }
  }

  // Label OCR: the most complete legible label wins.
  let best: { parts: FiberPart[]; total: number; image: number } | null = null;
  for (const img of usable) {
    const parts: FiberPart[] = [];
    for (const c of img.label.composition) {
      const fiber = normalizeFiber(c.fiber);
      if (!fiber || !(c.percent > 0) || c.percent > 100) continue;
      const existing = parts.find((p) => p.fiber === fiber);
      if (existing) existing.pct += c.percent; else parts.push({ fiber, pct: c.percent });
    }
    const total = parts.reduce((s, p) => s + p.pct, 0);
    if (parts.length && total <= 100.5 && (!best || total > best.total)) best = { parts, total, image: img.image_index };
    if (img.label.origin_country && /^[A-Za-z .'-]{2,40}$/.test(img.label.origin_country)) {
      notes.push({ claim: `Made in ${img.label.origin_country.trim()}`, source: { type: "label", images: [img.image_index] } });
    }
  }
  if (best) {
    // A sewn-in label is a legal declaration: more reliable than page copy.
    evidence.push(...compositionEvidence(category, best.parts, { type: "label", images: [best.image] }, SD.high + 2));
  }

  return { evidence, notes, warnings, shotTypes };
}
