/**
 * Google Gemini as the vision provider. Same job as AnthropicVision: fill the
 * fixed checklist, never grade. The reply is re-validated against the checklist
 * schema, so a model that ignores the JSON schema cannot put anything into the
 * scorer that the checklist does not allow.
 */
import { ApiError, GoogleGenAI, PartMediaResolutionLevel, createPartFromBase64 } from "@google/genai";
import { z } from "zod";
import type { ImageInput } from "../types.js";
import { VISION_SYSTEM_PROMPT, VisionReportSchema, type VisionReport } from "./schema.js";
import { VisionError, type VisionProvider } from "./provider.js";

/** The slice of the SDK this class uses, so tests can pass a stand-in. */
export interface GeminiClientLike {
  models: { generateContent(params: unknown): Promise<GeminiResponseLike> };
}
export interface GeminiResponseLike {
  text?: string;
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
}

/** Finish reasons where the model declined or was filtered. Retrying will not help. */
const BLOCKED_FINISH = new Set([
  "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT",
]);

/** Gemini's default per-image budget is about half of what a 1600 px photo needs; close-ups get the most. */
function resolutionFor(img: ImageInput): PartMediaResolutionLevel {
  return img.captureKind === "full_garment"
    ? PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH
    : PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH;
}

export class GeminiVision implements VisionProvider {
  readonly model: string;
  private client: GeminiClientLike;

  constructor(opts: { apiKey?: string; model?: string; client?: GeminiClientLike } = {}) {
    this.model = opts.model ?? "gemini-3.5-flash";
    this.client = opts.client ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as unknown as GeminiClientLike);
  }

  async analyze(images: ImageInput[]): Promise<VisionReport> {
    const parts: unknown[] = [];
    images.forEach((img, i) => {
      const declared = img.captureKind ? ` The user was asked for a "${img.captureKind}" shot.` : "";
      parts.push({ text: `Image ${i}.${declared}` });
      parts.push(createPartFromBase64(img.bytes.toString("base64"), img.mediaType, resolutionFor(img)));
    });
    parts.push({ text: `Fill in the checklist for these ${images.length} image(s).` });

    const jsonSchema = z.toJSONSchema(VisionReportSchema) as Record<string, unknown>;
    delete jsonSchema.$schema;

    let response: GeminiResponseLike;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: VISION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          maxOutputTokens: 16000,
        },
      });
    } catch (err) {
      throw mapError(err, this.model);
    }

    const block = response.promptFeedback?.blockReason;
    if (block) throw new VisionError("The vision model declined to analyse these images.", false);
    const finish = response.candidates?.[0]?.finishReason;
    if (finish && BLOCKED_FINISH.has(finish)) throw new VisionError("The vision model declined to analyse these images.", false);
    if (finish === "MAX_TOKENS") throw new VisionError("The vision model returned an incomplete checklist.", true);

    let json: unknown;
    try {
      json = JSON.parse(response.text ?? "");
    } catch {
      throw new VisionError("The vision model did not return valid JSON.", true);
    }
    const parsed = VisionReportSchema.safeParse(json);
    if (!parsed.success) throw new VisionError("The vision model returned a checklist that does not match the schema.", true);
    if (!parsed.data.images.some((i) => i.image_index >= 0 && i.image_index < images.length)) {
      throw new VisionError("The vision model returned no entries for the images sent.", true);
    }
    return parsed.data;
  }
}

function mapError(err: unknown, model: string): VisionError {
  if (err instanceof VisionError) return err;
  const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
  if (status === 401 || status === 403) return new VisionError("Vision provider rejected the API key.", false);
  if (status === 404) return new VisionError(`Vision model "${model}" was not found. Check SEAMWISE_GEMINI_MODEL.`, false);
  if (status === 429) return new VisionError("Vision provider is rate limited.", true);
  if (status === 400) return new VisionError("Vision request was rejected by the provider.", false);
  if (typeof status === "number" && status >= 500) return new VisionError(`Vision provider error (${status}).`, true);
  if (typeof status === "number") return new VisionError(`Vision provider error (${status}).`, false);
  return new VisionError("Could not reach the vision provider.", true);
}
