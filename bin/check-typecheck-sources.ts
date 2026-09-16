import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readWorkspaces } from "./publish-tagged.js";

const built = [/packages\/[^/]+\/dist\//, /node_modules\/@ethdebug\//];

export function builtFiles(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && built.some((re) => re.test(line)));
}

function tsc(root: string, packageDir: string): string {
  const local = join(packageDir, "node_modules", ".bin", "tsc");
  return existsSync(local) ? local : join(root, "node_modules", ".bin", "tsc");
}

function listFiles(root: string, packageDir: string): string {
  return execFileSync(
    tsc(root, packageDir),
    ["-p", "tsconfig.typecheck.json", "--listFiles", "--noEmit"],
    { cwd: packageDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
}

function main(): number {
  const root = fileURLToPath(new URL("..", import.meta.url));
  let failed = false;
  for (const workspace of readWorkspaces(root)) {
    if (!existsSync(join(workspace.dir, "tsconfig.typecheck.json"))) {
      continue;
    }
    const bad = builtFiles(listFiles(root, workspace.dir));
    if (bad.length > 0) {
      failed = true;
      console.error(`${workspace.name}: type-check reads built declarations:`);
      for (const path of bad) {
        console.error(`  ${path}`);
      }
    } else {
      console.log(`${workspace.name}: ok`);
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
