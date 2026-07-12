/**
 * Curated BUG examples for the docs playground's example selector.
 *
 * The sources are the canonical `.bug` files shipped by
 * `@ethdebug/bugc/examples` — the same files bugc's behavioral tests
 * compile — so the playground never drifts from a hand-maintained copy.
 * We select a small subset, label it for display, and strip bugc's
 * inline test annotations so the editor shows clean source.
 */

import { exampleSources, stripTestAnnotations } from "@ethdebug/bugc/examples";

/** A named, display-labelled BUG source for the example selector. */
export interface BugExample {
  /** Stable identifier (used as the <option> value). */
  name: string;
  /** Human-readable label shown in the dropdown. */
  displayName: string;
  /** Display-ready BUG source (test annotations stripped). */
  code: string;
}

/**
 * The curated subset, in display order. `path` refers into
 * `@ethdebug/bugc/examples`; the sources stay upstream, only the
 * selection and labels live here.
 */
const curated: { path: string; name: string; displayName: string }[] = [
  {
    path: "intermediate/owner-counter.bug",
    name: "counter",
    displayName: "Owned counter",
  },
  { path: "basic/functions.bug", name: "functions", displayName: "Functions" },
  {
    path: "intermediate/arrays.bug",
    name: "arrays",
    displayName: "Arrays & loops",
  },
];

export const bugExamples: BugExample[] = curated.map(
  ({ path, name, displayName }) => {
    const source = exampleSources[path];
    if (source === undefined) {
      throw new Error(
        `Curated example "${path}" is not in @ethdebug/bugc/examples`,
      );
    }
    return { name, displayName, code: stripTestAnnotations(source) };
  },
);
