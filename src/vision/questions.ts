/**
 * Decision-model questions derived from the checklist schema, so the schema
 * stays the single source of truth: each closed enum becomes a choice question
 * (options from the enum, instructions from `.describe()`), each photo flag a
 * yes/no question. Free-text fields (label text, hardware brand) are left to a
 * generative model: decision models cannot transcribe.
 */
import type { Question } from "letsdecide";
import { z } from "zod";
import { ImageChecklistSchema, VisionReportSchema } from "./schema.js";

/** Plain-English question per checklist field. The schema's description, if any, is appended. */
const ASK: Record<string, string> = {
  shot_type: "What kind of photo is this?",
  image_quality: "How well can fine detail be judged in this photo?",
  stitch_regularity: "How evenly spaced and straight are the visible stitches?",
  stitch_density: "How many stitches per centimetre are visible?",
  seam_puckering: "Is the fabric along the seams puckered or wavy?",
  seam_finish: "How are the raw edges inside the seams finished?",
  loose_threads: "Are there loose or untrimmed threads?",
  pattern_matching: "Do stripes or checks line up across the seams?",
  hem_finish: "How is the hem finished?",
  lining: "Is the garment lined?",
  hardware_quality: "What is the quality of the zips, snaps or other hardware?",
  button_attachment: "How securely are the buttons attached?",
  fabric_surface: "What does the fabric surface look like?",
  fabric_opacity: "How opaque is the fabric?",
  knit_or_weave_density: "How dense is the knit or weave?",
  wear_signs: "How much wear (pilling, holes, fraying, fading) is visible?",
  garment_category: "What kind of garment is shown?",
};

const NOT_VISIBLE_RULE = 'Answer "not_visible" unless the feature is clearly shown in this photo; a wrong guess is worse than not_visible.';

export const PHOTO_FLAGS = ["studio_retouched", "clipped_or_pinned", "render_not_photo", "heavy_filter"] as const;
const FLAG_ASK: Record<(typeof PHOTO_FLAGS)[number], string> = {
  studio_retouched: "Does this look like a studio-lit, retouched retailer photo?",
  clipped_or_pinned: "Is the garment clipped or pinned to change its fit for the photo?",
  render_not_photo: "Is this a 3D render rather than a photograph?",
  heavy_filter: "Has a heavy filter or colour grading been applied?",
};

/** Checklist fields answered by a choice question. */
export const CHOICE_FIELDS = Object.keys(ASK).filter((k) => k !== "garment_category") as (keyof typeof ImageChecklistSchema.shape)[];

function enumOf(schema: z.ZodType): z.ZodEnum | null {
  return schema instanceof z.ZodEnum ? schema : null;
}

function choice(field: string, schema: z.ZodType): Question {
  const e = enumOf(schema);
  if (!e) throw new Error(`checklist field ${field} is not an enum`);
  const values = e.options as string[];
  const parts = [ASK[field] ?? field, schema.description, values.includes("not_visible") ? NOT_VISIBLE_RULE : undefined];
  return {
    kind: "choice",
    instructions: parts.filter(Boolean).join(" "),
    options: Object.fromEntries(values.map((v) => [v, v.replaceAll("_", " ")])),
  };
}

export function buildQuestions(): Record<string, Question> {
  const shape = ImageChecklistSchema.shape as Record<string, z.ZodType>;
  const questions: Record<string, Question> = {};
  for (const field of CHOICE_FIELDS) questions[field] = choice(field, shape[field]!);
  for (const flag of PHOTO_FLAGS) questions[`flag_${flag}`] = { kind: "yesno", instructions: FLAG_ASK[flag] };
  questions.garment_category = choice("garment_category", VisionReportSchema.shape.garment_category);
  return questions;
}
