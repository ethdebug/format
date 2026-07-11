/**
 * The canonical `.bug` example files double as bugc's behavioral test
 * fixtures, so they carry inline test metadata: `/*@test … *\/` YAML
 * blocks and `// @wip` / `// @skip` / `// @expect-*` directive lines.
 * That metadata is noise when the same source is shown in an editor.
 *
 * `stripTestAnnotations` removes it, leaving clean, display-ready BUG
 * source. The canonical files stay the single source of truth; consumers
 * that render examples (the playground, the docs widget) strip on the way
 * out.
 */

// Matches a `/*@test … *\/` or `/**@test … *\/` block, together with any
// indentation on the line it opens and the trailing newline — so a block
// alone on its line disappears without leaving a blank behind.
const TEST_BLOCK = /[ \t]*\/\*\*?@test\b[\s\S]*?\*\/[ \t]*\n?/g;

// Matches a whole-line `// @wip` / `// @skip …` / `// @expect-*` directive.
const DIRECTIVE_LINE =
  /^[ \t]*\/\/[ \t]*@(?:wip|skip|expect-[a-z-]+)\b.*(?:\n|$)/gm;

/**
 * Strip bugc test annotations from BUG source, yielding display-ready text.
 */
export function stripTestAnnotations(source: string): string {
  const stripped = source
    .replace(TEST_BLOCK, "")
    .replace(DIRECTIVE_LINE, "")
    // Trim whitespace an inline removal may have left at a line's end.
    .replace(/[ \t]+$/gm, "")
    // Collapse the blank runs that removals leave behind to one blank line.
    .replace(/\n{3,}/g, "\n\n")
    // No leading blank lines; end with exactly one trailing newline.
    .replace(/^\n+/, "")
    .replace(/\s+$/, "");

  return stripped === "" ? "" : stripped + "\n";
}
