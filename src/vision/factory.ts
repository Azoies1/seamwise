import { GeminiVision } from "./gemini.js";
import { AnthropicVision, type VisionProvider } from "./provider.js";

/**
 * Picks the vision provider from the environment.
 *
 *   SEAMWISE_PROVIDER=gemini | anthropic   (optional; otherwise whichever key is present,
 *                                           Anthropic first)
 *   GEMINI_API_KEY        Google AI Studio key
 *   ANTHROPIC_API_KEY     Anthropic key
 *   SEAMWISE_GEMINI_MODEL, SEAMWISE_MODEL   per-provider model override
 *
 * Returns null when nothing usable is configured; the service then runs on
 * text and reviews only and says so in each response.
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): VisionProvider | null {
  const geminiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN;
  const wanted = env.SEAMWISE_PROVIDER?.toLowerCase();

  if (wanted === "gemini") return geminiKey ? new GeminiVision({ apiKey: geminiKey, model: env.SEAMWISE_GEMINI_MODEL || undefined }) : null;
  if (wanted === "anthropic") return anthropicKey ? new AnthropicVision({ model: env.SEAMWISE_MODEL || undefined }) : null;
  if (anthropicKey) return new AnthropicVision({ model: env.SEAMWISE_MODEL || undefined });
  if (geminiKey) return new GeminiVision({ apiKey: geminiKey, model: env.SEAMWISE_GEMINI_MODEL || undefined });
  return null;
}
