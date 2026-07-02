/**
 * Preflight check — run this first on a new machine (`npm run doctor`).
 * Verifies platform, Node, deps, env, and model availability without loading
 * anything heavy. Great for confirming a fresh `git pull` + `npm install` on the Mac.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✗ ${m}`);

console.log("\nnad-agent doctor\n");

// Platform / Node
console.log(`platform: ${process.platform}-${process.arch}, node ${process.version}`);
const major = Number(process.version.slice(1).split(".")[0]);
major >= 22 ? ok("Node >= 22") : bad(`Node ${process.version} — QVAC needs >= 22.17`);
if (process.platform === "darwin" && process.arch === "arm64") ok("Apple Silicon — QVAC can use Metal");

// Dependencies present?
console.log("\ndependencies:");
for (const pkg of ["@qvac/sdk", "@tetherto/wdk", "@tetherto/wdk-wallet-evm-erc-4337", "ethers"]) {
  try {
    require.resolve(pkg);
    ok(pkg);
  } catch {
    bad(`${pkg} — run \`npm install\``);
  }
}

// Build output?
console.log("\nbuild:");
existsSync("dist/cli.mjs") ? ok("dist/cli.mjs") : warn("not built — run `npm run build`");

// Env
console.log("\nenv (.env):");
existsSync(".env") ? ok(".env present") : warn(".env missing — `cp .env.example .env`");
process.env.WDK_SEED ? ok("WDK_SEED set") : warn("WDK_SEED not set — `npm run gen-seed`  (only checked when run via `npm start`)");
if (process.env.PIMLICO_API_KEY) ok("PIMLICO_API_KEY set — real sends enabled");
else warn("PIMLICO_API_KEY not set — will run in DRY-RUN (sends simulated)");

// Model
console.log("\nmodel:");
const model = process.env.QVAC_MODEL_PATH || process.env.QVAC_MODEL || "SMOLLM2_360M_INST_Q8";
if (process.env.QVAC_MODEL_PATH) {
  existsSync(process.env.QVAC_MODEL_PATH)
    ? ok(`local GGUF: ${process.env.QVAC_MODEL_PATH}`)
    : bad(`QVAC_MODEL_PATH points at a missing file: ${process.env.QVAC_MODEL_PATH}`);
} else {
  ok(`registry model: ${model} (downloaded on first run)`);
}

console.log("\ndone.\n");
