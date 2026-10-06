/**
 * Debug info must not change the generated code: compiling every
 * example at every level gives the same bytecode with local-variable
 * tracking (recording origins, enriching instructions) as without it.
 */
import { it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bytesToHex } from "ethereum-cryptography/utils";

const examples = join(__dirname, "../../../examples");

function sources(dir = examples): Array<[string, string]> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".bug")
      ? [[path.slice(examples.length + 1), readFileSync(path, "utf8")]]
      : [];
  }) as Array<[string, string]>;
}

type Compile = (typeof import("#compiler"))["compile"];

async function bytecode(compile: Compile): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, source] of sources()) {
    for (const level of [0, 1, 2, 3] as const) {
      let result: string;
      try {
        const compiled = await compile({
          to: "bytecode",
          source,
          optimizer: { level },
        });
        result = compiled.success
          ? bytesToHex(compiled.value.bytecode.runtime) +
            "/" +
            bytesToHex(compiled.value.bytecode.create ?? new Uint8Array())
          : "fails";
      } catch {
        result = "throws";
      }
      out[`${name} O${level}`] = result;
    }
  }
  return out;
}

it("local-variable tracking does not change any bytecode", async () => {
  const tracked = await bytecode((await import("#compiler")).compile);

  vi.resetModules();
  vi.doMock(
    "../../../dist/src/evmgen/debug/local-variables.js",
    async (load) => ({
      ...(await load<object>()),
      enrich: (module: unknown) => module,
    }),
  );
  vi.doMock("../../../dist/src/optimizer/origins.js", () => ({
    recordOrigins: () => {},
  }));
  const { compile } = await import("#compiler");

  // Without tracking, no instruction lists a local
  const probe = await compile({
    to: "bytecode",
    source: `name P; storage { [0] r: uint256; } create {}
code { let x = 7; r = x; }`,
    optimizer: { level: 0 },
  });
  if (!probe.success) throw new Error("compile failed");
  const listed = probe.value.bytecode.runtimeProgram.instructions.some((i) =>
    (
      i.context as { variables?: Array<{ identifier: string }> }
    )?.variables?.some((v) => v.identifier === "x"),
  );
  expect(listed).toBe(false);

  expect(await bytecode(compile)).toEqual(tracked);
}, 120_000);
