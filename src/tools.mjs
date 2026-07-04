/**
 * The wallet "tools" the agent can invoke, plus the NL->action interpreter.
 *
 * Design note: v0 uses a model-agnostic JSON-action protocol (works even on a
 * 360M dev model) rather than betting on any one model's native tool-calling.
 * On a big model (GPT_OSS_20B) you can swap this for QVAC's native tool calling
 * or the official @tetherto/wdk-mcp-toolkit MCP server — see README "Upgrade path".
 */

import * as wallet from "./wallet.mjs";
import { config } from "./config.mjs";
import { parseMon, formatMon, isAddress } from "./format.mjs";

export const ACTIONS = {
  get_address: { args: [], desc: "Show the agent's own wallet address." },
  get_balance: { args: [], desc: "Show the agent's native MON balance." },
  send_mon: { args: ["to", "amountMon"], desc: "Send native MON to an address `to`, amount in MON as a string." },
  none: { args: [], desc: "The message is not an on-chain request; just reply in words." },
};

const SYMBOL = () => config.chain.symbol;

/** Build the system prompt describing the tool protocol. */
export function systemPrompt() {
  const list = Object.entries(ACTIONS)
    .map(([name, { args, desc }]) => `- ${name}(${args.join(", ")}): ${desc}`)
    .join("\n");
  return (
    `You are nad-agent, a wallet assistant on ${config.chain.name}. You control a ` +
    `self-custodial smart account. When the user wants an on-chain action, respond ` +
    `with ONE line of JSON and nothing else, e.g. {"action":"send_mon","to":"0x...","amountMon":"0.5"}.\n` +
    `Available actions:\n${list}\n` +
    `If it isn't an on-chain request, use {"action":"none"}. Never invent addresses.`
  );
}

/** Extract an action from a model response: JSON first, then a lenient fallback. */
export function parseAction(text) {
  const m = text.match(/\{[\s\S]*?\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj.action && ACTIONS[obj.action]) return obj;
    } catch {
      /* fall through to the lenient path */
    }
  }
  // Small models often emit `get_balance()` instead of JSON. Recognize a READ-ONLY
  // action name in the text — but never auto-trigger a write (send needs real args).
  for (const name of ["get_balance", "get_address"]) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return { action: name };
  }
  return { action: "none" };
}

/** True if the action mutates chain state and should require confirmation. */
export function isWrite(action) {
  return action === "send_mon";
}

/** Human-readable preview of what an action will do (shown before confirmation). */
export function describeAction(a) {
  switch (a.action) {
    case "get_address":
      return "Read: your wallet address";
    case "get_balance":
      return "Read: your MON balance";
    case "send_mon":
      return `Send ${a.amountMon} ${SYMBOL()} -> ${a.to}` +
        (config.gasMode === "dry-run" ? "  (DRY RUN — will be simulated)" : config.gasMode === "sponsored" ? "  (gasless)" : "  (you pay gas)");
    default:
      return "No on-chain action";
  }
}

/** Execute an action. Returns a printable string. Assumes wallet is initialized for chain ops. */
export async function runAction(a) {
  switch (a.action) {
    case "get_address":
      return wallet.getAddress() ?? "(wallet not initialized)";

    case "get_balance": {
      const bal = await wallet.getBalance();
      return `${formatMon(bal)} ${SYMBOL()}`;
    }

    case "send_mon": {
      if (!isAddress(a.to)) return `Refused: "${a.to}" is not a valid address.`;
      const value = parseMon(a.amountMon);
      const res = await wallet.send(a.to, value);
      if (res.dryRun) {
        return (
          `DRY RUN — would send ${a.amountMon} ${SYMBOL()} to ${a.to}\n` +
          `  (est. fee ${formatMon(res.fee)} ${SYMBOL()}). Set PIMLICO_API_KEY in .env to broadcast for real.`
        );
      }
      if (res.hash) {
        const url = `${config.chain.explorerUrl}/tx/${res.hash}`;
        return (
          `Sent ${a.amountMon} ${SYMBOL()} to ${a.to}\n` +
          `  tx:     ${res.hash}\n  ${url}\n` +
          `  userOp: ${res.userOpHash}`
        );
      }
      // Broadcast, but the receipt hasn't landed within the wait window.
      return (
        `Submitted ${a.amountMon} ${SYMBOL()} to ${a.to} (gasless UserOp)\n` +
        `  userOp: ${res.userOpHash}\n` +
        `  (not confirmed on-chain yet — should land shortly; re-check /balance)`
      );
    }

    default:
      return null; // caller falls back to a plain chat reply
  }
}
