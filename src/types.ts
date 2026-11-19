import { z } from "zod";

export const CATEGORIES = ["tee", "knitwear", "denim", "outerwear", "shirt", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIMENSIONS = ["fabric", "construction", "hardware", "durability"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const GRADES = ["Poor", "Below average", "Average", "Good", "Excellent"] as const;
export type Grade = (typeof GRADES)[number];

export type Confidence = "high" | "medium" | "low" | "insufficient";

/** The guided-capture shots the iOS app can ask the user for. */
export const CAPTURE_KINDS = [
  "full_garment",
  "fabric_macro",
  "seam_interior",
  "care_label",
  "hardware_closeup",
  "backlit_fabric",
] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export type EvidenceSource =
  | { type: "page_text"; span: string }
  | { type: "image"; images: number[] }
  | { type: "label"; images: number[] }
  | { type: "reviews"; review_ids: string[]; total_reviews: number }
  | { type: "brand_prior"; brand: string }
  | { type: "price"; band: string }
  | { type: "silence" };

/**
 * One typed claim. Everything the scorer and the explanation use is one of
 * these; nothing else reaches the user.
 *
 * `value` is the quality level (0-100) this claim implies for its dimension.
 * `sd` is how far off that implication could be: small sd = reliable source.
 */
export interface Evidence {
  /** Stable key; two items with the same key describe the same fact. */
  key: string;
  /** "overall" = a reading of the garment's general quality (brand record, price). */
  dimension: Dimension | "overall";
  claim: string;
  source: EvidenceSource;
  value: number;
  sd: number;
  /** Filled in by the scorer. */
  direction?: "for" | "against" | "neutral";
  /** Points of final score per point of `value`. */
  weight?: number;
  /** Points this item moved the final score, signed. The contributions sum to (score - 50). */
  contribution?: number;
}

/** Facts worth showing that carry no quality signal (e.g. country of origin). */
export interface Note {
  claim: string;
  source: EvidenceSource;
}

export const ReviewSchema = z.object({
  id: z.string().max(100).optional(),
  text: z.string().max(5000),
  rating: z.number().min(0).max(5).optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** What the client sends alongside the images. Every field is optional. */
export const AssessmentInputSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  brand: z.string().max(120).optional(),
  title: z.string().max(300).optional(),
  price: z.number().positive().max(100000).optional(),
  currency: z.string().length(3).optional(),
  page_text: z.string().max(20000).optional(),
  reviews: z.array(ReviewSchema).max(500).optional(),
  /** capture_kinds[i] says which guided shot image i was meant to be. */
  capture_kinds: z.array(z.enum(CAPTURE_KINDS).nullable()).max(8).optional(),
});
export type AssessmentInput = z.infer<typeof AssessmentInputSchema>;

export interface ImageInput {
  bytes: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  captureKind?: CaptureKind | null;
}

export interface DimensionResult {
  dimension: Dimension;
  weight: number;
  grade: Grade | "Unknown";
  mean: number;
  low: number;
  high: number;
  evidence_count: number;
  summary: string;
}

export interface Assessment {
  id: string;
  created_at: string;
  title: string | null;
  brand: string | null;
  category: Category;
  category_source: "request" | "vision" | "default";
  status: "graded" | "insufficient_information";
  grade: Grade | null;
  headline: string;
  confidence: Confidence;
  score: { mean: number; low: number; high: number; conservative: number } | null;
  likely_range: { low: Grade; high: Grade } | null;
  dimensions: DimensionResult[];
  reasons: { for: string[]; against: string[]; unknown: string[] };
  evidence: Evidence[];
  notes: Note[];
  next_best_evidence: {
    dimension: Dimension;
    capture_kind: CaptureKind | "reviews" | "product_page";
    prompt: string;
    /** How much narrower the likely range would get, in score points. */
    expected_range_reduction: number;
  } | null;
  value: { index: number; label: string; price_band: string } | null;
  vision: {
    status: "analyzed" | "no_images" | "skipped_no_provider" | "failed";
    model: string | null;
    detail: string | null;
    images: { index: number; shot_type: string; quality: string; flags: string[] }[];
  };
  warnings: string[];
}
