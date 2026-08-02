/** MON <-> wei helpers. Monad uses 18 decimals like ETH, so ethers' parse/format work. */
import { parseEther, parseUnits, formatEther, formatUnits, getAddress } from "ethers";

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

/**
 * Resolve a send target to its EIP-55 checksummed form. All-lowercase or
 * all-uppercase input is normalized; a MIXED-case address whose checksum does
 * not verify is a typo and throws, so we can reject it before confirmation.
 */
export const toChecksumAddress = (s) => getAddress(String(s).trim());
