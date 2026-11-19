/**
 * Live vision back-test. Needs a vision key (GEMINI_API_KEY or ANTHROPIC_API_KEY) and real photos.
 *
 *   1. Put photos in backtest/images/
 *   2. Describe what each one truly shows in backtest/images/labels.json:
 *        {
 *          "my-tee-label.jpg":  { "shot_type": "care_label", "label_composition": { "cotton": 100 } },
 *          "my-tee-seam.jpg":   { "seam_finish": "overlocked_neat", "stitch_regularity": "even" },
 *          "blurry-pocket.jpg": { "seam_finish": "not_visible" }
 *        }
 *      Only list the checklist items you are sure of. Use "not_visible" for things the
 *      photo does not show: that is how over-claiming gets caught.
 *   3. npm run backtest:vision
 *
 * Each photo is sent on its own, so a wrong answer can be traced to one image.
 * Raw model output is saved to backtest/out/vision-raw.json.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeFiber } from "../src/extract/pageText.js";
import { sniffImage } from "../src/server.js";
import { providerFromEnv } from "../src/vision/factory.js";
import type { ImageChecklist } from "../src/vision/schema.js";

type Labels = Record<string, Record<string, unknown>>;

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "images");
const labelsPath = path.join(dir, "labels.json");

const provider = providerFromEnv();
if (!provider) {
  console.error("No vision key is set. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to .env and run again.");
  process.exit(1);
}
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
if (files.length === 0) {
  console.error(`No photos found in ${dir}. See the comment at the top of backtest/vision.ts.`);
  process.exit(1);
}
const labels: Labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, "utf8")) : {};

const perKey = new Map<string, { right: number; total: number; overclaimed: number }>();
const mistakes: string[] = [];
const raw: Record<string, ImageChecklist | { error: string }> = {};

for (const file of files) {
  const bytes = readFileSync(path.join(dir, file));
  const mediaType = sniffImage(bytes);
  if (!mediaType || mediaType === "heic") { console.log(`${file}: skipped (not JPEG/PNG/WebP)`); continue; }
  let got: ImageChecklist | undefined;
  try {
    got = (await provider.analyze([{ bytes, mediaType }])).images.find((i) => i.image_index === 0);
  } catch (err) {
    raw[file] = { error: (err as Error).message };
    console.log(`${file}: FAILED - ${(err as Error).message}`);
    continue;
  }
  if (!got) { raw[file] = { error: "no entry returned" }; continue; }
  raw[file] = got;

  const answered = Object.entries(got).filter(([k, v]) => typeof v === "string" && v !== "not_visible" && !["shot_type", "image_quality"].includes(k));
  console.log(`${file}: ${got.shot_type}, ${got.image_quality}; answered ${answered.map(([k, v]) => `${k}=${v}`).join(", ") || "nothing"}`);

  for (const [key, expected] of Object.entries(labels[file] ?? {})) {
    const stat = perKey.get(key) ?? { right: 0, total: 0, overclaimed: 0 };
    stat.total++;
    let actual: unknown;
    let ok: boolean;
    if (key === "label_composition") {
      const read = Object.fromEntries(got.label.composition.map((c) => [normalizeFiber(c.fiber) ?? c.fiber, c.percent]));
      const want = Object.fromEntries(Object.entries(expected as Record<string, number>).map(([f, p]) => [normalizeFiber(f) ?? f, p]));
      actual = read;
      ok = JSON.stringify(Object.entries(read).sort()) === JSON.stringify(Object.entries(want).sort());
    } else {
      actual = (got as Record<string, unknown>)[key];
      ok = actual === expected;
      if (!ok && expected === "not_visible") stat.overclaimed++;
    }
    if (ok) stat.right++; else mistakes.push(`${file}: ${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    perKey.set(key, stat);
  }
}

mkdirSync(path.join(here, "out"), { recursive: true });
writeFileSync(path.join(here, "out", "vision-raw.json"), JSON.stringify(raw, null, 2));

if (perKey.size === 0) {
  console.log("\nNo labels.json entries matched, so nothing was scored. Raw output is in backtest/out/vision-raw.json.");
} else {
  console.log("\nchecklist item".padEnd(28), "correct", " claimed something not visible");
  let right = 0, total = 0;
  for (const [key, s] of [...perKey].sort()) {
    console.log(key.padEnd(27), `${s.right}/${s.total}`.padEnd(8), s.overclaimed || "");
    right += s.right; total += s.total;
  }
  console.log(`\nOverall: ${right}/${total} labelled answers correct (model: ${provider.model})`);
  for (const m of mistakes) console.log("  " + m);
}
