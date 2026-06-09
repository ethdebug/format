import { Materials, isProgram, schemas } from "@ethdebug/format";
import {
  addSchema,
  setMetaSchemaOutputFormat,
  validate,
  type OutputUnit,
} from "@hyperjump/json-schema/draft-2020-12";
import { BASIC } from "@hyperjump/json-schema/experimental";

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

let schemasRegistered = false;

function registerSchemas(): void {
  if (schemasRegistered) {
    return;
  }

  setMetaSchemaOutputFormat(BASIC);
  for (const schema of Object.values(schemas)) {
    addSchema(schema as any);
  }
  schemasRegistered = true;
}

function schemaErrors(output: { errors?: OutputUnit[] }): string {
  const errors = output.errors ?? [];
  const messages = errors
    .map((error) => {
      if (error.valid || error.keyword.endsWith("#validate")) {
        return undefined;
      }
      return `${error.instanceLocation} fails ${error.absoluteKeywordLocation}`;
    })
    .filter((message): message is string => !!message);

  return messages.length > 0 ? messages.join("; ") : "schema validation failed";
}

async function validateSchema(
  schemaId: string,
  value: unknown,
  path: string,
  issues: StaticConformanceIssue[],
): Promise<void> {
  registerSchemas();
  const output = await validate(schemaId, value as any, BASIC);
  if (!output.valid) {
    issues.push(
      issue(
        path,
        `does not validate against ${schemaId}: ${schemaErrors(output)}`,
      ),
    );
  }
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

export async function validateStaticConformance(
  artifact: EthdebugArtifact,
): Promise<StaticConformanceResult> {
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
  for (const [index, program] of artifact.programs.entries()) {
    await validateSchema(
      "schema:ethdebug/format/program",
      program.program,
      `programs[${index}]`,
      issues,
    );
  }

  if (artifact.compilation && !Materials.isCompilation(artifact.compilation)) {
    issues.push(
      issue("compilation", "compilation is not valid materials/compilation"),
    );
  }
  if (artifact.compilation) {
    await validateSchema(
      "schema:ethdebug/format/materials/compilation",
      artifact.compilation,
      "compilation",
      issues,
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
  if (artifact.resources) {
    await validateSchema(
      "schema:ethdebug/format/info/resources",
      artifact.resources,
      "resources",
      issues,
    );
  }

  const knownSourceIds = sourceIds(artifact);
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
  const staticResult = await validateStaticConformance(artifact);
  const soldb = fixture.soldb ? await runSoldb(fixture.soldb) : undefined;

  return {
    artifact,
    static: staticResult,
    soldb,
  };
}
