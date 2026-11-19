import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { NoGarmentError, assess, rank } from "./pipeline.js";
import { CAPTURE_PROMPTS } from "./rubric.js";
import { Store } from "./store.js";
import { AssessmentInputSchema, CAPTURE_KINDS, type AssessmentInput, type ImageInput } from "./types.js";
import type { VisionProvider } from "./vision/provider.js";

export const MAX_IMAGES = 8;
/** The vision API takes at most 5 MB per image; clients should downscale before upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Trust the bytes, not the Content-Type header. */
export function sniffImage(bytes: Buffer): ImageInput["mediaType"] | "heic" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (bytes.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heif)/.test(bytes.subarray(8, 12).toString("latin1"))) return "heic";
  return null;
}

function toImage(bytes: Buffer, position: number): ImageInput {
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "image_too_large", `Image ${position} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  const kind = sniffImage(bytes);
  if (kind === "heic") throw new HttpError(415, "heic_not_supported", `Image ${position} is HEIC. Convert to JPEG before uploading.`);
  if (!kind) throw new HttpError(415, "unsupported_image", `Image ${position} is not a JPEG, PNG, WebP or GIF.`);
  return { bytes, mediaType: kind };
}

const JsonBodySchema = AssessmentInputSchema.extend({
  images: z.array(z.object({
    data_base64: z.string().min(16),
    capture_kind: z.enum(CAPTURE_KINDS).nullable().optional(),
  })).max(MAX_IMAGES).optional(),
});

function parseInput(raw: unknown): AssessmentInput {
  const parsed = AssessmentInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(400, "invalid_request", `${issue?.path.join(".") || "payload"}: ${issue?.message ?? "invalid"}`);
  }
  return parsed.data;
}

export interface AppOptions {
  vision: VisionProvider | null;
  store?: Store;
  apiToken?: string | null;
  logger?: boolean;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: Math.ceil(MAX_IMAGES * MAX_IMAGE_BYTES * 1.4) });
  const store = opts.store ?? new Store(null);
  app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES, fields: 10, fieldSize: 2 * 1024 * 1024 } });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof NoGarmentError) return reply.status(422).send({ error: { code: "no_garment_detected", message: err.message } });
    if (err.code === "FST_REQ_FILE_TOO_LARGE") return reply.status(413).send({ error: { code: "image_too_large", message: `An image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` } });
    if (err.code === "FST_FILES_LIMIT") return reply.status(400).send({ error: { code: "too_many_images", message: `At most ${MAX_IMAGES} images per request.` } });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: { code: "bad_request", message: err.message } });
    app.log.error(err);
    return reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong on the server." } });
  });

  app.addHook("onRequest", async (req) => {
    if (!opts.apiToken || !req.url.startsWith("/v1/")) return;
    const given = Buffer.from(req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");
    const expected = Buffer.from(opts.apiToken);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(401, "unauthorized", "Missing or invalid bearer token.");
    }
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  app.get("/", async (_req, reply) => reply.type("text/html").send(readFileSync(path.join(here, "public", "index.html"))));

  app.get("/health", async () => ({
    status: "ok",
    vision: opts.vision ? { enabled: true, model: opts.vision.model } : { enabled: false, model: null },
    auth_required: Boolean(opts.apiToken),
  }));

  app.get("/v1/capture-guide", async () => ({
    max_images: MAX_IMAGES,
    max_image_bytes: MAX_IMAGE_BYTES,
    accepted_types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    steps: [
      { kind: "full_garment", title: "Whole garment", instruction: "Lay it flat or hang it, in daylight. Fill the frame." },
      { kind: "care_label", title: "Care label", instruction: "The sewn-in label with the fibre percentages. Make the text sharp." },
      { kind: "seam_interior", title: "Inside seam", instruction: "Turn it inside out and photograph a side seam up close." },
      { kind: "fabric_macro", title: "Fabric close-up", instruction: "As close as your camera will focus, flat, in good light." },
      { kind: "hardware_closeup", title: "Zipper or buttons", instruction: "Close enough to read any mark on the zipper pull." },
      { kind: "backlit_fabric", title: "Fabric held to light", instruction: "Hold a single layer up to a window." },
    ].map((s) => ({ ...s, why: CAPTURE_PROMPTS[s.kind]?.prompt ?? null })),
  }));

  app.post("/v1/assessments", async (req, reply) => {
    let input: AssessmentInput = {};
    const images: ImageInput[] = [];

    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "images") { part.file.resume(); continue; }
          images.push(toImage(await part.toBuffer(), images.length + 1));
        } else if (part.fieldname === "payload") {
          let json: unknown;
          try { json = JSON.parse(String(part.value)); } catch { throw new HttpError(400, "invalid_request", "payload is not valid JSON."); }
          input = parseInput(json);
        }
      }
      images.forEach((img, i) => { img.captureKind = input.capture_kinds?.[i] ?? null; });
    } else {
      const parsed = JsonBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new HttpError(400, "invalid_request", `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`);
      }
      const { images: encoded, ...rest } = parsed.data;
      input = rest;
      (encoded ?? []).forEach((e, i) => {
        const img = toImage(Buffer.from(e.data_base64, "base64"), i + 1);
        img.captureKind = e.capture_kind ?? rest.capture_kinds?.[i] ?? null;
        images.push(img);
      });
    }

    if (images.length === 0 && !input.page_text && !input.reviews?.length) {
      throw new HttpError(400, "nothing_to_assess", "Send at least one image, page_text, or reviews.");
    }

    const assessment = await assess(input, images, opts.vision);
    store.save(assessment);
    return reply.status(201).send(assessment);
  });

  app.get<{ Params: { id: string } }>("/v1/assessments/:id", async (req) => {
    const found = store.get(req.params.id);
    if (!found) throw new HttpError(404, "not_found", "No assessment with that id.");
    return found;
  });

  /** Ranked list, best conservative score first; ungraded items last. */
  app.get("/v1/assessments", async () => ({
    assessments: rank(store.all()).map((a) => ({
      id: a.id, created_at: a.created_at, title: a.title, brand: a.brand, category: a.category,
      status: a.status, grade: a.grade, headline: a.headline, confidence: a.confidence,
      conservative_score: a.score?.conservative ?? null, value: a.value,
    })),
  }));

  return app;
}
