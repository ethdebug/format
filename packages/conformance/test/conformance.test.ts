import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  deployBytecode,
  sendContractTransaction,
  startAnvil,
} from "../src/adapters/anvil.js";
import {
  observeSourceBreakpoint,
  runSoldb,
  sourceBreakpointScript,
  writeSoldbDebugDir,
} from "../src/adapters/soldb.js";
import { compileEthdebug, validateStaticConformance } from "../src/runner.js";
import type { EthdebugArtifact } from "../src/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const solc = process.env.ETHDEBUG_CONFORMANCE_SOLC;
const soldb = process.env.ETHDEBUG_CONFORMANCE_SOLDB;
const anvilExecutable = process.env.ETHDEBUG_CONFORMANCE_ANVIL ?? "anvil";
const castExecutable = process.env.ETHDEBUG_CONFORMANCE_CAST ?? "cast";

function executableExists(command: string): boolean {
  if (command.includes("/")) {
    try {
      accessSync(command, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function hasFoundry(): boolean {
  return executableExists(anvilExecutable) && executableExists(castExecutable);
}

function validCompilation() {
  return {
    id: "test-compilation",
    compiler: {
      name: "testc",
      version: "0.0.0",
    },
    sources: [
      {
        id: 5,
        path: "Counter.test",
        contents: "contract Counter {}",
        language: "Test",
      },
    ],
  };
}

function validProgram() {
  return {
    contract: {
      name: "Counter",
      definition: {
        source: {
          id: 5,
        },
        range: {
          offset: 0,
          length: 19,
        },
      },
    },
    environment: "call",
    instructions: [
      {
        offset: 0,
        operation: {
          mnemonic: "STOP",
        },
        context: {
          code: {
            source: {
              id: 5,
            },
            range: {
              offset: 0,
              length: 19,
            },
          },
        },
      },
    ],
  };
}

function validResources() {
  return {
    compilation: validCompilation(),
    types: {
      CounterSlot: {
        kind: "uint",
        bits: 256,
      },
    },
    pointers: {
      CounterSlotStorage: {
        expect: ["slot"],
        for: {
          location: "storage",
          slot: "slot",
        },
      },
    },
  };
}

function validArtifact(
  overrides: Partial<EthdebugArtifact> = {},
): EthdebugArtifact {
  return {
    compiler: "solc",
    sources: [
      {
        path: "Counter.test",
        contents: "contract Counter {}",
        language: "Test",
      },
    ],
    programs: [
      {
        name: "Counter:runtime",
        program: validProgram() as any,
      },
    ],
    compilation: validCompilation() as any,
    ...overrides,
  };
}

describe("@ethdebug/conformance", () => {
  it("[bug] compiles BUG fixtures into valid ETHDebug programs", async () => {
    const artifact = await compileEthdebug({
      kind: "bugc",
      sourcePath: path.join(root, "test/fixtures/bugc/minimal.bug"),
    });

    const result = await validateStaticConformance(artifact);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(artifact.programs.length).toBeGreaterThan(0);
  });

  it.skipIf(!solc)(
    "[solc] compiles Solidity fixtures and validates ETHDebug output",
    async () => {
      const artifact = await compileEthdebug({
        kind: "solc",
        solcPath: solc!,
        sourcePath: path.join(root, "test/fixtures/solc/Counter.sol"),
      });

      const result = await validateStaticConformance(artifact);
      expect(result.issues).toEqual([]);
      expect(result.ok).toBe(true);
      expect(
        artifact.compilation ?? artifact.resources?.compilation,
      ).toBeDefined();
    },
  );

  it.skipIf(!soldb || !solc)(
    "[soldb] checks solc ETHDebug resources through the SolDB consumer backend",
    async () => {
      const artifact = await compileEthdebug({
        kind: "solc",
        solcPath: solc!,
        sourcePath: path.join(root, "test/fixtures/solc/Counter.sol"),
      });
      const debugDir = await writeSoldbDebugDir(artifact, {
        contractName: "Counter",
      });
      expect(executableExists(soldb!)).toBe(true);

      const result = await runSoldb({
        executable: soldb!,
        args: ["info", "resources", "--ethdebug-dir", debugDir.spec, "--json"],
        expectJson: true,
      });

      expect(result.exitCode).toBe(0);
      const json = result.json as any;
      expect(json.contracts[0].name).toBe("Counter");
      expect(json.contracts[0].resources).toEqual(artifact.resources);
      expect(
        json.contracts[0].resources.compilation.sources[0].contents,
      ).toContain("contract Counter");
    },
  );

  it.skipIf(!soldb || !solc)(
    "[soldb] checks multi-source solc ETHDebug resources through the SolDB consumer backend",
    async () => {
      const sourceDir = path.join(root, "test/fixtures/solc/multi-source");
      const artifact = await compileEthdebug({
        kind: "solc",
        solcPath: solc!,
        sourcePath: path.join(sourceDir, "Counter.sol"),
        sourcePaths: [
          path.join(sourceDir, "Counter.sol"),
          path.join(sourceDir, "Math.sol"),
        ],
      });
      const result = await validateStaticConformance(artifact);
      expect(result.issues).toEqual([]);
      expect(result.ok).toBe(true);

      const debugDir = await writeSoldbDebugDir(artifact, {
        contractName: "Counter",
      });
      const soldbResult = await runSoldb({
        executable: soldb!,
        args: ["info", "resources", "--ethdebug-dir", debugDir.spec, "--json"],
        expectJson: true,
      });

      expect(soldbResult.exitCode).toBe(0);
      const json = soldbResult.json as any;
      const sources = json.contracts[0].resources.compilation.sources;
      expect(sources.map((source: any) => source.path).sort()).toEqual([
        "Counter.sol",
        "Math.sol",
      ]);
      expect(
        sources.find((source: any) => source.path === "Counter.sol").contents,
      ).toContain('import "./Math.sol"');
      expect(
        sources.find((source: any) => source.path === "Math.sol").contents,
      ).toContain("library Math");
    },
  );

  it.skipIf(!soldb || !solc || !hasFoundry())(
    "[soldb] checks source-line breakpoints against solc output on local anvil",
    async () => {
      const artifact = await compileEthdebug({
        kind: "solc",
        solcPath: solc!,
        sourcePath: path.join(root, "test/fixtures/solc/Counter.sol"),
      });
      const createProgram = artifact.programs.find(
        (program) =>
          program.program.environment === "create" && program.bytecode,
      );
      expect(createProgram?.bytecode).toBeDefined();

      const anvil = await startAnvil({ executable: anvilExecutable });
      try {
        const deployment = await deployBytecode(
          anvil,
          createProgram!.bytecode!,
          {
            executable: castExecutable,
          },
        );
        const debugDir = await writeSoldbDebugDir(artifact, {
          address: deployment.contractAddress!,
          contractName: "Counter",
        });
        const tx = await sendContractTransaction(
          anvil,
          deployment.contractAddress!,
          "increment(uint256)",
          ["4"],
          { executable: castExecutable },
        );

        const interactive = await runSoldb({
          executable: soldb!,
          args: [
            "trace",
            tx.transactionHash,
            "--rpc",
            anvil.rpcUrl,
            "--ethdebug-dir",
            debugDir.spec,
            "--interactive",
          ],
          stdin: sourceBreakpointScript("Counter.sol:8"),
        });

        expect(interactive.exitCode).toBe(0);
        expect(observeSourceBreakpoint(interactive, "Counter.sol:8")).toEqual({
          set: true,
          hit: true,
          stoppedAtTarget: true,
        });
      } finally {
        await anvil.stop();
      }
    },
  );

  it("rejects malformed ETHDebug programs through JSON-Schema validation", async () => {
    const artifact = validArtifact({
      programs: [
        {
          name: "Counter:runtime",
          program: {
            ...validProgram(),
            instructions: "not an instruction array",
          } as any,
        },
      ],
    });

    const result = await validateStaticConformance(artifact);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "programs[0]")).toBe(
      true,
    );
    expect(
      result.issues.some((issue) =>
        issue.message.includes("schema:ethdebug/format/program"),
      ),
    ).toBe(true);
  });

  it("rejects program source references when no compilation source table is present", async () => {
    const result = await validateStaticConformance(
      validArtifact({
        compilation: undefined,
        resources: undefined,
      }),
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) =>
        issue.message.includes("references unknown source id 5"),
      ),
    ).toBe(true);
  });

  it("validates resources lookup tables for types and pointer templates", async () => {
    const artifact = validArtifact({
      compilation: undefined,
      resources: validResources() as any,
    });

    const result = await validateStaticConformance(artifact);

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed resources lookup tables through JSON-Schema validation", async () => {
    const artifact = validArtifact({
      compilation: undefined,
      resources: {
        ...validResources(),
        pointers: {
          CounterSlotStorage: {
            expect: ["slot"],
          },
        },
      } as any,
    });

    const result = await validateStaticConformance(artifact);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "resources")).toBe(
      true,
    );
  });

  it("materializes non-empty resources into SolDB debug directories", async () => {
    const debugDir = await writeSoldbDebugDir(
      validArtifact({
        compilation: undefined,
        resources: validResources() as any,
      }),
      {
        contractName: "Counter",
      },
    );

    const resources = JSON.parse(
      await readFile(path.join(debugDir.debugDir, "ethdebug.json"), "utf8"),
    );

    expect(resources.types.CounterSlot).toEqual({
      kind: "uint",
      bits: 256,
    });
    expect(resources.pointers.CounterSlotStorage).toEqual({
      expect: ["slot"],
      for: {
        location: "storage",
        slot: "slot",
      },
    });
  });
});
