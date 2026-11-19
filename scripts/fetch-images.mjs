// Downloads every image in data/retailers/<name>.json to data/retailers/<name>/<id>/<n>.<ext>.
// usage: node scripts/fetch-images.mjs hm
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const name = process.argv[2];
if (!name) throw new Error("usage: node scripts/fetch-images.mjs <retailer>");
const products = JSON.parse(readFileSync(`data/retailers/${name}.json`, "utf8"));

for (const p of products) {
  const dir = `data/retailers/${name}/${p.id}`;
  mkdirSync(dir, { recursive: true });
  for (const [i, url] of p.images.entries()) {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", referer: p.url } });
    if (!res.ok) { console.error(`${res.status} ${url}`); continue; }
    const type = res.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    writeFileSync(`${dir}/${i + 1}.${ext}`, Buffer.from(await res.arrayBuffer()));
    await new Promise((r) => setTimeout(r, 400)); // be gentle
  }
  console.log(`${p.id}: ${p.images.length} images`);
}
