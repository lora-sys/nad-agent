/** MON <-> wei helpers. Monad uses 18 decimals like ETH, so ethers' parse/format work. */
import { parseEther, parseUnits, formatEther, formatUnits } from "ethers";

export const parseMon = (amount) => parseEther(String(amount));
export const formatMon = (wei) => formatEther(wei);
export const formatTokenUnits = (amount, decimals) => formatUnits(amount, decimals);

/** Parse a human-readable token amount string into wei (bigint) using token decimals. */
export function parseTokenAmount(amount, decimals) {
  try {
    const parsed = parseUnits(String(amount), decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/** Loose but useful EVM address check for confirming send targets. */
export const isAddress = (s) => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s.trim());
