/**
 * Bundle src/ -> dist/ with esbuild.
 *
 * Why a build step at all? WDK internally does `import { sodium_memzero } from
 * 'sodium-universal'` — a NAMED import from a CJS module, which throws under
 * Node's plain ESM loader. esbuild rewrites it into a working require+destructure,
 * and with the package.json override `sodium-native -> sodium-javascript` (pure JS,
 * provides sodium_memzero) the whole crypto path bundles cleanly.
 *
 * QVAC is NATIVE (Bare/llama.cpp prebuilds) and CANNOT be bundled — it's kept
 * external and resolves from node_modules at runtime, so each machine loads its
 * own prebuild (linux-arm64 here, darwin-arm64/Metal on an M4 Max).
 */

import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.mjs"],
  outfile: "dist/cli.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Native / runtime-resolved packages — never bundle these.
  external: ["@qvac/sdk", "@qvac/*"],
  // Make CJS `require` available inside the ESM bundle (WDK deps use it).
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});

console.log("built -> dist/cli.mjs");
