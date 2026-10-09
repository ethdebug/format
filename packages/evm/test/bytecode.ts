/**
 * A small assembler for test bytecode.
 *
 * `asm` takes whitespace-separated mnemonics. `PUSHn` takes the next
 * token as its value (decimal or 0x hex). `name:` is a JUMPDEST named
 * `name`; `@name` pushes its offset (as PUSH2). `;` starts a comment.
 */

const opcodes: Record<string, number> = {
  STOP: 0x00,
  ADD: 0x01,
  SUB: 0x03,
  LT: 0x10,
  GT: 0x11,
  EQ: 0x14,
  ISZERO: 0x15,
  KECCAK256: 0x20,
  ADDRESS: 0x30,
  CALLDATALOAD: 0x35,
  CALLDATASIZE: 0x36,
  CALLDATACOPY: 0x37,
  CODECOPY: 0x39,
  EXTCODECOPY: 0x3c,
  RETURNDATASIZE: 0x3d,
  RETURNDATACOPY: 0x3e,
  BLOCKHASH: 0x40,
  COINBASE: 0x41,
  TIMESTAMP: 0x42,
  NUMBER: 0x43,
  PREVRANDAO: 0x44,
  CHAINID: 0x46,
  BASEFEE: 0x48,
  BLOBBASEFEE: 0x4a,
  POP: 0x50,
  MLOAD: 0x51,
  MSTORE: 0x52,
  MSTORE8: 0x53,
  SLOAD: 0x54,
  SSTORE: 0x55,
  JUMP: 0x56,
  JUMPI: 0x57,
  GAS: 0x5a,
  JUMPDEST: 0x5b,
  TLOAD: 0x5c,
  TSTORE: 0x5d,
  MCOPY: 0x5e,
  CREATE: 0xf0,
  CALL: 0xf1,
  RETURN: 0xf3,
  DELEGATECALL: 0xf4,
  CREATE2: 0xf5,
  REVERT: 0xfd,
  INVALID: 0xfe,
};
for (let n = 1; n <= 16; n++) {
  opcodes[`DUP${n}`] = 0x7f + n;
  opcodes[`SWAP${n}`] = 0x8f + n;
}

/** Assemble `source` into hex (no 0x) */
export function asm(source: string): string {
  const tokens = source
    .replace(/;[^\n]*/g, "")
    .split(/\s+/)
    .filter((token) => token !== "");

  const labels = new Map<string, number>();
  const assemble = (): string => {
    let hex = "";
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const push = /^PUSH(\d+)$/.exec(token);
      if (token.endsWith(":")) {
        labels.set(token.slice(0, -1), hex.length / 2);
        hex += "5b";
      } else if (token.startsWith("@")) {
        hex += "61" + word(BigInt(labels.get(token.slice(1)) ?? 0), 2);
      } else if (push) {
        const size = Number(push[1]);
        hex += (0x5f + size).toString(16) + word(BigInt(tokens[++i]), size);
      } else if (token in opcodes) {
        hex += opcodes[token].toString(16).padStart(2, "0");
      } else {
        throw new Error(`unknown token ${token}`);
      }
    }
    return hex;
  };
  assemble(); // find the labels
  return assemble();
}

/** Creation code that deploys `runtime` (hex, no 0x) */
export function creation(runtime: string): string {
  return (
    asm(`PUSH2 ${runtime.length / 2} DUP1 PUSH1 12 PUSH1 0 CODECOPY
    PUSH1 0 RETURN`) + runtime
  );
}

/** `value` as `size` bytes of hex */
export function word(value: bigint, size = 32): string {
  return BigInt.asUintN(size * 8, value)
    .toString(16)
    .padStart(size * 2, "0");
}
