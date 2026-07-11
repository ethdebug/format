/**
 * Canonical BUG example sources, surfaced for editors and playgrounds.
 *
 * The `.bug` files under `packages/bugc/examples` are the single source of
 * truth: bugc's behavioral tests read them from disk, and this module
 * exposes the same sources as an importable string map so bundlers (webpack,
 * Vite) can ship them without globbing the filesystem.
 *
 * The raw sources carry bugc's test annotations (`/*@test … *\/` blocks and
 * `// @wip` / `// @skip` / `// @expect-*` directives). Call
 * {@link stripTestAnnotations} to get display-ready source for an editor.
 * Which examples to show, and how to label them, is left to each consumer.
 */

import { exampleSources } from "./generated.js";

export { exampleSources } from "./generated.js";
export type { ExampleSourcesByPath } from "./generated.js";
export { stripTestAnnotations } from "./annotations.js";

/** Relative paths of every canonical example (e.g. `"basic/minimal.bug"`). */
export const examplePaths: string[] = Object.keys(exampleSources);

/** A single BUG example: its canonical path and raw source. */
export interface BugExample {
  /** Path relative to `packages/bugc/examples` (e.g. `"basic/minimal.bug"`). */
  path: string;
  /** Raw source, including bugc's inline test annotations. */
  source: string;
}
