/**
 * Runtime code of contracts for tests (hex, no 0x)
 */
import { Executor } from "#executor";
import { asm, creation } from "./bytecode.js";

export const alice = "0x" + "aa".repeat(20);
export const bob = "0x" + "bb".repeat(20);
export const carol = "0x" + "cc".repeat(20);

/** An executor with alice, bob and carol funded */
export async function funded(executor = new Executor()): Promise<Executor> {
  for (const account of [alice, bob, carol]) {
    await executor.fund(account, 10n ** 18n);
  }
  return executor;
}

/** Deploy runtime code from alice; its address */
export async function deployed(
  executor: Executor,
  runtime: string,
): Promise<string> {
  const { address } = await executor.deploy({
    from: alice,
    create: creation(runtime),
  });
  return address!;
}

/** Stores calldata word 0 at slot 0 and returns it */
export const store = asm(`
  PUSH1 0 CALLDATALOAD DUP1 PUSH1 0 SSTORE
  PUSH1 0 MSTORE PUSH1 32 PUSH1 0 RETURN
`);

/** Stores calldata word 0 at slot 0, calls `to` with that word and
 * returns what `to` returns */
export const forward = (to: string) =>
  asm(`
  PUSH1 0 CALLDATALOAD DUP1 PUSH1 0 SSTORE PUSH1 0 MSTORE
  PUSH1 32 PUSH1 32 PUSH1 32 PUSH1 0 PUSH1 0 PUSH20 ${to} GAS CALL POP
  PUSH1 32 PUSH1 32 RETURN
`);

/**
 * Given n (calldata word 0): stores 0x10 + n at slot n; for n < 2,
 * calls itself with n + 1; for n = 1, then reverts with the word n + 1.
 * So a call with 0 runs three frames, and the middle one reverts.
 */
export const recurse = asm(`
  PUSH1 0 CALLDATALOAD
  DUP1 PUSH1 16 ADD DUP2 SSTORE
  PUSH1 2 DUP2 LT ISZERO @done JUMPI
  DUP1 PUSH1 1 ADD PUSH1 0 MSTORE
  PUSH1 0 PUSH1 0 PUSH1 32 PUSH1 0 PUSH1 0 ADDRESS GAS CALL POP
  DUP1 PUSH1 1 EQ ISZERO @done JUMPI
  PUSH1 32 PUSH1 0 REVERT
  done: STOP
`);
