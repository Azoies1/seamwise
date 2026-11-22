import { describe, expect, it } from "vitest";
import { DecisionVision } from "../src/vision/decision.js";
import { decisionClient, decisionSettings } from "../src/vision/decisions.js";
import { providerFromEnv } from "../src/vision/factory.js";
import { VisionError } from "../src/vision/provider.js";
import { CHOICE_FIELDS, PHOTO_FLAGS, buildQuestions } from "../src/vision/questions.js";
import { ImageChecklistSchema } from "../src/vision/schema.js";
import type { ImageInput } from "../src/types.js";

const img = (captureKind?: ImageInput["captureKind"]): ImageInput => ({ bytes: Buffer.from("fake"), mediaType: "image/jpeg", captureKind });

type Sent = { url: string; headers: Record<string, string>; body: any };

/** A Gemini Decisions endpoint that answers every question with its first option, or as overridden. */
function fakeGemini(override: Record<string, unknown> = {}, status = 200, sent: Sent[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    sent.push({ url, headers: init.headers as Record<string, string>, body });
    if (status !== 200) return new Response(JSON.stringify({ error: { code: status, message: "x" } }), { status });
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, any>).map(([id, q]) => {
        if (q.type === "noul") return [id, { type: "noul", noul: 0.1 }];
        const options = Object.keys(q.criteria);
        const probabilities = Object.fromEntries(options.map((o, i) => [o, i === 0 ? 0.9 : 0.1 / (options.length - 1)]));
        return [id, { type: "choice", choice: options[0], confidence: 0.9, probabilities }];
      }),
    );
    return new Response(JSON.stringify({ answers: { ...answers, ...override } }), { status: 200 });
  }) as typeof fetch;
}

const vision = (f: typeof fetch, minConfidence?: number) =>
  new DecisionVision(decisionClient({ GEMINI_API_KEY: "k" }, { fetch: f }), {
    model: "gemini/gemini-decision-1",
    ...(minConfidence !== undefined ? { minConfidence } : {}),
  });

describe("questions derived from the checklist schema", () => {
  it("asks one choice question per enum field, with every enum value as an option", () => {
    const q = buildQuestions();
    const shape = ImageChecklistSchema.shape as Record<string, { options?: string[] }>;
    for (const field of CHOICE_FIELDS) {
      const question = q[field];
      expect(question?.kind, field).toBe("choice");
      if (question?.kind !== "choice") continue;
      expect(Object.keys(question.options).sort(), field).toEqual([...shape[field]!.options!].sort());
    }
    for (const flag of PHOTO_FLAGS) expect(q[`flag_${flag}`]?.kind).toBe("yesno");
    expect(q.garment_category?.kind).toBe("choice");
  });

  it("fits Clef's 64-question limit and carries the not_visible rule", () => {
    const q = buildQuestions();
    expect(Object.keys(q).length).toBeLessThanOrEqual(64);
    const seam = q.seam_finish;
    expect(seam?.kind === "choice" && seam.instructions).toContain("not_visible");
    expect(seam?.kind === "choice" && seam.instructions).toContain("interior");
  });
});

