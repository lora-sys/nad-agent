/**
 * Download a GGUF model over plain HTTPS into ./models/ and print the
 * QVAC_MODEL_PATH line to add to .env.
 *
 * Why: QVAC's P2P model registry has a hard 60s download timeout that a slow or
 * NAT'd host can't beat for a multi-hundred-MB model. The registry `src` is just
 * a HuggingFace URL, so we fetch it directly and load from disk with
 * modelType:"llamacpp-completion". On a fast network / M4 Max the registry path
 * works fine and you don't need this.
 *
 * Usage:
 *   node scripts/fetch-model.mjs <gguf-url> [outfile.gguf]
 */

import { createWriteStream, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { basename, join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error(
    "usage: node scripts/fetch-model.mjs <gguf-url> [outfile.gguf]\n" +
      "  find a URL on HuggingFace (the QVAC registry entry's `src`), e.g. a *.gguf resolve link."
  );
  process.exit(1);
}

mkdirSync("models", { recursive: true });
const out = join("models", process.argv[3] || basename(new URL(url).pathname) || "model.gguf");

console.log(`downloading\n  ${url}\n-> ${out}`);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const total = Number(res.headers.get("content-length") || 0);
let received = 0;
const body = Readable.fromWeb(res.body);
body.on("data", (chunk) => {
  received += chunk.length;
  if (total) process.stdout.write(`\r  ${((received / total) * 100).toFixed(1)}%   `);
});
await pipeline(body, createWriteStream(out));

console.log(`\ndone. Add to .env:\n\n  QVAC_MODEL_PATH=${join(process.cwd(), out)}\n`);
