import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  EthdebugArtifact,
  SoldbCommand,
  SoldbDebugDir,
  SoldbDebugDirOptions,
  SoldbResult,
} from "../types.js";

export async function runSoldb(command: SoldbCommand): Promise<SoldbResult> {
  const executable =
    command.executable ?? process.env.ETHDEBUG_CONFORMANCE_SOLDB ?? "soldb";
  const args = command.args;

  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: command.cwd,
      env: {
        ...process.env,
        ...command.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      let json: unknown;
      if (command.expectJson) {
        try {
          json = JSON.parse(stdout);
        } catch (error) {
          reject(
            new Error(
              `SolDB output was not valid JSON: ${
                error instanceof Error ? error.message : String(error)
              }\n${stdout}`,
            ),
          );
          return;
        }
      }

      resolve({
        command: [executable, ...args],
        exitCode,
        stdout,
        stderr,
        json,
      });
    });

    child.stdin.end(command.stdin ?? "");
  });
}

function contractName(artifact: EthdebugArtifact, fallback?: string): string {
  return (
    fallback ??
    artifact.programs.find((program) => program.program.contract.name)?.program
      .contract.name ??
    "Contract"
  );
}

function ethdebugResources(artifact: EthdebugArtifact): unknown {
  if (artifact.resources) {
    return artifact.resources;
  }

  if (artifact.compilation) {
    return {
      compilation: artifact.compilation,
      types: {},
      pointers: {},
    };
  }

  throw new Error(
    "Cannot write SolDB debug directory without ETHDebug resources",
  );
}

export async function writeSoldbDebugDir(
  artifact: EthdebugArtifact,
  options: SoldbDebugDirOptions = {},
): Promise<SoldbDebugDir> {
  const debugDir =
    options.dir ?? (await mkdtemp(path.join(os.tmpdir(), "ethdebug-soldb-")));
  await mkdir(debugDir, { recursive: true });

  const name = contractName(artifact, options.contractName);
  const address =
    options.address ?? "0x0000000000000000000000000000000000000001";

  await writeFile(
    path.join(debugDir, "ethdebug.json"),
    JSON.stringify(ethdebugResources(artifact), null, 2),
  );

  for (const program of artifact.programs) {
    const file =
      program.program.environment === "create"
        ? `${name}_ethdebug.json`
        : `${name}_ethdebug-runtime.json`;
    await writeFile(path.join(debugDir, file), JSON.stringify(program.program));
  }

  return {
    debugDir,
    spec: `${address}:${name}:${debugDir}`,
    address,
    contractName: name,
  };
}
