import { fileURLToPath } from "node:url";
import { checkPackList, packList } from "./packlist.js";
import { readWorkspaces } from "./publish-tagged.js";

const root = fileURLToPath(new URL("..", import.meta.url));

let failed = false;
for (const workspace of readWorkspaces(root)) {
  if (workspace.private) {
    continue;
  }
  const bad = checkPackList(packList(workspace.dir));
  if (bad.length > 0) {
    failed = true;
    console.error(`${workspace.name}: disallowed files in tarball:`);
    for (const path of bad) {
      console.error(`  ${path}`);
    }
  } else {
    console.log(`${workspace.name}: ok`);
  }
}
process.exit(failed ? 1 : 0);
