import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type {
  EthdebugArtifact,
  EthdebugProgramArtifact,
  SourceFile,
  SolcCompileOptions,
} from "../types.js";

function run(
  command: string,
  args: string[],
  input: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code}\n${stderr}`,
          ),
        );
      }
    });
    child.stdin.end(input);
  });
}

function contractOutputs(output: any): EthdebugProgramArtifact[] {
  const programs: EthdebugProgramArtifact[] = [];
  for (const [sourcePath, contracts] of Object.entries<any>(
    output.contracts ?? {},
  )) {
    for (const [contractName, contract] of Object.entries<any>(contracts)) {
      const createProgram = contract.evm?.bytecode?.ethdebug;
      if (createProgram) {
        programs.push({
          name: `${sourcePath}:${contractName}:create`,
          program: createProgram,
          bytecode: contract.evm?.bytecode?.object
            ? `0x${contract.evm.bytecode.object}`
            : undefined,
        });
      }

      const runtimeProgram = contract.evm?.deployedBytecode?.ethdebug;
      if (runtimeProgram) {
        programs.push({
          name: `${sourcePath}:${contractName}:runtime`,
          program: runtimeProgram,
          bytecode: contract.evm?.deployedBytecode?.object
            ? `0x${contract.evm.deployedBytecode.object}`
            : undefined,
        });
      }
    }
  }
  return programs;
}

export async function compileSolc(
  options: SolcCompileOptions,
): Promise<EthdebugArtifact> {
  const sourcePaths = options.sourcePaths ?? [options.sourcePath];
  const sourceFiles = await Promise.all(
    sourcePaths.map(async (sourcePath): Promise<SourceFile> => {
      const resolved = path.resolve(sourcePath);
      return {
        path: path.basename(resolved),
        contents: await readFile(resolved, "utf8"),
        language: "Solidity",
      };
    }),
  );
  const solcPath =
    options.solcPath ?? process.env.ETHDEBUG_CONFORMANCE_SOLC ?? "solc";
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(
      sourceFiles.map((source) => [
        source.path,
        {
          content: source.contents,
        },
      ]),
    ),
    settings: {
      experimental: true,
      viaIR: options.viaIR ?? true,
      debug: {
        debugInfo: ["ethdebug"],
      },
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode.object",
            "evm.bytecode.ethdebug",
            "evm.deployedBytecode.object",
            "evm.deployedBytecode.ethdebug",
            "ethdebug.resources",
            "ethdebug.compilation",
          ],
        },
      },
    },
  };

  const { stdout } = await run(
    solcPath,
    ["--standard-json"],
    JSON.stringify(input),
  );
  const output = JSON.parse(stdout);

  const errors = (output.errors ?? []).filter(
    (error: any) => error.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(`solc compilation failed: ${JSON.stringify(errors)}`);
  }

  return {
    compiler: "solc",
    sources: sourceFiles,
    programs: contractOutputs(output),
    compilation: output.ethdebug?.compilation,
    resources: output.ethdebug?.resources,
    raw: output,
  };
}
