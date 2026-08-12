import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPolicy, checkPolicy, hasRules, describePolicy } from "../src/policy.mjs";
import { parseMon } from "../src/format.mjs";

const ALICE = "0x92936497B6ad2BA84b3f7Af22C9afF15f00b13B5";
const BOB = "0x000000000000000000000000000000000000dEaD";

function policyFile(contents) {
  const dir = mkdtempSync(join(tmpdir(), "nad-policy-"));
  const path = join(dir, "policy.json");
  writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  return path;
}

describe("loadPolicy", () => {
  test("returns null when the file does not exist", () => {
    assert.equal(loadPolicy(join(tmpdir(), "nad-policy-missing", "policy.json")), null);
  });

  test("parses amounts into wei and checksums the allowlist", () => {
    const p = loadPolicy(policyFile({ maxPerSend: "0.5", maxPerSession: "2", allowlist: [ALICE.toLowerCase()] }));
    assert.equal(p.maxPerSend, parseMon("0.5"));
    assert.equal(p.maxPerSession, parseMon("2"));
    assert.deepEqual(p.allowlist, [ALICE]);
  });

  test("fails closed on malformed JSON", () => {
    assert.throws(() => loadPolicy(policyFile("{ not json")), /not valid JSON/);
  });

  test("fails closed on a bad allowlist entry", () => {
    assert.throws(() => loadPolicy(policyFile({ allowlist: ["alice"] })), /not a valid address/);
  });

  test("rejects a non-positive limit", () => {
    assert.throws(() => loadPolicy(policyFile({ maxPerSend: "0" })), /greater than zero/);
  });
});

describe("checkPolicy", () => {
  const rules = loadPolicy(policyFile({ maxPerSend: "0.5", maxPerSession: "1", allowlist: [ALICE] }));

  test("no policy allows everything", () => {
    assert.equal(checkPolicy(null, { to: BOB, value: parseMon("100") }).ok, true);
    assert.equal(hasRules(null), false);
  });

  test("allows a send inside every rule", () => {
    assert.equal(checkPolicy(rules, { to: ALICE, value: parseMon("0.4") }).ok, true);
  });

  test("refuses a recipient outside the allowlist", () => {
    const v = checkPolicy(rules, { to: BOB, value: parseMon("0.1") });
    assert.equal(v.ok, false);
    assert.equal(v.rule, "allowlist");
  });

  test("refuses an amount above the per-send limit", () => {
    const v = checkPolicy(rules, { to: ALICE, value: parseMon("0.6") });
    assert.equal(v.ok, false);
    assert.equal(v.rule, "maxPerSend");
  });

  test("refuses once the session budget is exhausted", () => {
    const v = checkPolicy(rules, { to: ALICE, value: parseMon("0.4"), sessionSpent: parseMon("0.8") });
    assert.equal(v.ok, false);
    assert.equal(v.rule, "maxPerSession");
    assert.match(v.message, /0\.2 MON left/);
  });

  test("the session budget accumulates rather than resetting per send", () => {
    const first = checkPolicy(rules, { to: ALICE, value: parseMon("0.5"), sessionSpent: 0n });
    const second = checkPolicy(rules, { to: ALICE, value: parseMon("0.5"), sessionSpent: parseMon("0.5") });
    const third = checkPolicy(rules, { to: ALICE, value: parseMon("0.5"), sessionSpent: parseMon("1") });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, false);
  });
});

describe("describePolicy", () => {
  test("is silent without rules", () => {
    assert.equal(describePolicy(null, { value: parseMon("1") }), null);
  });

  test("reports the session budget usage", () => {
    const p = loadPolicy(policyFile({ maxPerSession: "10" }));
    assert.equal(describePolicy(p, { value: parseMon("2.5"), sessionSpent: 0n }), "2.5 of 10.0 MON session budget");
  });
});
