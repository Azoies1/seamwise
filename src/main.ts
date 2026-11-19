import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./server.js";
import { Store } from "./store.js";
import { providerFromEnv } from "./vision/factory.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vision = providerFromEnv();
const app = buildApp({
  vision,
  store: new Store(path.join(root, "data", "assessments.json")),
  apiToken: process.env.SEAMWISE_API_TOKEN || null,
  logger: true,
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
await app.listen({ port, host });
app.log.info(vision ? `Vision: ${vision.model}` : "Vision: OFF (set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env to analyse photos)");
if (!process.env.SEAMWISE_API_TOKEN && host !== "127.0.0.1") {
  app.log.warn("No SEAMWISE_API_TOKEN set: anyone on this network can call the API.");
}
