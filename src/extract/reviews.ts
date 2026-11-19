/**
 * Review mining: real-world outcomes. Reviews written after wear count double,
 * because a review written on delivery day says nothing about durability.
 */
import type { Evidence, Review } from "../types.js";

const AFTER_WEAR = /\b(after|for|within|over|past)\s+(?:about\s+|only\s+|just\s+)?(\d+|a|one|two|three|four|five|six|a few|several|a couple(?: of)?|many)\s+(wash(?:es)?|wears?|weeks?|months?|years?|seasons?)\b|\b(months?|years?|washes) (later|on|in)\b|\bhad (it|this|them) for\b|\bworn (it|this|them) (a lot|constantly|weekly|daily)\b/i;

interface Issue { key: string; label: string; pattern: RegExp }

const ISSUES: Issue[] = [
  { key: "pilling", label: "pilling", pattern: /\b(pill(s|ed|ing)?|bobbl(e|es|ed|ing)|fuzz(ed|ing) up)\b/i },
  { key: "shrinking", label: "shrinking", pattern: /\b(shrunk|shrank|shrink(s|ing|age)?)\b/i },
  { key: "seams", label: "seams or stitching failing", pattern: /\b(seams?|stitch(es|ing)?|hem|threads?)\b[^.!?]{0,40}\b(came apart|coming apart|split|ripped|unravel(l?ed|l?ing)?|came undone|coming undone|fell apart|broke)\b|\bunravel(l?ed|l?ing)\b/i },
  { key: "holes", label: "holes or tearing", pattern: /\b(holes?|tore|torn|ripped|tear(s|ing)?)\b/i },
  { key: "shape", label: "losing shape", pattern: /\b(lost (its|their) shape|stretched out|bagg(y|ed|ing) out|misshapen|twisted (side )?seams?|warped)\b/i },
  { key: "fading", label: "fading", pattern: /\b(fad(ed|es|ing)|colou?r (ran|bled|washed out))\b/i },
  { key: "hardware", label: "zipper or buttons failing", pattern: /\b(zip(per)?|buttons?|snaps?)\b[^.!?]{0,30}\b(broke|broken|fell off|came off|stuck|failed|popped)\b/i },
  { key: "fell_apart", label: "falling apart", pattern: /\b(fell apart|falling apart|disintegrat(ed|ing)|didn'?t last|did not last)\b/i },
];

const HELD_UP = /\b(held up|holds? up|holding up|still looks? (new|great|good|perfect)|still going strong|like new|wash(es|ed)? (really |very )?well|no pilling|hasn'?t (pilled|shrunk|faded)|built to last|lasted (me )?(for )?(\d+|many|several) years)\b/i;

const NEGATED = /\b(no|not|never|without|hasn'?t|haven'?t|didn'?t|doesn'?t|zero)\b[^.!?]{0,25}$/i;

function matchesUnnegated(text: string, pattern: RegExp): boolean {
  const m = pattern.exec(text);
  if (!m) return false;
  return !NEGATED.test(text.slice(Math.max(0, m.index - 40), m.index));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function extractReviews(reviews: Review[]): Evidence[] {
  const n = reviews.length;
  if (n === 0) return [];
  const baseSd = Math.max(8, 45 / Math.sqrt(n));
  const evidence: Evidence[] = [];
  let anyIssue = false;

  for (const issue of ISSUES) {
    const ids: string[] = [];
    let weighted = 0;
    reviews.forEach((r, i) => {
      if (!matchesUnnegated(r.text, issue.pattern)) return;
      ids.push(r.id ?? `#${i + 1}`);
      weighted += AFTER_WEAR.test(r.text) ? 2 : 1;
    });
    if (ids.length === 0) continue;
    anyIssue = true;
    // The +10 keeps one complaint among a handful of reviews from reading as a pattern.
    const rate = Math.min(1, weighted / (n + 10));
    evidence.push({
      key: `durability.reviews.${issue.key}`,
      dimension: "durability",
      claim: `${ids.length} of ${n} reviews mention ${issue.label}`,
      source: { type: "reviews", review_ids: ids.slice(0, 50), total_reviews: n },
      value: clamp(56 - 110 * rate, 25, 56),
      sd: baseSd + 2,
    });
  }

  const heldIds: string[] = [];
  reviews.forEach((r, i) => { if (HELD_UP.test(r.text)) heldIds.push(r.id ?? `#${i + 1}`); });
  if (heldIds.length > 0) {
    const rate = heldIds.length / n;
    evidence.push({
      key: "durability.reviews.held_up",
      dimension: "durability",
      claim: `${heldIds.length} of ${n} reviews say it held up with wear`,
      source: { type: "reviews", review_ids: heldIds.slice(0, 50), total_reviews: n },
      value: clamp(58 + 60 * rate, 58, 82),
      sd: baseSd + 3,
    });
  }

  if (!anyIssue && n >= 8) {
    evidence.push({
      key: "durability.reviews.no_complaints",
      dimension: "durability",
      claim: `No durability complaints in ${n} reviews`,
      source: { type: "reviews", review_ids: [], total_reviews: n },
      value: 60,
      sd: baseSd + 6,
    });
  }
  return evidence;
}
