import { describe, expect, it } from "vitest";
import { TINY_PNG } from "../backtest/harness.js";
import { buildApp, sniffImage } from "../src/server.js";
import type { ImageInput } from "../src/types.js";
import { FixtureVision, VisionError, blankChecklist, type VisionProvider } from "../src/vision/provider.js";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(32)]);

function multipart(files: { name?: string; bytes: Buffer; type?: string }[], payload?: unknown) {
  const boundary = "----seamwisetest";
  const chunks: Buffer[] = [];
  if (payload !== undefined) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(payload)}\r\n`));
  }
  files.forEach((f, i) => {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.name ?? "images"}"; filename="p${i}.jpg"\r\nContent-Type: ${f.type ?? "image/jpeg"}\r\n\r\n`));
    chunks.push(f.bytes, Buffer.from("\r\n"));
  });
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

/** A guided capture of a well-made cotton shirt: label, inside seam, buttons. */
const goodShirt = new FixtureVision((images: ImageInput[]) => ({
  garment_category: "shirt",
  images: images.map((_, i) => ({
    ...blankChecklist(i),
    ...(i === 0 ? { shot_type: "care_label" as const, label: { composition: [{ fiber: "Cotton", percent: 100 }], origin_country: "Portugal", brand_text: null } } : {}),
    ...(i === 1 ? { shot_type: "seam_interior" as const, seam_finish: "enclosed" as const, stitch_regularity: "even" as const, stitch_density: "high" as const } : {}),
    ...(i === 2 ? { shot_type: "hardware_closeup" as const, button_attachment: "secure_shanked" as const } : {}),
  })),
}));

describe("POST /v1/assessments", () => {
  it("accepts photos as multipart and returns a graded, explained assessment", async () => {
    const app = buildApp({ vision: goodShirt });
    const res = await app.inject({ method: "POST", url: "/v1/assessments",
      ...multipart([{ bytes: JPEG }, { bytes: TINY_PNG, type: "image/png" }, { bytes: JPEG }], { capture_kinds: ["care_label", "seam_interior", "hardware_closeup"] }) });
    expect(res.statusCode).toBe(201);
    const a = res.json();
    expect(a.status).toBe("graded");
    expect(a.grade).toBe("Good");
    expect(a.category).toBe("shirt");
    expect(a.category_source).toBe("vision");
    expect(a.vision.status).toBe("analyzed");
    expect(a.vision.images).toHaveLength(3);
    expect(a.headline).toContain("confidence");
    expect(a.reasons.for.join(" ")).toContain("Seams are enclosed");
    expect(a.notes[0].claim).toBe("Made in Portugal");
    expect(a.evidence.find((e: { key: string }) => e.key === "fabric.composition").source).toEqual({ type: "label", images: [0] });
    expect(a.next_best_evidence.capture_kind).toBe("reviews"); // the only thing still missing
    expect(a.score.conservative).toBe(a.score.low);
  });

  it("passes the bytes and declared capture kind through to the vision provider untouched", async () => {
    let seen: ImageInput[] = [];
    const spy: VisionProvider = { model: "spy", analyze: async (imgs) => { seen = imgs; return { garment_category: "tee", images: imgs.map((_, i) => blankChecklist(i)) }; } };
    const app = buildApp({ vision: spy });
    await app.inject({ method: "POST", url: "/v1/assessments",
      ...multipart([{ bytes: TINY_PNG, type: "application/octet-stream" }, { bytes: JPEG }], { capture_kinds: ["care_label", null], page_text: "100% cotton, 200 GSM" }) });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.bytes.equals(TINY_PNG)).toBe(true);
    expect(seen[0]!.mediaType).toBe("image/png"); // sniffed from bytes, not the header
    expect(seen[0]!.captureKind).toBe("care_label");
    expect(seen[1]!.mediaType).toBe("image/jpeg");
  });

  it("accepts the same request as JSON with base64 images", async () => {
    const app = buildApp({ vision: goodShirt });
    const res = await app.inject({ method: "POST", url: "/v1/assessments", payload: {
      price: 120, images: [{ data_base64: JPEG.toString("base64"), capture_kind: "care_label" }, { data_base64: JPEG.toString("base64") }, { data_base64: JPEG.toString("base64") }] } });
    expect(res.statusCode).toBe(201);
    expect(res.json().grade).toBe("Good");
    expect(res.json().value.price_band).toBe("premium");
  });

  it("without a vision provider, says so plainly and scores from the text alone", async () => {
    const app = buildApp({ vision: null });
    const res = await app.inject({ method: "POST", url: "/v1/assessments", ...multipart([{ bytes: JPEG }], { category: "tee", page_text: "100% Supima cotton, 220 GSM, ring-spun." }) });
    const a = res.json();
    expect(res.statusCode).toBe(201);
    expect(a.vision.status).toBe("skipped_no_provider");
    expect(a.warnings[0]).toContain("not analysed");
    expect(a.status).toBe("graded");
    expect(a.evidence.every((e: { source: { type: string } }) => e.source.type !== "image")).toBe(true);
  });

  it("with photos only and no provider, refuses rather than inventing a grade", async () => {
    const app = buildApp({ vision: null });
    const a = (await app.inject({ method: "POST", url: "/v1/assessments", ...multipart([{ bytes: JPEG }]) })).json();
    expect(a.status).toBe("insufficient_information");
    expect(a.grade).toBeNull();
  });

  it("when the vision call fails, still answers from the other evidence and reports the failure", async () => {
    const broken: VisionProvider = { model: "x", analyze: async () => { throw new VisionError("Vision provider is rate limited.", true); } };
    const app = buildApp({ vision: broken });
    const a = (await app.inject({ method: "POST", url: "/v1/assessments", ...multipart([{ bytes: JPEG }], { category: "denim", page_text: "100% cotton 14oz selvedge denim, chain-stitched." }) })).json();
    expect(a.vision.status).toBe("failed");
    expect(a.warnings.join(" ")).toContain("rate limited");
    expect(a.status).toBe("graded");
  });

  it("returns 422 when the photos do not show clothing", async () => {
    const app = buildApp({ vision: new FixtureVision({ garment_category: "not_clothing", images: [{ ...blankChecklist(0), shot_type: "not_clothing" }] }) });
    const res = await app.inject({ method: "POST", url: "/v1/assessments", ...multipart([{ bytes: JPEG }]) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("no_garment_detected");
  });

  it("ignores a non-clothing photo mixed in with real ones", async () => {
    const app = buildApp({ vision: new FixtureVision({ garment_category: "tee", images: [
      { ...blankChecklist(0), shot_type: "not_clothing" },
      { ...blankChecklist(1), shot_type: "fabric_macro", knit_or_weave_density: "tight", fabric_surface: "smooth_dense" },
      { ...blankChecklist(2), shot_type: "seam_interior", seam_finish: "overlocked_neat", stitch_regularity: "even" }] }) });
    const a = (await app.inject({ method: "POST", url: "/v1/assessments", ...multipart([{ bytes: JPEG }, { bytes: JPEG }, { bytes: JPEG }]) })).json();
    expect(a.warnings.join(" ")).toContain("Image 1 does not appear to show clothing");
    expect(a.status).toBe("graded");
  });

  it("rejects bad input with a specific error", async () => {
    const app = buildApp({ vision: goodShirt });
    const post = (body: ReturnType<typeof multipart> | { payload: object | string }) => app.inject({ method: "POST", url: "/v1/assessments", ...body });

    const heic = await post(multipart([{ bytes: HEIC }]));
    expect([heic.statusCode, heic.json().error.code]).toEqual([415, "heic_not_supported"]);

    const text = await post(multipart([{ bytes: Buffer.from("this is not an image at all") }]));
    expect([text.statusCode, text.json().error.code]).toEqual([415, "unsupported_image"]);

    const many = await post(multipart(Array.from({ length: 9 }, () => ({ bytes: JPEG }))));
    expect([many.statusCode, many.json().error.code]).toEqual([400, "too_many_images"]);

    const big = await post(multipart([{ bytes: Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]) }]));
    expect([big.statusCode, big.json().error.code]).toEqual([413, "image_too_large"]);

    const empty = await post({ payload: {} });
    expect([empty.statusCode, empty.json().error.code]).toEqual([400, "nothing_to_assess"]);

    const badField = await post({ payload: { category: "shoes", page_text: "x" } });
    expect([badField.statusCode, badField.json().error.code]).toEqual([400, "invalid_request"]);

    const badJson = await post(multipart([{ bytes: JPEG }], "{not json"));
    expect(badJson.statusCode).toBe(400);
  });
});

