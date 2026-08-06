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

// TRANSITIONAL CARVE-OUT — remove when solc and soldb emit string ids.
//
// The spec now requires resource identifiers to be strings
// (schema:ethdebug/format/materials/id). External producers exercised by
// this suite — solc's ETHDebug emission and the soldb consumer — still use
// numeric source/compilation ids (soldb threads them as `u64`). Until they
// stringify upstream, a numeric id is the one nonconformance this suite
// downgrades from a hard failure to a loud warning; every other validation
// failure still fails hard. See:
const NUMERIC_ID_TRANSITIONAL_ISSUE =
  "https://github.com/ethdebug/format/issues/287";

function isError(unit: OutputUnit): boolean {
  return !unit.valid && !unit.keyword.endsWith("#validate");
}

// Resolve the value at a BASIC `instanceLocation` (e.g. "#/a/0/b").
function instanceAt(value: unknown, instanceLocation: string): unknown {
  const tokens = instanceLocation
    .replace(/^#/, "")
    .split("/")
    .slice(1)
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node: unknown = value;
  for (const token of tokens) {
    if (node && typeof node === "object") {
      node = (node as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return node;
}

// A numeric value failing the materials/id string constraint.
function isNumericMaterialsIdFailure(
  unit: OutputUnit,
  value: unknown,
): boolean {
  return (
    unit.keyword.endsWith("/type") &&
    unit.absoluteKeywordLocation.includes("ethdebug/format/materials/id") &&
    typeof instanceAt(value, unit.instanceLocation) === "number"
  );
}

function isAncestorOfAny(instanceLocation: string, paths: string[]): boolean {
  return paths.some((path) => path.startsWith(`${instanceLocation}/`));
}

function schemaErrors(units: OutputUnit[]): string {
  const messages = units.map(
    (unit) => `${unit.instanceLocation} fails ${unit.absoluteKeywordLocation}`,
  );
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
  if (output.valid) {
    return;
  }

  const errors = (output.errors ?? []).filter(isError);
  const carvedIds = errors.filter((unit) =>
    isNumericMaterialsIdFailure(unit, value),
  );
  const carvedPaths = carvedIds.map((unit) => unit.instanceLocation);

  // Real failures are those that are neither a carved numeric-id failure nor
  // a cascade of one (a failure reported at an ancestor of a carved id).
  const realErrors = errors.filter(
    (unit) =>
      !carvedIds.includes(unit) &&
      !isAncestorOfAny(unit.instanceLocation, carvedPaths),
  );

  if (carvedIds.length > 0) {
    console.warn(
      `[transitional] ${path}: external producer emitted ${carvedIds.length} ` +
        `numeric resource id(s) where the spec now requires strings ` +
        `(${carvedPaths.join(", ")}). Downgraded to a warning until solc and ` +
        `soldb emit string ids. See ${NUMERIC_ID_TRANSITIONAL_ISSUE}`,
    );
  }

  if (realErrors.length > 0) {
    issues.push(
      issue(
        path,
        `does not validate against ${schemaId}: ${schemaErrors(realErrors)}`,
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
