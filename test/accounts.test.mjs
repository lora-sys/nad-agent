/**
 * Unit tests for multi-account feature (Issue #12).
 *
 * Covers: config.accountIndex, ACTIONS.account, parseAction, describeAction,
 * and systemPrompt coverage. Wallet-level switch/list are integration-tested
 * via npm run smoke (no WDK in CI).
 *
 * Uses node:test + node:assert. Zero new dependencies.
 */

import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.mjs";
import { ACTIONS, parseAction, describeAction, systemPrompt, runAction } from "../src/tools.mjs";
import { validateAccountIndex } from "../src/wallet.mjs";

// ---------------------------------------------------------------------------
// config.accountIndex
// ---------------------------------------------------------------------------

describe("config — accountIndex", () => {
  it("defaults to 0 (v0 behavior preserved)", () => {
    assert.equal(config.accountIndex, 0);
  });

  it("is a non-negative integer", () => {
    assert.ok(Number.isInteger(config.accountIndex), "accountIndex must be integer");
    assert.ok(config.accountIndex >= 0, "accountIndex must be >= 0");
  });
});

// ---------------------------------------------------------------------------
// ACTIONS shape — account action
// ---------------------------------------------------------------------------

describe("ACTIONS — account", () => {
  it("account action exists", () => {
    assert.ok("account" in ACTIONS, "account should be an action");
  });

  it("account args are [index]", () => {
    assert.deepEqual(ACTIONS.account.args, ["index"]);
  });

  it("account has a description", () => {
    assert.ok(ACTIONS.account.desc && ACTIONS.account.desc.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parseAction — account
// ---------------------------------------------------------------------------

describe("parseAction — account", () => {
  it("parses account action with no args (list)", () => {
    assert.deepEqual(parseAction('{"action":"account"}'), { action: "account" });
  });

  it("parses account action with string index", () => {
    assert.deepEqual(
      parseAction('{"action":"account","index":"2"}'),
      { action: "account", index: "2" },
    );
  });

  it("parses account action with number index", () => {
    assert.deepEqual(
      parseAction('{"action":"account","index":1}'),
      { action: "account", index: 1 },
    );
  });

  it("lenient fallback does NOT auto-trigger account from plain text", () => {
    assert.deepEqual(parseAction("switch to account 1"), { action: "none" });
  });

  it("lenient fallback does NOT auto-trigger from pseudo-function call", () => {
    assert.deepEqual(parseAction("account(1)"), { action: "none" });
  });
});

// ---------------------------------------------------------------------------
// describeAction — account
// ---------------------------------------------------------------------------

describe("describeAction — account", () => {
  it("describes account list (no index)", () => {
    const out = describeAction({ action: "account" });
    assert.ok(out.toLowerCase().includes("account"), `expected "account" in "${out}"`);
  });

  it("describes account switch (with index)", () => {
    const out = describeAction({ action: "account", index: "2" });
    assert.ok(out.includes("2"), `expected index "2" in "${out}"`);
  });

  it("unknown action → No on-chain action", () => {
    assert.equal(describeAction({ action: "bogus" }), "No on-chain action");
  });
});

// ---------------------------------------------------------------------------
// systemPrompt includes account
// ---------------------------------------------------------------------------

describe("systemPrompt — account coverage", () => {
  it("systemPrompt mentions the account action", () => {
    assert.ok(systemPrompt().includes("account"), "systemPrompt should mention account action");
  });

  it("systemPrompt mentions every key in ACTIONS", () => {
    const prompt = systemPrompt();
    for (const key of Object.keys(ACTIONS)) {
      assert.ok(prompt.includes(key), `systemPrompt() missing action "${key}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// validateAccountIndex — guard for initWallet and switchAccount
// ---------------------------------------------------------------------------

describe("validateAccountIndex", () => {
  it("accepts 0", () => {
    assert.doesNotThrow(() => validateAccountIndex(0));
  });

  it("accepts positive integers", () => {
    assert.doesNotThrow(() => validateAccountIndex(42));
  });

  it("rejects negative numbers", () => {
    assert.throws(() => validateAccountIndex(-1), /non-negative/);
  });

  it("rejects NaN", () => {
    assert.throws(() => validateAccountIndex(NaN), /non-negative/);
  });

  it("rejects non-integers", () => {
    assert.throws(() => validateAccountIndex(1.5), /non-negative/);
  });

  it("rejects non-numbers", () => {
    assert.throws(() => validateAccountIndex("abc"), /non-negative/);
  });
});

// ---------------------------------------------------------------------------
// runAction — account integration
// ---------------------------------------------------------------------------

describe("runAction — account", () => {
  it("account list throws when wallet is not initialized", async () => {
    let threw = false;
    try {
      await runAction({ action: "account" });
    } catch (e) {
      threw = true;
      assert.ok(String(e.message).toLowerCase().includes("not initialized"));
    }
    assert.ok(threw, "should throw when wallet not initialized");
  });

  it("account switch with invalid index returns refusal", async () => {
    const res = await runAction({ action: "account", index: "-1" });
    assert.match(String(res), /refused/i);
  });

  it("account switch with non-integer returns refusal", async () => {
    const res = await runAction({ action: "account", index: "abc" });
    assert.match(String(res), /refused/i);
  });
});

// ---------------------------------------------------------------------------
// ACTIONS invariance — account present alongside existing actions
// ---------------------------------------------------------------------------

describe("ACTIONS — required keys still present", () => {
  const required = ["get_address", "get_balance", "get_token_balance", "send_mon", "send_token", "none"];
  for (const key of required) {
    it(`has ${key}`, () => {
      assert.ok(key in ACTIONS, `missing ${key} in ACTIONS`);
    });
  }
});
