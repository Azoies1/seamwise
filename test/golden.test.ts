import { describe, expect, it } from "vitest";
import { runBacktest } from "../backtest/harness.js";

/**
 * Regression floor for the hand-graded set. These numbers are what the rubric
 * achieved when the set was written; a rubric change that drops below them
 * should be a deliberate decision, not an accident.
 */
describe("hand-graded back-test", () => {
  it("stays at or above the recorded agreement", async () => {
    const r = await runBacktest();
    expect(r.graded.withinOne).toBe(r.graded.total); // never two bands off
    expect(r.graded.exact).toBeGreaterThanOrEqual(22);
    expect(r.wronglyRefused).toBe(0);
    expect(r.refusals.correct).toBeGreaterThanOrEqual(2);
    expect(r.orderings.correct).toBeGreaterThanOrEqual(14);
  });
});