describe("DecisionVision", () => {
  it("sends one call per image through letsdecide and returns a valid checklist", async () => {
    const sent: Sent[] = [];
    const out = await vision(fakeGemini({}, 200, sent)).analyze([img("care_label"), img("full_garment")]);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/decisions");
    expect(sent[0]!.headers["x-goog-api-key"]).toBe("k");
    expect(JSON.stringify(sent[0]!.body.input)).toContain('\\"care_label\\" shot');
    expect(JSON.stringify(sent[0]!.body.input)).toContain(Buffer.from("fake").toString("base64"));
    expect(out.images.map((i) => i.image_index)).toEqual([0, 1]);
    expect(out.images[0]!.label).toEqual({ composition: [], origin_country: null, brand_text: null });
  });

  it("falls back to not_visible below the confidence threshold, but keeps confident answers", async () => {
    const unsure = { type: "choice", choice: "enclosed", confidence: 0.4, probabilities: { enclosed: 0.4, overlocked_neat: 0.3, overlocked_loose: 0.1, raw_unfinished: 0.1, not_visible: 0.1 } };
    const sure = { type: "choice", choice: "even", confidence: 0.95, probabilities: { even: 0.95, slightly_uneven: 0.03, irregular: 0.01, not_visible: 0.01 } };
    const out = await vision(fakeGemini({ seam_finish: unsure, stitch_regularity: sure })).analyze([img()]);
    expect(out.images[0]!.seam_finish).toBe("not_visible");
    expect(out.images[0]!.stitch_regularity).toBe("even");
    const lenient = await vision(fakeGemini({ seam_finish: unsure }), 0.3).analyze([img()]);
    expect(lenient.images[0]!.seam_finish).toBe("enclosed");
  });

  it("sets photo flags from yes/no answers at p >= 0.5", async () => {
    const out = await vision(fakeGemini({ flag_studio_retouched: { type: "noul", noul: 0.8 } })).analyze([img()]);
    expect(out.images[0]!.photo_flags).toEqual(["studio_retouched"]);
  });

  it("combines the garment category across images", async () => {
    const cat = (p: Record<string, number>) => ({ type: "choice", choice: Object.entries(p).sort((a, b) => b[1] - a[1])[0]![0], confidence: 0.5, probabilities: p });
    let n = 0;
    const base = fakeGemini();
    const f = (async (url: string, init: RequestInit) => {
      const res = await base(url, init);
      const body = await res.json();
      body.answers.garment_category = n++ === 0
        ? cat({ tee: 0.3, knitwear: 0.1, denim: 0, outerwear: 0, shirt: 0, other: 0.6, not_clothing: 0 })
        : cat({ tee: 0.9, knitwear: 0.1, denim: 0, outerwear: 0, shirt: 0, other: 0, not_clothing: 0 });
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    expect((await vision(f).analyze([img(), img()])).garment_category).toBe("tee");
  });

  it("maps provider failures to VisionError with the right retryability", async () => {
    const fail = (status: number) => vision(fakeGemini({}, status)).analyze([img()]).then(() => null, (e: unknown) => e as VisionError);
    const limited = await fail(429);
    expect(limited).toBeInstanceOf(VisionError);
    expect(limited?.retryable).toBe(true);
    const denied = await fail(403);
    expect(denied?.retryable).toBe(false);
    expect(denied?.message).toContain("API key");
  });

  it("refuses an image type the chosen provider cannot take, before sending", async () => {
    const sent: Sent[] = [];
    const jev = new DecisionVision(decisionClient({ AIMLAPI_KEY: "k" }, { fetch: fakeGemini({}, 200, sent) }), { model: "aiml/typesafe/jev-1.14" });
    const e = await jev.analyze([{ bytes: Buffer.from("x"), mediaType: "image/webp" }]).then(() => null, (err: unknown) => err as VisionError);
    expect(e).toBeInstanceOf(VisionError);
    expect(e?.retryable).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("decision providers in the factory", () => {
  it("selects a decision model by shortcut or by SEAMWISE_DECISION_MODEL", () => {
    expect(providerFromEnv({ SEAMWISE_PROVIDER: "gemini-decisions", GEMINI_API_KEY: "k" })?.model).toBe("gemini/gemini-decision-1");
    expect(providerFromEnv({ SEAMWISE_PROVIDER: "clef-flash", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AUTH_TOKEN: "t" })?.model).toBe("clef/clef-flash");
    expect(providerFromEnv({ SEAMWISE_PROVIDER: "jev", AIMLAPI_KEY: "k" })?.model).toBe("aiml/typesafe/jev-1.14");
    expect(providerFromEnv({ SEAMWISE_PROVIDER: "decisions", SEAMWISE_DECISION_MODEL: "clef/clef", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AUTH_TOKEN: "t" })?.model).toBe("clef/clef");
  });

  it("returns null when the chosen decision model has no credentials", () => {
    expect(providerFromEnv({ SEAMWISE_PROVIDER: "clef" })).toBeNull();
    expect(providerFromEnv({ SEAMWISE_PROVIDER: "decisions", SEAMWISE_DECISION_MODEL: "jev/jev-1.14.0", GEMINI_API_KEY: "k" })).toBeNull();
  });

  it("keeps the generative default when SEAMWISE_PROVIDER is unset", () => {
    expect(providerFromEnv({ GEMINI_API_KEY: "k" })?.model).toBe("gemini-3.5-flash");
  });

  it("gives each provider only its own key", () => {
    const s = decisionSettings({ GEMINI_API_KEY: "g", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AUTH_TOKEN: "t" });
    expect(s).toEqual({ gemini: { apiKey: "g" }, clef: { accountId: "a", apiKey: "t" } });
  });
});
