/**
 * Deterministic extraction of typed claims from product-page text.
 * No language model here: the same text always yields the same evidence,
 * and every claim carries the span of text it came from.
 */
import {
  COPY_TERMS, FIBER_NAMES, FIBER_SYNONYMS, SD, elastaneAdjustment, fiberValue,
  knitSyntheticWarning, weightValue, type Fiber,
} from "../rubric.js";
import type { Category, Evidence, EvidenceSource, Note } from "../types.js";

export interface FiberPart { fiber: Fiber; pct: number }

export function normalizeFiber(raw: string): Fiber | null {
  const s = raw.toLowerCase().replace(/[^a-z' -]/g, " ").replace(/\s+/g, " ").trim();
  for (const [syn, fiber] of FIBER_SYNONYMS) if (s.includes(syn)) return fiber;
  return null;
}

const PCT_FIRST = /(\d{1,3}(?:\.\d)?)\s?%\s*([A-Za-z][A-Za-z'™®À-ſ -]{2,40}?)(?=\s*(?:[,;.\/\n()|]|\d|$|\band\b|&))/g;
// "Cotton 100%", "Cotton 60%, Polyester 40%" (H&M, Gap). Tried only when the usual order finds nothing.
const FIBER_FIRST = /([A-Za-z][A-Za-z'™®À-ſ -]{2,40}?)\s*(\d{1,3}(?:\.\d)?)\s?%(?!\s*(?:off|discount|sale)\b)/gi;

/** Finds "95% cotton, 5% elastane" (or "Cotton 95%, Elastane 5%") style statements. Takes the first complete set. */
export function parseComposition(text: string): { parts: FiberPart[]; span: string } | null {
  const found = findParts(text, PCT_FIRST, 1, 2);
  if (found.length === 0) found.push(...findParts(text, FIBER_FIRST, 2, 1));
  if (found.length === 0) return null;
  // Keep adding parts until the percentages reach 100 (shell/lining lists repeat after that).
  const parts: FiberPart[] = [];
  let total = 0;
  let end = found[0]!.end;
  for (const f of found) {
    if (total >= 99.5) break;
    if (total + f.part.pct > 100.5) break;
    const existing = parts.find((p) => p.fiber === f.part.fiber);
    if (existing) existing.pct += f.part.pct; else parts.push({ ...f.part });
    total += f.part.pct;
    end = f.end;
  }
  return { parts, span: text.slice(found[0]!.start, end).replace(/\s+/g, " ").trim() };
}

function findParts(text: string, re: RegExp, pctGroup: number, nameGroup: number) {
  const found: { part: FiberPart; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    const pct = Number(m[pctGroup]);
    const name = m[nameGroup] ?? "";
    // "Save 20% on cotton tees" is a discount, not a composition.
    if (/^(on|off|of|to|in|at|for|the|your|our|more|less|discount|savings?|sale)\b/i.test(name)) continue;
    const fiber = normalizeFiber(name);
    if (!fiber || pct <= 0 || pct > 100) continue;
    found.push({ part: { fiber, pct }, start: m.index, end: m.index + m[0].length });
  }
  return found;
}

export function describeComposition(parts: FiberPart[]): string {
  return [...parts].sort((a, b) => b.pct - a.pct).map((p) => `${p.pct}% ${FIBER_NAMES[p.fiber]}`).join(", ");
}

/**
 * Composition is an input, never a score: it sets a ceiling, so it gets medium
 * reliability at best and a full composition still leaves the fabric range wide.
 */
export function compositionEvidence(
  category: Category, parts: FiberPart[], source: EvidenceSource, sd: number,
): Evidence[] {
  const total = parts.reduce((s, p) => s + p.pct, 0);
  if (total <= 0) return [];
  const structural = parts.filter((p) => p.fiber !== "elastane");
  const structuralTotal = structural.reduce((s, p) => s + p.pct, 0);
  const elastanePct = parts.find((p) => p.fiber === "elastane")?.pct ?? 0;
  let value = structuralTotal > 0
    ? structural.reduce((s, p) => s + p.pct * fiberValue(category, p.fiber), 0) / structuralTotal
    : 45;
  const adj = elastaneAdjustment(category, elastanePct);
  value += adj.delta;
  const incomplete = total < 99.5;
  // Caveats ride along in the claim; they are already in `value`, so they are not scored twice.
  const caveats: string[] = [];
  if (adj.reason) caveats.push(adj.reason);
  if (category === "knitwear") {
    for (const p of parts) {
      const warn = knitSyntheticWarning(p.fiber, p.pct);
      if (warn) caveats.push(warn);
    }
  }
  // "100% cotton" covers everything from a 120 GSM open-end tee to 220 GSM Supima, so a
  // middling composition says little; an extreme one (acrylic knit, cashmere) says more.
  const diagnosticSd = Math.min(sd + 6, Math.max(sd, sd + 6 - 0.5 * Math.abs(value - 50)));
  return [{
    key: "fabric.composition",
    dimension: "fabric",
    claim: describeComposition(parts) + (incomplete ? " (partial)" : "") + (caveats.length ? `; ${caveats.join("; ")}` : ""),
    source,
    value,
    sd: incomplete ? diagnosticSd + 4 : diagnosticSd,
  }];
}

function parseWeightGsm(text: string): { gsm: number; span: string } | null {
  const g = /(\d{2,3})\s?(?:gsm|g\/m2|g\/m²|g\/sqm|grams per square met(?:er|re))/i.exec(text);
  if (g) return { gsm: Number(g[1]), span: g[0] };
  const oz = /(\d{1,2}(?:\.\d{1,2})?)\s?(?:oz|ounce)s?\b/i.exec(text);
  if (oz) {
    const v = Number(oz[1]);
    if (v >= 3 && v <= 32) return { gsm: Math.round(v * 33.906), span: oz[0] };
  }
  return null;
}

export interface PageExtraction {
  evidence: Evidence[];
  notes: Note[];
  /** True when the page says nothing concrete about fabric weight, yarn or grade. */
  silentOnFabricDetail: boolean;
}

export function extractPageText(category: Category, text: string): PageExtraction {
  const evidence: Evidence[] = [];
  const notes: Note[] = [];

  const comp = parseComposition(text);
  if (comp) {
    evidence.push(...compositionEvidence(category, comp.parts, { type: "page_text", span: comp.span }, SD.medium));
  }

  const weight = parseWeightGsm(text);
  let hasWeight = false;
  if (weight) {
    const w = weightValue(category, weight.gsm);
    if (w) {
      hasWeight = true;
      evidence.push({
        key: "fabric.weight", dimension: "fabric",
        claim: `${weight.gsm} GSM, ${w.label} for this category`,
        source: { type: "page_text", span: weight.span }, value: w.value, sd: SD.medium,
      });
    } else {
      notes.push({ claim: `Fabric weight ${weight.gsm} GSM`, source: { type: "page_text", span: weight.span } });
    }
  }

  let fabricDetailTerms = 0;
  for (const term of COPY_TERMS) {
    if (term.only && !term.only.includes(category)) continue;
    const m = term.pattern.exec(text);
    if (!m) continue;
    if (term.dimension === "fabric") fabricDetailTerms++;
    evidence.push({
      key: term.key, dimension: term.dimension, claim: term.claim,
      source: { type: "page_text", span: m[0] }, value: term.value, sd: term.sd,
    });
  }

  const origin = /\b(?:[Mm]ade|[Cc]rafted|[Mm]anufactured|[Kk]nitted|[Ss]ewn|[Ww]oven) in (?:the )?([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/.exec(text);
  if (origin) notes.push({ claim: `Made in ${origin[1]}`, source: { type: "page_text", span: origin[0] } });

  const premiumFiber = comp?.parts.some((p) => p.fiber === "premium_cotton") ?? false;
  return { evidence, notes, silentOnFabricDetail: !hasWeight && fabricDetailTerms === 0 && !premiumFiber };
}
