/**
 * Decision models (Gemini Decisions, Cloudflare Clef, TypeSafe Jev, OpenAI)
 * through the `letsdecide` library: one request shape, provider picked by a
 * "provider/model" string. letsdecide builds each provider's request and checks
 * its reply; this module only supplies keys from the environment.
 *
 *   SEAMWISE_DECISION_MODEL   default gemini/gemini-decision-1. Also:
 *                             clef/clef-flash, clef/clef, jev/jev-1.14.0, aiml/typesafe/jev-1.14
 *   GEMINI_API_KEY            for gemini/*
 *   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AUTH_TOKEN   for clef/*
 *   JEV_API_KEY               for jev/* (TypeSafe; signups paused)
 *   AIMLAPI_KEY               for aiml/* (Jev through AIML API)
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Client, type DialectSpec, type ProviderSettings } from "letsdecide";

export const DEFAULT_DECISION_MODEL = "gemini/gemini-decision-1";

/** Jev through AIML API, described to letsdecide as a dialect of Jev. */
const DIALECTS: Record<string, DialectSpec> = {
  aiml: { extends: "jev", base_url: "https://api.aimlapi.com", path: "/v1/decisions" },
};

let wasm: Buffer | undefined;
/** letsdecide's default WASM loader cannot read a file: URL in Node, so hand it the bytes. */
function wasmBytes(): Buffer {
  const entry = createRequire(import.meta.url).resolve("letsdecide");
  return (wasm ??= readFileSync(path.join(path.dirname(entry), "pkg", "letsdecide_wasm_bg.wasm")));
}

export function decisionSettings(env: NodeJS.ProcessEnv): Record<string, ProviderSettings> {
  const byProvider: Record<string, ProviderSettings> = {};
  const gemini = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (gemini) byProvider.gemini = { apiKey: gemini };
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AUTH_TOKEN) {
    byProvider.clef = { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiKey: env.CLOUDFLARE_AUTH_TOKEN };
  }
  if (env.JEV_API_KEY) byProvider.jev = { apiKey: env.JEV_API_KEY };
  if (env.AIMLAPI_KEY) byProvider.aiml = { apiKey: env.AIMLAPI_KEY };
  return byProvider;
}

/** Whether the environment holds the credentials `model` needs. */
export function hasDecisionCredentials(model: string, env: NodeJS.ProcessEnv): boolean {
  const prefix = model.slice(0, model.indexOf("/"));
  return Object.hasOwn(decisionSettings(env), prefix);
}

export function decisionClient(
  env: NodeJS.ProcessEnv = process.env,
  opts: { fetch?: typeof fetch } = {},
): Client {
  return new Client(
    { byProvider: decisionSettings(env) },
    {
      wasm: wasmBytes(),
      dialects: DIALECTS,
      // letsdecide 0.3.0 calls its stored fetch as a method; wrap it so runtimes that check `this` accept it.
      fetch: opts.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    },
  );
}
