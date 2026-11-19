/**
 * The scorer.
 *
 * Model: a garment has a general quality level G, and each dimension's quality
 * is G plus its own deviation. Both start from wide priors. Every evidence item
 * is a noisy reading of one dimension (or, for brand and price, of G itself),
 * and the estimate is the exact Gaussian posterior given all readings.
 *
 * Consequences, all by construction rather than by special case:
 *   - an item moves the estimate AND narrows the range;
 *   - a missing item lowers nothing: the range simply stays wide;
 *   - a dimension with no evidence leans part-way toward the ones that have it
 *     (well-made fabric makes well-made seams more likely), with a wide range;
 *   - every item's pull on the final score is an exact, additive number.
 */
import {
  CAPTURE_PROMPTS, CONFIDENCE_SD, DIMENSION_CORRELATION, PRIOR, RANGE_Z, WEIGHTS, gradeFor,
} from "./rubric.js";
import { DIMENSIONS, type Category, type Confidence, type Dimension, type Evidence, type Grade } from "./types.js";

export interface Belief { mean: number; sd: number; direct: number }

export interface ScoreResult {
  category: Category;
  beliefs: Record<Dimension, Belief>;
  overall: { mean: number; sd: number; low: number; high: number };
  confidence: Confidence;
  grade: Grade;
  range: { low: Grade; high: Grade };
  evidence: Evidence[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

/** Priors and "silence" are background, not direct observations of the garment. */
export function isDirect(e: Evidence): boolean {
  return e.source.type !== "brand_prior" && e.source.type !== "price" && e.source.type !== "silence";
}

/** Two items with the same key state the same fact; keep the more reliable one. */
export function dedupe(evidence: Evidence[]): Evidence[] {
  const byKey = new Map<string, Evidence>();
  for (const e of evidence) {
    const prev = byKey.get(e.key);
    if (!prev || e.sd < prev.sd) byKey.set(e.key, e);
  }
  return [...byKey.values()];
}

// State vector: [G, fabric deviation, construction deviation, hardware deviation, durability deviation]
const N = 1 + DIMENSIONS.length;
const SHARED_VAR = PRIOR.sd ** 2 * DIMENSION_CORRELATION;
const OWN_VAR = PRIOR.sd ** 2 * (1 - DIMENSION_CORRELATION);

/** Which state components a reading of this dimension touches. */
function loading(dimension: Evidence["dimension"]): number[] {
  const h = new Array<number>(N).fill(0);
  h[0] = 1;
  if (dimension !== "overall") h[1 + DIMENSIONS.indexOf(dimension)] = 1;
  return h;
}

function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const p = a[col]![col]!;
    for (let j = 0; j < 2 * n; j++) a[col]![j]! /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f !== 0) for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[col]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/** Posterior covariance of the state given readings of these (dimension, sd) pairs. */
function posteriorCovariance(readings: { dimension: Evidence["dimension"]; sd: number }[]): number[][] {
  const precision = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => (i === j ? 1 / (i === 0 ? SHARED_VAR : OWN_VAR) : 0)));
  for (const r of readings) {
    const h = loading(r.dimension);
    const p = 1 / r.sd ** 2;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) precision[i]![j]! += h[i]! * h[j]! * p;
  }
  return invert(precision);
}

const quad = (a: number[], cov: number[][]) =>
  a.reduce((s, ai, i) => s + ai * a.reduce((t, aj, j) => t + cov[i]![j]! * aj, 0), 0);

function overallLoading(category: Category): number[] {
  return [1, ...DIMENSIONS.map((d) => WEIGHTS[category][d])];
}

export function confidenceFor(sd: number): Confidence {
  if (sd > CONFIDENCE_SD.insufficient) return "insufficient";
  if (sd > CONFIDENCE_SD.medium) return "low";
  if (sd > CONFIDENCE_SD.high) return "medium";
  return "high";
}

export function score(category: Category, rawEvidence: Evidence[]): ScoreResult {
  const weights = WEIGHTS[category];
  // A reading of a dimension this category does not weigh (hardware on a tee) is dropped.
  const evidence = dedupe(rawEvidence)
    .filter((e) => e.dimension === "overall" || weights[e.dimension] > 0)
    .map((e) => ({ ...e }));
  const cov = posteriorCovariance(evidence);
  const a = overallLoading(category);

  // Posterior mean = prior mean + sum over items of gain * (value - prior mean).
  const shift = new Array<number>(N).fill(0);
  for (const e of evidence) {
    const h = loading(e.dimension);
    const scale = (e.value - PRIOR.mean) / e.sd ** 2;
    const gain = cov.map((row) => row.reduce((s, c, j) => s + c * h[j]!, 0)); // cov * h
    for (let i = 0; i < N; i++) shift[i]! += gain[i]! * scale;
    // How many points this item moved the final score, exactly.
    const influence = a.reduce((s, ai, i) => s + ai * gain[i]!, 0) / e.sd ** 2;
    e.weight = Math.round(influence * 1000) / 1000;
    e.contribution = round1(influence * (e.value - PRIOR.mean));
    e.direction = e.value >= PRIOR.mean + 5 ? "for" : e.value <= PRIOR.mean - 5 ? "against" : "neutral";
    e.value = round1(e.value);
    e.sd = round1(e.sd);
  }

  const beliefs = {} as Record<Dimension, Belief>;
  DIMENSIONS.forEach((d, k) => {
    const h = loading(d);
    beliefs[d] = {
      mean: PRIOR.mean + shift[0]! + shift[1 + k]!,
      sd: Math.sqrt(quad(h, cov)),
      direct: evidence.filter((e) => e.dimension === d && isDirect(e)).length,
    };
  });

  const mean = PRIOR.mean + a.reduce((s, ai, i) => s + ai * shift[i]!, 0);
  const sd = Math.sqrt(quad(a, cov));
  const low = clamp(mean - RANGE_Z * sd);
  const high = clamp(mean + RANGE_Z * sd);

  return {
    category, beliefs, evidence,
    overall: { mean, sd, low, high },
    confidence: confidenceFor(sd),
    grade: gradeFor(mean),
    range: { low: gradeFor(low), high: gradeFor(high) },
  };
}

/**
 * Which missing piece would narrow the range most? Adds a typical reading of
 * each kind and measures how much narrower the overall range would get.
 */
export function nextBestEvidence(
  result: ScoreResult, alreadyHave: Set<string>,
): { kind: string; dimension: Dimension; prompt: string; reduction: number } | null {
  const weights = WEIGHTS[result.category];
  const a = overallLoading(result.category);
  let best: { kind: string; dimension: Dimension; prompt: string; reduction: number } | null = null;
  for (const [kind, spec] of Object.entries(CAPTURE_PROMPTS)) {
    if (alreadyHave.has(kind) || weights[spec.dimension] === 0) continue;
    const cov = posteriorCovariance([...result.evidence, { dimension: spec.dimension, sd: spec.typicalSd }]);
    const reduction = 2 * RANGE_Z * (result.overall.sd - Math.sqrt(quad(a, cov)));
    if (!best || reduction > best.reduction) best = { kind, dimension: spec.dimension, prompt: spec.prompt, reduction };
  }
  return best && best.reduction >= 1 ? best : null;
}
