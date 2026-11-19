/**
 * Collect evidence -> score -> build the response.
 * Every sentence shown to the user is assembled here from evidence records;
 * no free-form model text is passed through.
 */
import { randomUUID } from "node:crypto";
import { extractPageText } from "./extract/pageText.js";
import { extractReviews } from "./extract/reviews.js";
import { extractVision } from "./extract/visionEvidence.js";
import {
  BRAND_PRIOR_SD, BRAND_SEED, BRAND_TIERS, PRICE_EXPECTATION, PRICE_PRIOR, SD, WEIGHTS, gradeFor, priceBand,
} from "./rubric.js";
import { isDirect, nextBestEvidence, round1, score, type ScoreResult } from "./scorer.js";
import {
  CATEGORIES, DIMENSIONS, type Assessment, type AssessmentInput, type Category, type CaptureKind,
  type Dimension, type DimensionResult, type Evidence, type ImageInput, type Note,
} from "./types.js";
import { VisionError, type VisionProvider } from "./vision/provider.js";
import type { VisionReport } from "./vision/schema.js";

export class NoGarmentError extends Error {}

const DIMENSION_LABEL: Record<Dimension, string> = {
  fabric: "Fabric", construction: "Construction", hardware: "Hardware and finishing", durability: "Durability",
};

const UNKNOWN_DETAIL: Record<Dimension, string> = {
  fabric: "No composition, weight or close-up to go on.",
  construction: "No interior or seam photos, and no construction details stated.",
  hardware: "No close-up of zippers or buttons, and none described.",
  durability: "No reviews written after wear.",
};
const unknownLine = (d: Dimension) => `${DIMENSION_LABEL[d]}: Unknown. ${UNKNOWN_DETAIL[d]}`;

function sourceLabel(e: Evidence | Note): string {
  switch (e.source.type) {
    case "page_text": return "product page";
    case "image": return e.source.images.length > 1 ? `photos ${e.source.images.map((i) => i + 1).join(", ")}` : `photo ${e.source.images[0]! + 1}`;
    case "label": return `label in photo ${e.source.images[0]! + 1}`;
    case "reviews": return "reviews";
    case "brand_prior": return "brand track record";
    case "price": return "price";
    case "silence": return "product page";
  }
}

function normalizeBrand(brand: string): string {
  return brand.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

/** Background expectations, expressed as (weak) evidence so they show up in the record. */
function priorEvidence(category: Category, input: AssessmentInput, silentOnFabric: boolean, hasPage: boolean): Evidence[] {
  const out: Evidence[] = [];

  if (input.brand) {
    const tierKey = BRAND_SEED[normalizeBrand(input.brand)];
    if (tierKey) {
      const tier = BRAND_TIERS[tierKey]!;
      out.push({
        key: "prior.brand", dimension: "overall", claim: `${input.brand} is a ${tier.label} brand`,
        source: { type: "brand_prior", brand: input.brand }, value: tier.mean, sd: BRAND_PRIOR_SD,
      });
    }
  }

  if (input.price !== undefined) {
    const band = priceBand(category, input.price);
    if (band !== "mid") {
      out.push({
        key: "prior.price", dimension: "overall", claim: `Priced in the ${band} band for this category`,
        source: { type: "price", band }, value: PRICE_PRIOR[band], sd: SD.faint,
      });
    }
    // Brands that use good yarn or heavy fabric say so. Kept small: small brands often just write poor copy.
    if (hasPage && silentOnFabric && (band === "premium" || band === "luxury")) {
      out.push({
        key: "prior.silence.fabric", dimension: "fabric",
        claim: `No fabric weight, yarn or fibre grade stated at a ${band} price`,
        source: { type: "silence" }, value: 44, sd: SD.faint,
      });
    }
  }
  return out;
}

function buildDimensions(result: ScoreResult): DimensionResult[] {
  const weights = WEIGHTS[result.category];
  return DIMENSIONS.filter((d) => weights[d] > 0).map((d) => {
    const b = result.beliefs[d];
    const items = result.evidence.filter((e) => e.dimension === d && isDirect(e)).sort((a, b2) => Math.abs(b2.contribution ?? 0) - Math.abs(a.contribution ?? 0) || (b2.weight ?? 0) - (a.weight ?? 0));
    const grade = items.length ? gradeFor(b.mean) : "Unknown";
    const summary = items.length
      ? `${DIMENSION_LABEL[d]}: ${grade}. ` + items.slice(0, 4).map((e, i) => `${i === 0 ? e.claim.charAt(0).toUpperCase() + e.claim.slice(1) : e.claim} (${sourceLabel(e)})`).join("; ") + "."
      : unknownLine(d);
    return {
      dimension: d, weight: weights[d], grade, mean: round1(b.mean),
      low: round1(Math.max(0, b.mean - 1.2816 * b.sd)), high: round1(Math.min(100, b.mean + 1.2816 * b.sd)),
      evidence_count: items.length, summary,
    };
  });
}

function buildReasons(result: ScoreResult): Assessment["reasons"] {
  const weights = WEIGHTS[result.category];
  const pick = (direction: "for" | "against") => {
    const seen = new Set<string>();
    return result.evidence
      .filter((e) => e.direction === direction)
      .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0))
      .map((e) => `${e.claim} (${sourceLabel(e)})`)
      .filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
      .slice(0, 4);
  };
  const unknown = DIMENSIONS
    .filter((d) => weights[d] > 0 && result.beliefs[d].direct === 0)
    .map(unknownLine);
  return { for: pick("for"), against: pick("against"), unknown };
}

