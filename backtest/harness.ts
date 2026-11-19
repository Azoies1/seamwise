import { assess } from "../src/pipeline.js";
import { GRADES, type Assessment, type ImageInput } from "../src/types.js";
import { FixtureVision, blankChecklist } from "../src/vision/provider.js";
import { GOLDEN, ORDERINGS, type GoldenCase } from "./golden.js";

/** Smallest valid PNG; stands in for a photo when the vision output is replayed. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export async function runCase(c: GoldenCase): Promise<Assessment> {
  if (!c.vision) return assess(c.input, [], null);
  const images: ImageInput[] = c.vision.images.map(() => ({ bytes: TINY_PNG, mediaType: "image/png" }));
  const provider = new FixtureVision({
    garment_category: c.vision.category,
    images: c.vision.images.map((partial, i) => ({ ...blankChecklist(i), ...partial, image_index: i })),
  });
  return assess(c.input, images, provider);
}

export interface Row {
  id: string;
  expected: string;
  got: string;
  confidence: string;
  mean: number | null;
  range: string;
  outcome: "exact" | "off_by_one" | "wrong" | "refusal_ok" | "refusal_missed" | "refused_wrongly";
}

export interface Report {
  rows: Row[];
  graded: { total: number; exact: number; withinOne: number };
  refusals: { total: number; correct: number };
  wronglyRefused: number;
  orderings: { total: number; correct: number; failed: string[] };
}

export async function runBacktest(): Promise<Report> {
  const results = new Map<string, Assessment>();
  const rows: Row[] = [];
  for (const c of GOLDEN) {
    const a = await runCase(c);
    results.set(c.id, a);
    let outcome: Row["outcome"];
    if (c.expect.status === "insufficient_information") {
      outcome = a.status === "insufficient_information" ? "refusal_ok" : "refusal_missed";
    } else if (a.grade === null) {
      outcome = "refused_wrongly";
    } else {
      const gap = Math.abs(GRADES.indexOf(a.grade) - GRADES.indexOf(c.expect.grade));
      outcome = gap === 0 ? "exact" : gap === 1 ? "off_by_one" : "wrong";
    }
    rows.push({
      id: c.id,
      expected: c.expect.status === "graded" ? c.expect.grade : "(refuse)",
      got: a.grade ?? "(refused)",
      confidence: a.confidence,
      mean: a.score?.mean ?? null,
      range: a.score ? `${a.score.low}-${a.score.high}` : "",
      outcome,
    });
  }

  const gradedRows = rows.filter((r) => r.expected !== "(refuse)");
  const refusalRows = rows.filter((r) => r.expected === "(refuse)");
  const failed: string[] = [];
  for (const [better, worse] of ORDERINGS) {
    const b = results.get(better)?.score?.mean;
    const w = results.get(worse)?.score?.mean;
    if (b === undefined || w === undefined || !(b > w)) failed.push(`${better} (${b ?? "refused"}) > ${worse} (${w ?? "refused"})`);
  }
  return {
    rows,
    graded: {
      total: gradedRows.length,
      exact: gradedRows.filter((r) => r.outcome === "exact").length,
      withinOne: gradedRows.filter((r) => r.outcome === "exact" || r.outcome === "off_by_one").length,
    },
    refusals: { total: refusalRows.length, correct: refusalRows.filter((r) => r.outcome === "refusal_ok").length },
    wronglyRefused: gradedRows.filter((r) => r.outcome === "refused_wrongly").length,
    orderings: { total: ORDERINGS.length, correct: ORDERINGS.length - failed.length, failed },
  };
}
