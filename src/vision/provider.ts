import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ImageInput } from "../types.js";
import { VISION_SYSTEM_PROMPT, VisionReportSchema, type VisionReport } from "./schema.js";

export interface VisionProvider {
  readonly model: string;
  analyze(images: ImageInput[]): Promise<VisionReport>;
}

export class VisionError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export class AnthropicVision implements VisionProvider {
  readonly model: string;
  private client: Anthropic;

  constructor(opts: { model?: string; client?: Anthropic } = {}) {
    this.model = opts.model ?? "claude-opus-5-5";
    this.client = opts.client ?? new Anthropic();
  }

  async analyze(images: ImageInput[]): Promise<VisionReport> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    images.forEach((img, i) => {
      const declared = img.captureKind ? ` The user was asked for a "${img.captureKind}" shot.` : "";
      content.push({ type: "text", text: `Image ${i}.${declared}` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.bytes.toString("base64") },
      });
    });
    content.push({ type: "text", text: `Fill in the checklist for these ${images.length} image(s).` });

    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        // If the primary model declines a request, the API retries it on a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: VISION_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output_config: { effort: "medium", format: betaZodOutputFormat(VisionReportSchema) },
      });
      if (response.stop_reason === "refusal") {
        throw new VisionError("The vision model declined to analyse these images.", false);
      }
      if (response.stop_reason === "max_tokens" || !response.parsed_output) {
        throw new VisionError("The vision model returned an incomplete checklist.", true);
      }
      return response.parsed_output;
    } catch (err) {
      if (err instanceof VisionError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new VisionError("Vision provider rejected the API key.", false);
      if (err instanceof Anthropic.BadRequestError) throw new VisionError(`Vision request was rejected: ${err.message}`, false);
      if (err instanceof Anthropic.RateLimitError) throw new VisionError("Vision provider is rate limited.", true);
      if (err instanceof Anthropic.APIError) throw new VisionError(`Vision provider error (${err.status ?? "network"}).`, true);
      throw err;
    }
  }
}

/** Blank checklist: what an image that shows nothing useful looks like. */
export function blankChecklist(index: number): VisionReport["images"][number] {
  return {
    image_index: index, shot_type: "other_detail", image_quality: "usable", photo_flags: [],
    stitch_regularity: "not_visible", stitch_density: "not_visible", seam_puckering: "not_visible",
    seam_finish: "not_visible", loose_threads: "not_visible", pattern_matching: "not_visible",
    hem_finish: "not_visible", lining: "not_visible", hardware_quality: "not_visible",
    hardware_brand_text: null, button_attachment: "not_visible", fabric_surface: "not_visible",
    fabric_opacity: "not_visible", knit_or_weave_density: "not_visible", wear_signs: "not_visible",
    label: { composition: [], origin_country: null, brand_text: null },
  };
}

/**
 * Replays a canned report. Used by tests and the offline back-test so the
 * whole pipeline after the model call can be exercised without a key.
 */
export class FixtureVision implements VisionProvider {
  readonly model = "fixture";
  constructor(private report: VisionReport | ((images: ImageInput[]) => VisionReport)) {}
  async analyze(images: ImageInput[]): Promise<VisionReport> {
    return typeof this.report === "function" ? this.report(images) : this.report;
  }
}
