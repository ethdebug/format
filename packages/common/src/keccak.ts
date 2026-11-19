import { keccak256 as hash } from "ethereum-cryptography/keccak";

import type { Raw } from "#raw";

/**
 * The Keccak-256 hash of a byte string, as the EVM computes it.
 */
export function keccak256(raw: Raw): Raw {
  return hash(raw);
}
