/**
 * Pointer templates shared by a compilation's pointers
 *
 * A pointer shape that repeats (a local in the frame, a string in
 * storage, a struct in memory, ...) is defined once, by name, as a
 * pointer template in the compilation's info resources (`pointers`),
 * and each pointer of that shape refers to it: the template's expected
 * variables are bound by a scope (`define`) around the reference, and
 * its regions are renamed by the reference's `yields`, so they keep the
 * names they would have in an inline pointer.
 */
import * as Format from "@ethdebug/format";

import { Type } from "#types";

export type Templates = Format.Pointer.Templates;

/**
 * Template `name` in `templates`: defined, if it is not there yet, as
 * `make` gives it (undefined: none). Its name, if defined.
 */
export function define(
  templates: Templates,
  name: string,
  make: () => Format.Pointer.Template | undefined,
): string | undefined {
  if (!(name in templates)) {
    const template = make();
    if (!template) return undefined;
    templates[name] = template;
  }
  return name;
}

/**
 * A reference to template `name`: with `define` binding its variables
 * (a variable bound to itself is left out), and `yields` renaming its
 * regions (a name kept as it is is left out).
 */
export function referTo(
  name: string,
  define: Record<string, Format.Pointer.Expression> = {},
  yields: Record<string, string> = {},
): Format.Pointer {
  const renames = Object.entries(yields).filter(([from, to]) => from !== to);
  const ref: Format.Pointer = {
    template: name,
    ...(renames.length > 0 ? { yields: Object.fromEntries(renames) } : {}),
  };
  const bindings = Object.entries(define).filter(([name, e]) => e !== name);
  return bindings.length > 0
    ? { define: Object.fromEntries(bindings), in: ref }
    : ref;
}

/**
 * The names of the regions a pointer gives, in order, each once: its
 * regions', and those of the templates it refers to, as renamed. Region
 * names in templates a pointer defines inline (a mapping's entry) are
 * not its own.
 */
export function regionNames(
  pointer: Format.Pointer,
  templates: Templates,
): string[] {
  const known = namesOf.get(pointer);
  if (known) return known;
  const names = new Set<string>();
  const visit = (pointer: Format.Pointer): void => {
    if (Format.Pointer.isRegion(pointer)) {
      if (pointer.name !== undefined) names.add(pointer.name);
      return;
    }
    if ("group" in pointer) return pointer.group.forEach(visit);
    if ("list" in pointer) return visit(pointer.list.is);
    if ("if" in pointer) {
      visit(pointer.then);
      if (pointer.else) visit(pointer.else);
      return;
    }
    if ("in" in pointer) return visit(pointer.in);
    if ("template" in pointer) {
      const yields: Record<string, string> = pointer.yields ?? {};
      const { for: body } = templates[pointer.template];
      for (const name of regionNames(body, templates)) {
        names.add(yields[name] ?? name);
      }
    }
  };
  visit(pointer);
  namesOf.set(pointer, [...names]);
  return [...names];
}

/** The region names of pointers already visited (templates' pointers
 * are visited once for each reference to them) */
const namesOf = new WeakMap<Format.Pointer, string[]>();

/** Renames of `names` with `prefix` (for `yields`) */
export function prefixed(
  names: string[],
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, `${prefix}${name}`]));
}

/**
 * A type's name as part of a template name: as BUG writes it, with its
 * other characters as dashes (`mapping<address, Player>` is
 * `mapping-address-Player`)
 */
export function typeName(type: Type): string {
  return Type.format(type)
    .replace(/[^a-zA-Z0-9$_-]+/g, "-")
    .replace(/-+$/, "");
}
