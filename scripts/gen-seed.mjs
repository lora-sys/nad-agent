/**
 * Generate a fresh 24-word BIP-39 seed phrase for the agent's wallet.
 * Standard BIP-39 (32 bytes entropy) — accepted by WDK. Prints it once; copy it
 * into WDK_SEED in your .env. Anyone with this phrase controls the funds.
 */

import { Mnemonic, randomBytes } from "ethers";

const phrase = Mnemonic.fromEntropy(randomBytes(32)).phrase;

console.log("\nYour 24-word seed (store it safely — this controls the wallet):\n");
console.log("  " + phrase + "\n");
console.log("Add it to .env as:\n");
console.log("  WDK_SEED=\"" + phrase + "\"\n");