function resolveCategory(input: AssessmentInput, report: VisionReport | null): { category: Category; source: Assessment["category_source"] } {
  if (input.category) return { category: input.category, source: "request" };
  const seen = report?.garment_category;
  if (seen && (CATEGORIES as readonly string[]).includes(seen)) return { category: seen as Category, source: "vision" };
  return { category: "other", source: "default" };
}

export async function assess(
  input: AssessmentInput, images: ImageInput[], vision: VisionProvider | null,
): Promise<Assessment> {
  const warnings: string[] = [];
  const visionInfo: Assessment["vision"] = { status: "no_images", model: null, detail: null, images: [] };
  let report: VisionReport | null = null;

  if (images.length > 0) {
    if (!vision) {
      visionInfo.status = "skipped_no_provider";
      visionInfo.detail = "No vision provider is configured, so the photos were not analysed.";
      warnings.push("Photos were received but not analysed: no vision provider is configured on the server.");
    } else {
      visionInfo.model = vision.model;
      try {
        report = await vision.analyze(images);
        visionInfo.status = "analyzed";
      } catch (err) {
        if (!(err instanceof VisionError)) throw err;
        visionInfo.status = "failed";
        visionInfo.detail = err.message;
        warnings.push(`Photos could not be analysed: ${err.message}`);
      }
    }
  }

  if (report) {
    const shown = report.images.filter((i) => i.image_index >= 0 && i.image_index < images.length);
    const nothingIsClothing = report.garment_category === "not_clothing"
      || (shown.length > 0 && shown.every((i) => i.shot_type === "not_clothing"));
    const hasOtherInput = Boolean(input.page_text || input.reviews?.length);
    if (nothingIsClothing && !hasOtherInput) {
      throw new NoGarmentError("None of the photos appear to show clothing.");
    }
    visionInfo.images = shown.map((i) => ({
      index: i.image_index, shot_type: i.shot_type, quality: i.image_quality, flags: i.photo_flags,
    }));
  }

  const { category, source: categorySource } = resolveCategory(input, report);
  const evidence: Evidence[] = [];
  const notes: Note[] = [];
  const have = new Set<string>();

  let silentOnFabric = false;
  const pageText = [input.title, input.page_text].filter(Boolean).join("\n");
  if (input.page_text) {
    have.add("product_page");
    const page = extractPageText(category, pageText);
    evidence.push(...page.evidence);
    notes.push(...page.notes);
    silentOnFabric = page.silentOnFabricDetail;
  }
  if (input.reviews?.length) {
    have.add("reviews");
    evidence.push(...extractReviews(input.reviews));
  }
  if (report) {
    const v = extractVision(category, report, images.length);
    evidence.push(...v.evidence);
    notes.push(...v.notes);
    warnings.push(...v.warnings);
    for (const s of v.shotTypes) have.add(s);
    if (v.evidence.some((e) => e.source.type === "label")) silentOnFabric = false;
  }
  for (const img of images) if (img.captureKind && report) have.add(img.captureKind);
  evidence.push(...priorEvidence(category, input, silentOnFabric, Boolean(input.page_text)));

  const result = score(category, evidence);
  const graded = result.confidence !== "insufficient";
  const reasons = buildReasons(result);
  const next = nextBestEvidence(result, have);

  let headline: string;
  if (!graded) {
    headline = "Not enough information to grade this garment.";
  } else if (result.range.low === result.range.high) {
    headline = `${result.grade}, ${result.confidence} confidence.`;
  } else {
    headline = `${result.grade}, likely range ${result.range.low} to ${result.range.high}, ${result.confidence} confidence.`;
  }

  let value: Assessment["value"] = null;
  if (graded && input.price !== undefined) {
    const band = priceBand(category, input.price);
    const index = Math.round(result.overall.mean - PRICE_EXPECTATION[band]);
    value = { index, label: index >= 8 ? "strong value" : index >= -5 ? "fair value" : "poor value", price_band: band };
  }
  if (input.price !== undefined && input.currency && input.currency.toUpperCase() !== "USD") {
    warnings.push("Price bands are defined in USD; the price was used as given without conversion.");
  }

  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    title: input.title ?? null,
    brand: input.brand ?? null,
    category,
    category_source: categorySource,
    status: graded ? "graded" : "insufficient_information",
    grade: graded ? result.grade : null,
    headline,
    confidence: result.confidence,
    score: graded ? {
      mean: round1(result.overall.mean), low: round1(result.overall.low), high: round1(result.overall.high),
      conservative: round1(result.overall.low),
    } : null,
    likely_range: graded ? result.range : null,
    dimensions: buildDimensions(result),
    reasons,
    evidence: result.evidence,
    notes,
    next_best_evidence: next ? {
      dimension: next.dimension, capture_kind: next.kind as CaptureKind | "reviews" | "product_page",
      prompt: next.prompt, expected_range_reduction: round1(next.reduction),
    } : null,
    value,
    vision: visionInfo,
    warnings,
  };
}

/** Rank by the conservative end of the range, so thin evidence cannot outrank solid evidence. */
export function rank(assessments: Assessment[]): Assessment[] {
  return [...assessments].sort((a, b) => (b.score?.conservative ?? -1) - (a.score?.conservative ?? -1));
}
