/**
 * A pointer that refers to shared templates must read what it would
 * read with each template written out in place. For every example, at
 * every level, every listed variable's pointer is read at every step of
 * a run, both ways: with the compilation's templates, and inline (each
 * reference replaced by its template's pointer, regions renamed as the
 * reference's `yields` says). The two must give the same regions with
 * the same bytes.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";
import * as Format from "@ethdebug/format";
import { createMachineState } from "@ethdebug/evm";
import { dereference, type Data, type Machine } from "@ethdebug/pointers";

import { localsOf, traceLocals } from "#test/evm/locals";
import { parseTestBlocks } from "#test/examples/annotations";

import type { Templates } from "./templates.js";

const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples");
const levels = [0, 1, 2, 3] as const;

/** Keys whose (string) value names a region */
const regionKeys = new Set(["name", "~read", ".offset", ".length", ".slot"]);

/** A pointer with its regions, and references to them, renamed */
function rename(value: unknown, renames: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => rename(v, renames));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      regionKeys.has(key) && typeof v === "string" && v in renames
        ? renames[v]
        : rename(v, renames),
    ]),
  );
}

/**
 * A pointer with each reference to a template in `templates` replaced
 * by the template's pointer, renamed by the reference's `yields`.
 * References to templates a pointer defines inline (`local`) stay.
 */
function inline(
  pointer: Format.Pointer,
  templates: Templates,
  local: Set<string> = new Set(),
): Format.Pointer {
  const within = (p: Format.Pointer) => inline(p, templates, local);
  if (Format.Pointer.isRegion(pointer)) return pointer;
  if ("group" in pointer) return { group: pointer.group.map(within) };
  if ("list" in pointer) {
    return { list: { ...pointer.list, is: within(pointer.list.is) } };
  }
  if ("if" in pointer) {
    return {
      ...pointer,
      then: within(pointer.then),
      ...(pointer.else ? { else: within(pointer.else) } : {}),
    };
  }
  if ("define" in pointer) {
    return { define: pointer.define, in: within(pointer.in) };
  }
  if ("templates" in pointer) {
    const names = new Set([...local, ...Object.keys(pointer.templates)]);
    return {
      templates: Object.fromEntries(
        Object.entries(pointer.templates).map(([name, template]) => [
          name,
          { ...template, for: inline(template.for, templates, names) },
        ]),
      ),
      in: inline(pointer.in, templates, names),
    };
  }
  if (local.has(pointer.template)) return pointer;
  return rename(
    within(templates[pointer.template].for),
    pointer.yields ?? {},
  ) as Format.Pointer;
}

/** A pointer's regions at a state, with their bytes */
async function read(
  pointer: Format.Pointer,
  state: Machine.State,
  templates: Templates,
): Promise<unknown> {
  try {
    const view = await (
      await dereference(pointer, { state, templates })
    ).view(state);
    const regions = [];
    for (const region of view.regions) {
      const at = (["slot", "offset", "length"] as const).map((key) => [
        key,
        (region as Partial<Record<typeof key, Data>>)[key]?.toHex(),
      ]);
      regions.push({
        name: region.name,
        location: region.location,
        ...Object.fromEntries(at),
        bytes: (await view.read(region)).toHex(),
      });
    }
    return regions;
  } catch (error) {
    // (a trace holds only the storage it touched)
    return { error: (error as Error).message };
  }
}

describe("pointers that refer to templates read as written out", async () => {
  const files = await glob("**/*.bug", { cwd: EXAMPLES_DIR });
  for (const file of files.sort()) {
    const source = await fs.readFile(path.join(EXAMPLES_DIR, file), "utf-8");
    if (/\/\/ @(wip|skip|expect-)/.test(source)) continue;
    const calldatas = [
      ...new Set([
        "",
        ...parseTestBlocks(source).flatMap(({ parsed }) =>
          parsed.callData ? [parsed.callData] : [],
        ),
      ]),
    ];

    for (const level of levels) {
      it(`${file} at O${level}`, async () => {
        for (const calldata of calldatas) {
          const run = await traceLocals(source, level, calldata);
          const { templates } = run;
          const same = async (
            pointer: Format.Pointer,
            state: Machine.State,
          ) => {
            expect(await read(pointer, state, templates)).toEqual(
              await read(inline(pointer, templates), state, {}),
            );
          };

          for (let k = 0; k + 1 < run.steps.length; k++) {
            const context = run.instructionAt(run.steps[k])?.context;
            const pointers = localsOf(context).flatMap(({ pointer }) =>
              pointer ? [pointer as Format.Pointer] : [],
            );
            if (pointers.length === 0) continue;
            // (contexts are postconditions)
            const state = run.stateAt(k + 1);
            for (const pointer of pointers) await same(pointer, state);
          }

          // the storage variables, with all the storage after the call
          const state = createMachineState(await run.executor.currentState());
          for (const { pointer } of localsOf(run.program.context)) {
            if (pointer) await same(pointer as Format.Pointer, state);
          }
        }
      }, 60_000);
    }
  }
});
