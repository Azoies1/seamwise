import { DecisionVision } from "./decision.js";
import { DEFAULT_DECISION_MODEL, decisionClient, hasDecisionCredentials } from "./decisions.js";
import { GeminiVision } from "./gemini.js";
import { AnthropicVision, type VisionProvider } from "./provider.js";

/** Shortcuts for SEAMWISE_PROVIDER that select a decision model by name. */
const DECISION_SHORTCUTS: Record<string, string> = {
  "gemini-decisions": "gemini/gemini-decision-1",
  clef: "clef/clef",
  "clef-flash": "clef/clef-flash",
  jev: "aiml/typesafe/jev-1.14",
};

/**
 * Picks the vision provider from the environment.
 *
 *   SEAMWISE_PROVIDER=gemini | anthropic                 generative checklist
 *                   | decisions                          decision model from SEAMWISE_DECISION_MODEL
 *                   | gemini-decisions | clef | clef-flash | jev   decision-model shortcuts
 *                   (optional; otherwise whichever generative key is present, Anthropic first)
 *   GEMINI_API_KEY        Google AI Studio key
 *   ANTHROPIC_API_KEY     Anthropic key
 *   SEAMWISE_GEMINI_MODEL, SEAMWISE_MODEL   per-provider model override
 *   SEAMWISE_DECISION_MODEL                 "provider/model" for `decisions`, via letsdecide
 *   SEAMWISE_DECISION_MIN_CONFIDENCE        below this a field becomes not_visible (default 0.6)
 *   Decision-model keys: see src/vision/decisions.ts.
 *
 * Returns null when nothing usable is configured; the service then runs on
 * text and reviews only and says so in each response.
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): VisionProvider | null {
  const geminiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN;
  const wanted = env.SEAMWISE_PROVIDER?.toLowerCase();

  if (wanted === "decisions" || (wanted && Object.hasOwn(DECISION_SHORTCUTS, wanted))) {
    const model = wanted === "decisions" ? env.SEAMWISE_DECISION_MODEL || DEFAULT_DECISION_MODEL : DECISION_SHORTCUTS[wanted]!;
    if (!hasDecisionCredentials(model, env)) return null;
    const min = Number(env.SEAMWISE_DECISION_MIN_CONFIDENCE);
    return new DecisionVision(decisionClient(env), {
      model,
      ...(env.SEAMWISE_DECISION_MIN_CONFIDENCE && Number.isFinite(min) ? { minConfidence: min } : {}),
    });
  }
  if (wanted === "gemini") return geminiKey ? new GeminiVision({ apiKey: geminiKey, model: env.SEAMWISE_GEMINI_MODEL || undefined }) : null;
  if (wanted === "anthropic") return anthropicKey ? new AnthropicVision({ model: env.SEAMWISE_MODEL || undefined }) : null;
  if (anthropicKey) return new AnthropicVision({ model: env.SEAMWISE_MODEL || undefined });
  if (geminiKey) return new GeminiVision({ apiKey: geminiKey, model: env.SEAMWISE_GEMINI_MODEL || undefined });
  return null;
}
