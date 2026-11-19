import { describe, expect, it } from "vitest";
import { GeminiVision, type GeminiClientLike, type GeminiResponseLike } from "../src/vision/gemini.js";
import { providerFromEnv } from "../src/vision/factory.js";
import { AnthropicVision, VisionError, blankChecklist } from "../src/vision/provider.js";
import type { ImageInput } from "../src/types.js";

const img = (captureKind?: ImageInput["captureKind"]): ImageInput => ({ bytes: Buffer.from("fake"), mediaType: "image/jpeg", captureKind });
const report = (n: number) => ({ garment_category: "tee", images: Array.from({ length: n }, (_, i) => ({ ...blankChecklist(i), seam_finish: "enclosed" })) });

function fake(reply: GeminiResponseLike | Error, seen: unknown[] = []): GeminiClientLike {
  return { models: { generateContent: async (p) => { seen.push(p); if (reply instanceof Error) throw reply; return reply; } } };
}
const ok = (obj: unknown): GeminiResponseLike => ({ text: JSON.stringify(obj), candidates: [{ finishReason: "STOP" }] });
const fail = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as VisionError);

describe("GeminiVision", () => {
  it("sends the images with a strict schema and returns a validated checklist", async () => {
    const seen: any[] = [];
    const g = new GeminiVision({ client: fake(ok(report(2)), seen) });
    const out = await g.analyze([img("care_label"), img("full_garment")]);
    expect(out.images).toHaveLength(2);
    const sent = seen[0];
    expect(sent.model).toBe("gemini-3.5-flash");
    expect(sent.config.responseMimeType).toBe("application/json");
    expect(sent.config.responseJsonSchema.$schema).toBeUndefined();
    expect(JSON.stringify(sent.config.responseJsonSchema)).toContain("overlocked_neat");
    expect(sent.config.systemInstruction).toContain("not_visible");
    const parts = sent.contents[0].parts;
    expect(parts[0].text).toContain('"care_label"');
    expect(parts[1].inlineData.mimeType).toBe("image/jpeg");
    expect(parts[1].inlineData.data).toBe(Buffer.from("fake").toString("base64"));
    // close-ups get the highest image detail, whole-garment shots a lower one
    expect(parts[1].mediaResolution.level).toBe("MEDIA_RESOLUTION_ULTRA_HIGH");
    expect(parts[3].mediaResolution.level).toBe("MEDIA_RESOLUTION_HIGH");
  });

  it("rejects anything the checklist does not allow, instead of passing it on", async () => {
    const bad = { garment_category: "tee", images: [{ ...blankChecklist(0), seam_finish: "excellent_quality" }] };
    const e = await fail(new GeminiVision({ client: fake(ok(bad)) }).analyze([img()]));
    expect(e).toBeInstanceOf(VisionError);
    expect(e!.retryable).toBe(true);
    expect((await fail(new GeminiVision({ client: fake({ text: "not json", candidates: [{ finishReason: "STOP" }] }) }).analyze([img()])))!.message).toContain("valid JSON");
    expect((await fail(new GeminiVision({ client: fake(ok(report(1))) }).analyze([img(), img(), img()])))).toBeNull(); // fewer entries than images is fine
    const offset = { garment_category: "tee", images: [{ ...blankChecklist(7), seam_finish: "enclosed" }] };
    expect((await fail(new GeminiVision({ client: fake(ok(offset)) }).analyze([img()])))!.message).toContain("no entries");
  });

  it("treats safety blocks as final and truncation as retryable", async () => {
    const blocked = await fail(new GeminiVision({ client: fake({ promptFeedback: { blockReason: "SAFETY" } }) }).analyze([img()]));
    expect([blocked!.retryable, blocked!.message]).toEqual([false, "The vision model declined to analyse these images."]);
    const filtered = await fail(new GeminiVision({ client: fake({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] }) }).analyze([img()]));
    expect(filtered!.retryable).toBe(false);
    const cut = await fail(new GeminiVision({ client: fake({ text: "{", candidates: [{ finishReason: "MAX_TOKENS" }] }) }).analyze([img()]));
    expect(cut!.retryable).toBe(true);
  });

  it("maps HTTP failures to clear, correctly retryable errors", async () => {
    const status = async (s?: number) => {
      const err = Object.assign(new Error("x"), s === undefined ? {} : { status: s });
      return fail(new GeminiVision({ client: fake(err) }).analyze([img()]));
    };
    expect([(await status(401))!.retryable, (await status(401))!.message]).toEqual([false, "Vision provider rejected the API key."]);
    expect((await status(404))!.message).toContain("SEAMWISE_GEMINI_MODEL");
    expect((await status(429))!.retryable).toBe(true);
    expect((await status(503))!.retryable).toBe(true);
    expect((await status(400))!.retryable).toBe(false);
    expect((await status())!.message).toBe("Could not reach the vision provider.");
  });
});

describe("providerFromEnv", () => {
  it("uses Gemini when only a Gemini key is set, and respects an explicit choice", () => {
    expect(providerFromEnv({})).toBeNull();
    expect(providerFromEnv({ GEMINI_API_KEY: "k" })).toBeInstanceOf(GeminiVision);
    expect(providerFromEnv({ GEMINI_API_KEY: "k", SEAMWISE_GEMINI_MODEL: "m1" })!.model).toBe("m1");
    expect(providerFromEnv({ ANTHROPIC_API_KEY: "a" })).toBeInstanceOf(AnthropicVision);
    expect(providerFromEnv({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "k" })).toBeInstanceOf(AnthropicVision);
    expect(providerFromEnv({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "k", SEAMWISE_PROVIDER: "gemini" })).toBeInstanceOf(GeminiVision);
    expect(providerFromEnv({ ANTHROPIC_API_KEY: "a", SEAMWISE_PROVIDER: "gemini" })).toBeNull(); // chosen provider has no key
  });
});
