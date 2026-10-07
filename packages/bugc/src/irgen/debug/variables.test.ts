/**
 * A storage string or `bytes` has Solidity's encoding: up to 31 bytes
 * in its slot, left-aligned, with length * 2 in the low byte; else
 * length * 2 + 1 in the slot and the data from keccak256(slot). Its
 * pointer must say so, so that a debugger reads the exact bytes from
 * the pointer alone.
 */
import { describe, it, expect } from "vitest";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { createMachineState } from "@ethdebug/evm";
import { dereference } from "@ethdebug/pointers";
import type * as Format from "@ethdebug/format";

import { parse } from "#parser";
import { checkProgram } from "#typechecker";
import { Type } from "#types";
import { traceLocals } from "#test/evm/locals";

import { mappingAccess } from "./pointers.js";
import { generateStoragePointer } from "./variables.js";

const lengths = [0, 5, 31, 32, 70];
const levels = [0, 1, 2, 3] as const;

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const text = (length: number) =>
  Array.from({ length }, (_, i) => alphabet[i % alphabet.length]).join("");

const hex = (length: number) =>
  Array.from({ length }, (_, i) => (i + 1).toString(16).padStart(2, "0")).join(
    "",
  );

const source = (length: number) => `name StringPointers;
define { struct S { id: uint256; name: string; tag: bytes; }; }
storage {
  [0] s: string;
  [1] b: bytes;
  [2] p: S;
  [5] a: array<string, 2>;
  [7] u: mapping<uint256, S>;
}
code {
  let m: string = "${text(length)}";
  let n: bytes = 0x${hex(70)};
  let c: bytes = ${length === 70 ? "n" : `n[0:${length}]`};
  s = m;
  b = c;
  p.id = 1;
  p.name = m;
  p.tag = c;
  a[1] = m;
  u[7].id = 2;
  u[7].name = m;
  u[7].tag = c;
}`;

/** The value type of storage variable `name`'s mapping */
function mappingValueType(source: string, name: string): Type {
  const parsed = parse(source);
  if (!parsed.success) throw new Error("parse failed");
  const checked = checkProgram(parsed.value);
  if (!checked.success) throw new Error("typecheck failed");
  const declaration = parsed.value.storage!.find((d) => d.name === name)!;
  const type = checked.value.types.get(declaration.id)!;
  if (!Type.isMapping(type)) throw new Error(`${name} is not a mapping`);
  return type.value;
}

/** Read each region named `name`, in order, as hex */
async function readRegions(
  pointer: Format.Pointer,
  state: ReturnType<typeof createMachineState>,
  name: string,
): Promise<string[]> {
  const cursor = await dereference(pointer, { state });
  const view = await cursor.view(state);
  return Promise.all(
    view.regions
      .filter((region) => region.name === name)
      .map(async (region) => bytesToHex(await view.read(region))),
  );
}

describe("storage string and bytes pointers", () => {
  for (const level of levels) {
    for (const length of lengths) {
      it(`read ${length} bytes (level ${level})`, async () => {
        const program = source(length);
        const run = await traceLocals(program, level);
        const state = createMachineState(run.executor, {
          traceStep: run.steps[run.steps.length - 1],
        });
        const pointerOf = (identifier: string) =>
          (
            run.program.context as Format.Program.Context.Variables
          ).variables.find((v) => v.identifier === identifier)!.pointer!;

        const string = bytesToHex(new TextEncoder().encode(text(length)));
        const bytes = bytesToHex(hexToBytes(hex(length)));

        expect(await readRegions(pointerOf("s"), state, "data")).toEqual([
          string,
        ]);
        expect(await readRegions(pointerOf("b"), state, "data")).toEqual([
          bytes,
        ]);
        expect(await readRegions(pointerOf("p"), state, "id")).toEqual([
          "0".repeat(63) + "1",
        ]);
        expect(await readRegions(pointerOf("p"), state, "name-data")).toEqual([
          string,
        ]);
        expect(await readRegions(pointerOf("p"), state, "tag-data")).toEqual([
          bytes,
        ]);
        expect(await readRegions(pointerOf("a"), state, "data")).toEqual([
          "",
          string,
        ]);

        // A mapping's pointer names only its slot; its entry `u[7]`
        // has the pointer of its value type at the entry's slot
        const entry = generateStoragePointer(
          mappingAccess(7, 7),
          mappingValueType(program, "u"),
        )!;
        expect(await readRegions(entry, state, "id")).toEqual([
          "0".repeat(63) + "2",
        ]);
        expect(await readRegions(entry, state, "name-data")).toEqual([string]);
        expect(await readRegions(entry, state, "tag-data")).toEqual([bytes]);
      });
    }
  }
});
