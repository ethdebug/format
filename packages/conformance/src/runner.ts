import { Materials, isProgram } from "@ethdebug/format";

import { compileBugc } from "./adapters/bugc.js";
import { runSoldb } from "./adapters/soldb.js";
import { compileSolc } from "./adapters/solc.js";
import type {
  CompileOptions,
  ConformanceFixture,
  EthdebugArtifact,
  SoldbResult,
  StaticConformanceIssue,
  StaticConformanceResult,
} from "./types.js";

function issue(path: string, message: string): StaticConformanceIssue {
  return { path, message };
}

function sourceIds(artifact: EthdebugArtifact): Set<Materials.Id> {
  const ids = new Set<Materials.Id>();
  for (const source of artifact.compilation?.sources ?? []) {
    ids.add(source.id);
  }
  for (const source of artifact.resources?.compilation.sources ?? []) {
    ids.add(source.id);
  }
  return ids;
}

function referencedSourceIds(value: unknown): Materials.Id[] {
  const ids: Materials.Id[] = [];

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }

    if (
      "source" in node &&
      typeof node.source === "object" &&
      node.source &&
      "id" in node.source &&
      Materials.isId(node.source.id)
    ) {
      ids.push(node.source.id);
    }

    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (child && typeof child === "object") {
        visit(child);
      }
    }
  }

  visit(value);
  return ids;
}

export async function compileEthdebug(
  options: CompileOptions,
): Promise<EthdebugArtifact> {
  switch (options.kind) {
    case "bugc":
      return await compileBugc(options);
    case "solc":
      return await compileSolc(options);
  }
}

export function validateStaticConformance(
  artifact: EthdebugArtifact,
): StaticConformanceResult {
  const issues: StaticConformanceIssue[] = [];

  if (artifact.programs.length === 0) {
    issues.push(
      issue("programs", "compiler did not emit any ETHDebug programs"),
    );
  }

  artifact.programs.forEach((program, index) => {
    if (!isProgram(program.program)) {
      issues.push(
        issue(`programs[${index}]`, `${program.name} is not a valid program`),
      );
    }
  });

  if (artifact.compilation && !Materials.isCompilation(artifact.compilation)) {
    issues.push(
      issue("compilation", "compilation is not valid materials/compilation"),
    );
  }

  if (
    artifact.resources &&
    !Materials.isCompilation(artifact.resources.compilation)
  ) {
    issues.push(
      issue(
        "resources.compilation",
        "resources.compilation is not valid materials/compilation",
      ),
    );
  }

  const knownSourceIds = sourceIds(artifact);
  if (knownSourceIds.size > 0) {
    artifact.programs.forEach((program, programIndex) => {
      referencedSourceIds(program.program).forEach((sourceId) => {
        if (!knownSourceIds.has(sourceId)) {
          issues.push(
            issue(
              `programs[${programIndex}]`,
              `${program.name} references unknown source id ${String(sourceId)}`,
            ),
          );
        }
      });
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export async function runConformanceFixture(
  fixture: ConformanceFixture,
): Promise<{
  artifact: EthdebugArtifact;
  static: StaticConformanceResult;
  soldb?: SoldbResult;
}> {
  const artifact = await compileEthdebug(fixture.compile);
  const staticResult = validateStaticConformance(artifact);
  const soldb = fixture.soldb ? await runSoldb(fixture.soldb) : undefined;

  return {
    artifact,
    static: staticResult,
    soldb,
  };
}
