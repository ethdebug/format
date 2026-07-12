import { exampleSources, stripTestAnnotations } from "@ethdebug/bugc/examples";

export interface Example {
  name: string;
  displayName: string;
  category: "basic" | "intermediate" | "advanced" | "optimizations";
  code: string;
}

// Curated subset of the canonical `.bug` files shipped by
// `@ethdebug/bugc/examples`, organized by category. The sources stay
// upstream (bugc's behavioral tests compile the same files); only the
// selection, labels, and display order live here. Test annotations are
// stripped so the editor shows clean source.
const curated: Array<{
  path: string;
  name: string;
  displayName: string;
  category: Example["category"];
}> = [
  // Basic examples
  {
    path: "basic/minimal.bug",
    name: "minimal",
    displayName: "Minimal",
    category: "basic",
  },
  {
    path: "basic/conditionals.bug",
    name: "conditionals",
    displayName: "Conditionals",
    category: "basic",
  },
  {
    path: "basic/functions.bug",
    name: "functions",
    displayName: "Functions",
    category: "basic",
  },
  {
    path: "basic/array-length.bug",
    name: "array-length",
    displayName: "Array Length",
    category: "basic",
  },

  // Intermediate examples
  {
    path: "intermediate/owner-counter.bug",
    name: "owner-counter",
    displayName: "Owner Counter",
    category: "intermediate",
  },
  {
    path: "intermediate/arrays.bug",
    name: "arrays",
    displayName: "Arrays and Loops",
    category: "intermediate",
  },
  {
    path: "intermediate/mappings.bug",
    name: "mappings",
    displayName: "Mappings",
    category: "intermediate",
  },
  {
    path: "intermediate/scopes.bug",
    name: "scopes",
    displayName: "Variable Scopes",
    category: "intermediate",
  },
  {
    path: "intermediate/slices.bug",
    name: "slices",
    displayName: "Byte Slices",
    category: "intermediate",
  },
  {
    path: "intermediate/calldata.bug",
    name: "calldata",
    displayName: "Calldata Access",
    category: "intermediate",
  },

  // Advanced examples
  {
    path: "advanced/nested-mappings.bug",
    name: "nested-mappings",
    displayName: "Nested Mappings",
    category: "advanced",
  },
  {
    path: "advanced/nested-arrays.bug",
    name: "nested-arrays",
    displayName: "Nested Arrays",
    category: "advanced",
  },
  {
    path: "advanced/nested-structs.bug",
    name: "nested-structs",
    displayName: "Nested Structs",
    category: "advanced",
  },

  // Optimization demos
  {
    path: "optimizations/cse.bug",
    name: "cse",
    displayName: "CSE Demo",
    category: "optimizations",
  },
  {
    path: "optimizations/constant-folding.bug",
    name: "constant-folding",
    displayName: "Constant Folding",
    category: "optimizations",
  },
];

export const examples: Example[] = curated.map(
  ({ path, name, displayName, category }) => {
    const source = exampleSources[path];
    if (source === undefined) {
      throw new Error(
        `Curated example "${path}" is not in @ethdebug/bugc/examples`,
      );
    }
    return { name, displayName, category, code: stripTestAnnotations(source) };
  },
);
