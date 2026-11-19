import { mkdirSync, writeFileSync } from "node:fs";
import { runBacktest } from "./harness.js";

const report = await runBacktest();
const pad = (s: string, n: number) => s.padEnd(n);
console.log(pad("case", 36), pad("expected", 15), pad("got", 15), pad("confidence", 13), pad("score", 7), pad("range", 12), "outcome");
for (const r of report.rows) {
  console.log(pad(r.id, 36), pad(r.expected, 15), pad(r.got, 15), pad(r.confidence, 13), pad(String(r.mean ?? ""), 7), pad(r.range, 12), r.outcome);
}
const { graded, refusals, orderings, wronglyRefused } = report;
console.log(`\nGrade, exact match:        ${graded.exact}/${graded.total}`);
console.log(`Grade, within one band:    ${graded.withinOne}/${graded.total}`);
console.log(`Refused when it should not: ${wronglyRefused}/${graded.total}`);
console.log(`Refused when it should:    ${refusals.correct}/${refusals.total}`);
console.log(`Pairwise orderings:        ${orderings.correct}/${orderings.total}`);
for (const f of orderings.failed) console.log(`  failed: ${f}`);
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/report.json", import.meta.url), JSON.stringify(report, null, 2));