describe("the rest of the API", () => {
  it("stores assessments, fetches by id, and lists them ranked by conservative score", async () => {
    const app = buildApp({ vision: null });
    const post = async (payload: unknown) => (await app.inject({ method: "POST", url: "/v1/assessments", payload: payload as object })).json();
    const weak = await post({ category: "tee", title: "weak", page_text: "60% polyester, 40% cotton. 130 GSM." });
    const strong = await post({ category: "tee", title: "strong", page_text: "100% Supima cotton, 220 GSM, ring-spun, combed." });
    const none = await post({ category: "tee", title: "none", page_text: "A tee." });

    expect((await app.inject({ url: `/v1/assessments/${strong.id}` })).json().id).toBe(strong.id);
    expect((await app.inject({ url: "/v1/assessments/nope" })).statusCode).toBe(404);

    const list = (await app.inject({ url: "/v1/assessments" })).json().assessments;
    expect(list.map((a: { title: string }) => a.title)).toEqual(["strong", "weak", "none"]);
    expect(list[2].conservative_score).toBeNull();
    expect(weak.id).not.toBe(strong.id);
    expect(none.status).toBe("insufficient_information");
  });

  it("enforces the bearer token on /v1 when one is configured", async () => {
    const app = buildApp({ vision: null, apiToken: "test-token-value" });
    const body = { payload: { category: "tee", page_text: "100% cotton, 200 GSM" } };
    expect((await app.inject({ method: "POST", url: "/v1/assessments", ...body })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/assessments", ...body, headers: { authorization: "Bearer wrong-token-value" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/assessments", ...body, headers: { authorization: "Bearer test-token-value" } })).statusCode).toBe(201);
    expect((await app.inject({ url: "/health" })).json()).toMatchObject({ status: "ok", auth_required: true, vision: { enabled: false } });
  });

  it("serves the capture guide and the test console", async () => {
    const app = buildApp({ vision: null });
    const guide = (await app.inject({ url: "/v1/capture-guide" })).json();
    expect(guide.steps.map((s: { kind: string }) => s.kind)).toContain("care_label");
    expect(guide.max_images).toBe(8);
    const page = await app.inject({ url: "/" });
    expect(page.headers["content-type"]).toContain("text/html");
  });

  it("recognises image types from their bytes", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(TINY_PNG)).toBe("image/png");
    expect(sniffImage(HEIC)).toBe("heic");
    expect(sniffImage(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(Buffer.from("<html><body>hello</body></html>"))).toBeNull();
  });
});
