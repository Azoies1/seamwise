/**
 * Fills the checklist with a decision model instead of a generative one
 * (phase 1 of docs/decision-providers-plan.md). One call per image, because
 * the report has one entry per image and Clef caps a call at 4 images.
 *
 * A field takes the model's top option, except that a field with a
 * "not_visible" option falls back to it when the model's confidence is below
 * the threshold: an unsure observation must not reach the scorer as a fact.
 * Label text stays empty; decision models cannot transcribe.
 */
import { LetsDecideError, type Answer, type Client, type DecisionRequest } from "letsdecide";
import type { ImageInput } from "../types.js";
import { blankChecklist, VisionError, type VisionProvider } from "./provider.js";
import { CHOICE_FIELDS, PHOTO_FLAGS, buildQuestions } from "./questions.js";
import { VisionReportSchema, type ImageChecklist, type VisionReport } from "./schema.js";

export const DEFAULT_MIN_CONFIDENCE = 0.6;
const FLAG_THRESHOLD = 0.5;

/** How sure the model was of its chosen option: its own confidence, else the option's probability. */
export function confidenceOf(a: Extract<Answer, { kind: "choice" }>): number {
  return a.confidence ?? a.probabilities[a.choice] ?? 0;
}

function inputText(img: ImageInput): string {
  const declared = img.captureKind ? ` The user was asked for a "${img.captureKind}" shot.` : "";
  return `One photo of a clothing item.${declared} Report only what is visible in this photo. Never judge overall quality.`;
}

export class DecisionVision implements VisionProvider {
  readonly model: string;
  private readonly questions = buildQuestions();
  /** Fields that can fall back to "not_visible". */
  private readonly canAbstain = new Set(
    CHOICE_FIELDS.filter((f) => {
      const q = this.questions[f];
      return q?.kind === "choice" && Object.hasOwn(q.options, "not_visible");
    }),
  );
  private readonly minConfidence: number;

  constructor(private readonly client: Client, opts: { model: string; minConfidence?: number }) {
    this.model = opts.model;
    this.minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  }

  async analyze(images: ImageInput[]): Promise<VisionReport> {
    const answers = await Promise.all(images.map((img) => this.ask(img)));
    // Category: sum each image's probabilities, so a close-up that cannot tell does not outvote a full shot.
    const totals = new Map<string, number>();
    for (const a of answers) {
      const c = a.garment_category;
      if (c?.kind !== "choice") continue;
      for (const [k, p] of Object.entries(c.probabilities)) totals.set(k, (totals.get(k) ?? 0) + p);
    }
    const category = [...totals].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "other";
    const report = { garment_category: category, images: answers.map((a, i) => this.entry(i, a)) };
    const parsed = VisionReportSchema.safeParse(report);
    if (!parsed.success) throw new VisionError("The decision model returned answers outside the checklist.", true);
    return parsed.data;
  }

  private entry(index: number, answers: Record<string, Answer>): ImageChecklist {
    const entry: Record<string, unknown> = { ...blankChecklist(index) };
    for (const field of CHOICE_FIELDS) {
      const a = answers[field];
      if (a?.kind !== "choice") continue; // refused or missing: keep the blank (not_visible) value
      entry[field] = this.canAbstain.has(field) && confidenceOf(a) < this.minConfidence ? "not_visible" : a.choice;
    }
    entry.photo_flags = PHOTO_FLAGS.filter((f) => {
      const a = answers[`flag_${f}`];
      return a?.kind === "yesno" && a.probability >= FLAG_THRESHOLD;
    });
    return entry as ImageChecklist;
  }

  private async ask(img: ImageInput): Promise<Record<string, Answer>> {
    const request: DecisionRequest = {
      input: inputText(img),
      media: [{ mime_type: img.mediaType, data: img.bytes.toString("base64") }],
      questions: this.questions,
    };
    try {
      const res = await this.client.decide(this.model, request);
      if (Object.values(res.answers).every((a) => a.kind === "refused")) {
        throw new VisionError("The vision model declined to analyse these images.", false);
      }
      return res.answers;
    } catch (err) {
      throw toVisionError(err, this.model);
    }
  }
}

function toVisionError(err: unknown, model: string): VisionError {
  if (err instanceof VisionError) return err;
  if (!(err instanceof LetsDecideError)) return new VisionError("Could not reach the vision provider.", true);
  switch (err.code) {
    case "Auth": return new VisionError("Vision provider rejected the API key.", false);
    case "RateLimited": return new VisionError("Vision provider is rate limited.", true);
    case "Unsupported": return new VisionError(`The decision model "${model}" cannot take this image.`, false);
    case "InvalidRequest":
      return err.details?.reason === "missing_config"
        ? new VisionError(`The decision model "${model}" is not configured. Check its key in .env.`, false)
        : new VisionError("Vision request was rejected by the provider.", false);
    case "BadResponse": return new VisionError("The decision model returned an unexpected response.", true);
    default: return new VisionError(`Vision provider error (${err.status ?? "network"}).`, err.retryable);
  }
}
