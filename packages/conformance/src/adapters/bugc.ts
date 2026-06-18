import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Materials } from "@ethdebug/format";
import { VERSION, compile } from "@ethdebug/bugc";

import type { BugcCompileOptions, EthdebugArtifact } from "../types.js";

function hex(bytes: Uint8Array | number[]): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function relativeSourcePath(sourcePath: string): string {
  const relative = path.relative(process.cwd(), sourcePath);
  return relative.startsWith("..") ? sourcePath : relative;
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
      ["number", "string"].includes(typeof node.source.id)
    ) {
      ids.push(node.source.id as Materials.Id);
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

export async function compileBugc(
  options: BugcCompileOptions,
): Promise<EthdebugArtifact> {
  const sourcePath = path.resolve(options.sourcePath);
  const contents = await readFile(sourcePath, "utf8");
  const sourceId = relativeSourcePath(sourcePath);
  const result = await compile({
    to: "bytecode",
    source: contents,
    sourcePath: sourceId,
    optimizer: {
      level: options.optimizationLevel ?? 0,
    },
  });

  if (!result.success) {
    throw new Error(
      `BUG compilation failed: ${JSON.stringify(result.messages)}`,
    );
  }

  const { bytecode } = result.value;
  const programs = [
    {
      name: "runtime",
      program: bytecode.runtimeProgram,
      bytecode: hex(bytecode.runtime),
    },
  ];

  if (bytecode.createProgram && bytecode.create) {
    programs.push({
      name: "create",
      program: bytecode.createProgram,
      bytecode: hex(bytecode.create),
    });
  }

  const sourceIds = new Set<Materials.Id>([sourceId]);
  for (const program of programs) {
    for (const id of referencedSourceIds(program.program)) {
      sourceIds.add(id);
    }
  }

  const sources = Array.from(sourceIds).map(
    (id): Materials.Source => ({
      id,
      path: sourceId,
      contents,
      language: "BUG",
    }),
  );
  const compilation: Materials.Compilation = {
    id: `bugc:${sourceId}`,
    compiler: {
      name: "bugc",
      version: VERSION,
    },
    sources,
  };

  return {
    compiler: "bugc",
    sources,
    programs,
    compilation,
    resources: {
      compilation,
      types: {},
      pointers: {},
    },
    raw: result.value,
  };
}
