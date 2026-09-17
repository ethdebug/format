import { execFileSync } from "node:child_process";

const allowed = [
  /^package\.json$/,
  /^README[^/]*$/,
  /^LICENSE[^/]*$/,
  /^CHANGELOG[^/]*$/,
  /^dist\/src\//,
  /^dist\/bin\//,
];

const rejected = [/\.test\./, /\.tsbuildinfo$/];

export function checkPackList(files: string[]): string[] {
  return files.filter(
    (path) =>
      !allowed.some((re) => re.test(path)) ||
      rejected.some((re) => re.test(path)),
  );
}

export function parsePackOutput(stdout: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.lastIndexOf("[");
  if (start < 0) {
    throw new Error("npm pack --json: no JSON array in output");
  }
  const parsed = JSON.parse(lines.slice(start).join("\n")) as {
    files: { path: string }[];
  }[];
  return parsed.flatMap((entry) => entry.files.map((file) => file.path));
}

export function packList(packageDir: string): string[] {
  const stdout = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return parsePackOutput(stdout);
}
