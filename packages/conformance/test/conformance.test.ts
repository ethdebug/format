import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  deployBytecode,
  sendContractTransaction,
  startAnvil,
} from "../src/adapters/anvil.js";
import { runSoldb, writeSoldbDebugDir } from "../src/adapters/soldb.js";
import { compileEthdebug, validateStaticConformance } from "../src/runner.js";

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

describe("@ethdebug/conformance", () => {
  it("[bug] compiles BUG fixtures into valid ETHDebug programs", async () => {
    const artifact = await compileEthdebug({
      kind: "bugc",
      sourcePath: path.join(root, "test/fixtures/bugc/minimal.bug"),
    });

    const result = validateStaticConformance(artifact);
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

      const result = validateStaticConformance(artifact);
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
      const result = validateStaticConformance(artifact);
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
          stdin: "break Counter.sol:8\ncontinue\nq\n",
        });

        expect(interactive.exitCode).toBe(0);
        expect(interactive.stdout).toContain(
          "Breakpoint set at Counter.sol:8, PC",
        );
        expect(interactive.stdout).toContain("Breakpoint hit at step");
        expect(interactive.stdout).toContain("Counter.sol:8, PC");
      } finally {
        await anvil.stop();
      }
    },
  );
});
