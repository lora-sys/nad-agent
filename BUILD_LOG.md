# Build log — what broke, and why

An honest record of the things that did **not** work on the first try while wiring
QVAC + WDK together on Monad. Kept deliberately, because "it just works" is never
the whole story and the failure modes are the useful part for anyone repeating this.

Verified on a Linux arm64 box (4 cores, CPU-only) with SmolLM2-360M in dry-run;
the fixes are what make it portable to an M4 Max with GPT_OSS_20B.

---

### 1. The sodium override that silently broke QVAC (the big one — ~3 iterations)

**Symptom:** the CLI printed `loading local model… FAILED — RPC initialization
timed out after 30000ms; the worker process may have failed to start`. Generic and
misleading — it looked like a network/timeout problem.

**Real cause (only visible via an isolation test):** running QVAC directly surfaced
the actual Bare-worker stderr:
```
MODULE_NOT_FOUND: Cannot find module 'crypto' imported from
  node_modules/sodium-native/randombytes.js   → worker SIGABRT
```
I had carried over a `package.json` `overrides: { sodium-native → sodium-javascript }`
from the **browser** wallet (where sodium-native can't bundle). But overrides are
**global**, so they also replaced the *real native* sodium-native that **QVAC's Bare
worker** depends on — and the pure-JS shim calls `require('crypto')`, which Bare
doesn't have. Worker aborts.

**Fix:** the sodium swap must be **bundle-scoped**, not global. Removed the override;
in esbuild used `alias: { "sodium-native": "sodium-javascript" }`. Now WDK (bundled,
runs in the Node main process, which *has* `crypto`) gets pure-JS sodium, while QVAC
(external, its own Bare worker) keeps the real native addon. **Lesson: a browser
bundling trick is not safe to apply globally when a native runtime shares the dep.**

### 2. Marking sodium-native `external` — a wrong turn (caught before running)

First attempt at the fix was to remove the override and mark `sodium-native` external
in esbuild. Build succeeded, but a grep of the output showed a runtime
`require("sodium-native")` that was **not resolvable** — after removing the override,
sodium-native only existed *nested* under `@qvac/*`, not at top level. Would have
broken WDK at runtime. Caught it with a resolve-check before running, then switched
to the bundle-scoped alias (#1). **Lesson: "external" ≠ "resolvable from the bundle."**

### 3. esbuild `outdir` silently emits `.js`, not `.mjs`

Switching from a single `outfile` to `outdir` (to bundle both `cli` and the smoke
harness) made esbuild write `dist/cli.js` / `dist/e2e.js`, while `package.json`
scripts referenced `.mjs` → `MODULE_NOT_FOUND`. A stale `dist/cli.mjs` from the old
build also lingered and masked it. **Fix:** `outExtension: { ".js": ".mjs" }` and
`rmSync('dist')` at the top of the build.

### 4. QVAC's worker inherits stdin → the interactive REPL fought piped input

QVAC spawns its Bare worker with `stdio: ["inherit", "inherit", "pipe"]`, so the
worker inherits **fd 0 (stdin)**. Two knock-on effects:
- A readline created *before* the (multi-second) model load swallowed buffered input
  during the load → prompt hung. **Partial fix:** create readline only *after* the
  model is ready.
- Even then, piped multi-line input desynced (worker holds fd 0). **Workaround:**
  added a non-interactive `npm run smoke` harness that drives the same wallet/model/
  tools logic without readline — reliable in CI/pipes. Interactive TTY use appears
  fine (readline owns the tty); piped input is the unreliable case.

### 5. A 360M model is borderline for the JSON tool protocol

For "what is my balance?" the tiny dev model emitted `get_balance()` instead of
`{"action":"get_balance"}`, so the strict JSON parser dropped it. Added a lenient
fallback: recognize a **read-only** action name in prose (never a write). The real
fix is model size — `GPT_OSS_20B` on the Mac follows the protocol reliably. Confirms
the design note that tool-calling wants ~14B+.

### 6. GitHub push rejected on email privacy (not code)

First `gh repo create … --push` failed: `GH007: your push would publish a private
email`. Re-authored the commit with the `…@users.noreply.github.com` address.

### 7. Runaway generation → CONTEXT_OVERFLOW (intermittent, so easy to miss)

One smoke run passed; the next crashed the whole process with
`CONTEXT_OVERFLOW: prompt exceeds the model's context window`. Same inputs — the
difference was sampling: with default temperature the 360M model sometimes never
emits a stop token and generates until it fills the 2048-token context, at which
point QVAC throws and (unhandled) the throw killed the process. Two fixes:
- **Bound generation** at load: `modelConfig.predict = 256` (llama.cpp n_predict)
  plus `temp = 0` for deterministic, terse action routing.
- **Never let a model error crash the agent**: `complete()` now try/catches the
  token stream and returns whatever was produced. Intermittent failures like this
  are exactly why the smoke test is worth running more than once.

---

**What worked first try, for balance:** the WDK Safe ERC-4337 account derived its
address and read balances from Monad testnet immediately (bundled, in plain Node);
QVAC local inference (SmolLM2, ~1.8s load) ran on the first isolated attempt; and the
dry-run send path needed no bundler at all.
