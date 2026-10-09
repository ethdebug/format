import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Packs the React packages and installs them, with plain `npm install`,
// into small consumers on each supported React and shiki pair. Each consumer
// type-checks with skipLibCheck off, so a broken .d.ts fails.
const packed = [
  "format",
  "pointers",
  "evm",
  "programs-react",
  "pointers-react",
];
const pairs = [
  { react: "18", types: "18", shiki: "2.5" },
  { react: "19", types: "19", shiki: "3" },
];

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });

const root = mkdtempSync(join(tmpdir(), "react-consumers-"));
const tarballs = packed.map((name) => {
  const out = execFileSync("npm", ["pack", "--pack-destination", root], {
    cwd: join("packages", name),
    encoding: "utf8",
  });
  return join(root, out.trim().split("\n").pop()!);
});

for (const { react, types, shiki } of pairs) {
  const dir = join(root, `react-${react}`);
  mkdirSync(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "esnext",
        jsx: "react-jsx",
        strict: true,
        types: ["node"],
        skipLibCheck: false,
        noEmit: true,
      },
      include: ["index.tsx"],
    }),
  );
  writeFileSync(
    join(dir, "index.tsx"),
    `import { ShikiCodeBlock } from "@ethdebug/programs-react";
import * as Pointers from "@ethdebug/pointers-react";
export const a = <ShikiCodeBlock code="" language="solidity" />;
export const b = Pointers;
`,
  );
  run(
    "npm",
    [
      "install",
      `react@${react}`,
      `react-dom@${react}`,
      `@types/react@${types}`,
      `@types/react-dom@${types}`,
      `shiki@${shiki}`,
      "typescript",
      "@types/node@20",
      ...tarballs,
    ],
    dir,
  );
  run("node", [join(dir, "node_modules/typescript/bin/tsc")], dir);
  console.log(`ok: React ${react} + shiki ${shiki}`);
}
