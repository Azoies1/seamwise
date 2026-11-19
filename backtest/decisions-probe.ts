/**
 * Experiment: can a decision model tell fibre and price tier from retailer photos alone?
 * Ground truth comes from the scraped JSON in data/retailers/ (composition text, retailer).
 *
 *   npx tsx --env-file=.env backtest/decisions-probe.ts [maxProducts]
 *
 * Needs GEMINI_API_KEY. Uses gemini-decision-1 (override with SEAMWISE_DECISION_MODEL).
 * Writes per-product answers to backtest/out/decisions-probe.json.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { parseComposition } from "../src/extract/pageText.js";
import { sniffImage } from "../src/server.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data", "retailers");
const model = process.env.SEAMWISE_DECISION_MODEL || "gemini-decision-1";
const maxProducts = Number(process.argv[2] ?? Infinity);
const MAX_IMAGES = 4;

// shortcut: hand-assigned tiers from the retailer's market position, not measured quality.
const TIER: Record<string, string> = {
  fashionnova: "budget", hm: "budget", uniqlo: "budget", zara: "budget", gap: "budget", nike: "mid",
  simons: "mid", burberry: "luxury", louisvuitton: "luxury", balenciaga: "luxury",
};
const FAMILY: Record<string, string> = {
  cotton: "cotton", premium_cotton: "cotton", organic_cotton: "cotton", recycled_polyester: "polyester",
};
const FIBERS = ["cotton", "polyester", "linen", "wool", "acrylic", "viscose", "nylon"];

const questions = {
  dominant_fiber: {
    type: "choice" as const,
    instructions: "Judging only from how the fabric looks in these photos (texture, sheen, drape, wrinkling), which fibre makes up most of this garment? Ignore any product name or marketing text.",
    criteria: {
      ...Object.fromEntries(FIBERS.map((f) => [f, `Mostly ${f}`])),
      cannot_tell: "The photos do not show the fabric well enough to tell",
    },
  },
  contains_synthetic: {
    type: "noul" as const,
    instructions: "Does the fabric contain a visible share of synthetic fibre (polyester, acrylic, nylon), judging by sheen, pilling or texture?",
  },
  price_tier: {
    type: "choice" as const,
    instructions: "Judging only by construction and fabric quality visible in the photos, not by logos or styling, what price tier does this garment belong to?",
    criteria: {
      budget: "Fast fashion, under $30", mid: "Mid-market, $30-80", premium: "Premium, $80-250", luxury: "Luxury, over $250",
    },
  },
};

type Answer = { choice?: string; noul?: number; confidence?: number; probabilities?: Record<string, number> };

function truth(composition: string[]): { fiber: string | null; synthetic: boolean } {
  const parts = parseComposition(composition.join(", "))?.parts ?? [];
  if (parts.length === 0) return { fiber: null, synthetic: false };
  const byFamily = new Map<string, number>();
  for (const p of parts) {
    const fam = FAMILY[p.fiber] ?? p.fiber;
    byFamily.set(fam, (byFamily.get(fam) ?? 0) + p.pct);
  }
  const top = [...byFamily].sort((a, b) => b[1] - a[1])[0]![0];
  const synthetic = parts.some((p) => ["polyester", "recycled_polyester", "acrylic", "nylon"].includes(p.fiber) && p.pct >= 10);
  return { fiber: top, synthetic };
}

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const products = readdirSync(dataDir).filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) as { retailer: string; id: string; title: string; composition: string[] }[]);

const rows: Record<string, unknown>[] = [];
let done = 0;
for (const p of products) {
  if (done >= maxProducts) break;
  const dir = path.join(dataDir, p.retailer, p.id);
  if (!existsSync(dir)) continue;
  const input = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, MAX_IMAGES).flatMap((f) => {
    const bytes = readFileSync(path.join(dir, f));
    const mime = sniffImage(bytes);
    return mime && mime !== "heic" ? [{ type: "image" as const, data: bytes.toString("base64"), mime_type: mime }] : [];
  });
  if (input.length === 0) continue;
  done++;

  const t = truth(p.composition);
  const started = Date.now();
  try {
    const res = await client.decisions.create({ model, input, questions, api_version: "v1beta" } as never);
    const a = (res.answers ?? {}) as Record<string, Answer>;
    const row = {
      product: `${p.retailer}/${p.id}`, title: p.title, images: input.length, ms: Date.now() - started,
      true_fiber: t.fiber, got_fiber: a.dominant_fiber?.choice, fiber_conf: a.dominant_fiber?.confidence,
      true_synthetic: t.synthetic, p_synthetic: a.contains_synthetic?.noul,
      true_tier: TIER[p.retailer], got_tier: a.price_tier?.choice, tier_probs: a.price_tier?.probabilities,
      input_tokens: (res.usage as { total_input_tokens?: number } | undefined)?.total_input_tokens,
    };
    rows.push(row);
    console.log(`${row.product.padEnd(36)} fiber ${String(t.fiber).padEnd(9)} got ${String(row.got_fiber).padEnd(11)} (${row.fiber_conf?.toFixed(2)})  tier ${row.true_tier}/${row.got_tier}  ${row.ms}ms`);
  } catch (err) {
    rows.push({ product: `${p.retailer}/${p.id}`, error: (err as Error).message });
    console.log(`${p.retailer}/${p.id}: FAILED - ${(err as Error).message}`);
  }
}

mkdirSync(path.join(root, "backtest", "out"), { recursive: true });
writeFileSync(path.join(root, "backtest", "out", "decisions-probe.json"), JSON.stringify(rows, null, 2));

const ok = rows.filter((r) => !("error" in r));
const pct = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "n/a");
const fiberRows = ok.filter((r) => r.true_fiber);
const answered = fiberRows.filter((r) => r.got_fiber !== "cannot_tell");
const confident = answered.filter((r) => (r.fiber_conf as number) >= 0.8);
const synthRows = ok.filter((r) => typeof r.p_synthetic === "number");
const tierRows = ok.filter((r) => r.true_tier);
const lux = (t: unknown) => (t === "luxury" || t === "premium" ? "high" : "low");
console.log(`\nmodel ${model}, ${ok.length} products scored, ${rows.length - ok.length} failed`);
console.log(`dominant fibre, all:            ${pct(fiberRows.filter((r) => r.got_fiber === r.true_fiber).length, fiberRows.length)}`);
console.log(`dominant fibre, when it answered: ${pct(answered.filter((r) => r.got_fiber === r.true_fiber).length, answered.length)}`);
console.log(`dominant fibre, confidence>=0.8: ${pct(confident.filter((r) => r.got_fiber === r.true_fiber).length, confident.length)}`);
console.log(`synthetic yes/no at p=0.5:       ${pct(synthRows.filter((r) => ((r.p_synthetic as number) >= 0.5) === r.true_synthetic).length, synthRows.length)}`);
console.log(`price tier exact:                ${pct(tierRows.filter((r) => r.got_tier === r.true_tier).length, tierRows.length)}`);
console.log(`price tier high vs low:          ${pct(tierRows.filter((r) => lux(r.got_tier) === lux(r.true_tier)).length, tierRows.length)}`);
