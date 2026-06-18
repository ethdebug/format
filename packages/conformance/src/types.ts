import type { Materials, Program } from "@ethdebug/format";

export type CompilerKind = "bugc" | "solc";

export interface SourceFile {
  path: string;
  contents: string;
  language?: string;
}

export interface EthdebugProgramArtifact {
  name: string;
  program: Program;
  bytecode?: string;
}

export interface EthdebugArtifact {
  compiler: CompilerKind;
  sources: SourceFile[];
  programs: EthdebugProgramArtifact[];
  compilation?: Materials.Compilation;
  resources?: {
    compilation: Materials.Compilation;
    types: Record<string, unknown>;
    pointers: Record<string, unknown>;
  };
  raw?: unknown;
}

export interface BugcCompileOptions {
  kind: "bugc";
  sourcePath: string;
  optimizationLevel?: 0 | 1 | 2 | 3;
}

export interface SolcCompileOptions {
  kind: "solc";
  sourcePath: string;
  sourcePaths?: string[];
  solcPath?: string;
  viaIR?: boolean;
}

export type CompileOptions = BugcCompileOptions | SolcCompileOptions;

export interface SoldbCommand {
  executable?: string;
  args: string[];
  cwd?: string;
  stdin?: string;
  env?: Record<string, string | undefined>;
  expectJson?: boolean;
}

export interface SoldbDebugDirOptions {
  dir?: string;
  address?: string;
  contractName?: string;
}

export interface SoldbDebugDir {
  debugDir: string;
  spec: string;
  address: string;
  contractName: string;
}

export interface SoldbResult {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  json?: unknown;
}

export interface StaticConformanceIssue {
  path: string;
  message: string;
}

export interface StaticConformanceResult {
  ok: boolean;
  issues: StaticConformanceIssue[];
}

export interface ConformanceFixture {
  name: string;
  compile: CompileOptions;
  soldb?: SoldbCommand;
}
