# Changelog

This file tracks changes to the `ethdebug/format` specification: the schemas
under `schemas/`. Those schemas ship inside the `@ethdebug/format` package,
whose build generates its distributed copies from `schemas/`, so the spec
version is that package's version and this file is keyed by it. Each published
package that implements the spec (`@ethdebug/pointers`, `@ethdebug/evm`, and so
on) has its own `CHANGELOG.md` under `packages/<name>/`; this file covers only
the spec itself.

Each entry gives a summary of what changed. Three sub-items follow:

- `Schemas:` the fully qualified name(s) of the schema(s) the change touches.
- `Producers:` what the change means for an emitter of `ethdebug/format` data (a
  compiler such as solc or bugc).
- `Consumers:` what the change means for a reader of `ethdebug/format` data (a
  debugger such as soldb).

Each `Producers:` and `Consumers:` sub-item starts with one of three prefixes:

- `no change needed.` Nothing that was valid becomes invalid, and nothing
  changes meaning for this party. One short reason may follow.
- `optional:` The change adds a capability. Nothing that was valid in the
  previous published version changes. No party is obliged to do anything. The
  sub-item says what the party may now do.
- `required:` Output that was valid in the previous published version no longer
  validates, or the specification adds or changes a normative **must**, or the
  meaning of data that was already valid changes. The sub-item names the schema
  keyword, or quotes the specification prose, that imposes the obligation. Prose
  that says **should** or "preferred" is never `required:`.

A consumer has an obligation only where producers can now emit something that a
conforming consumer would otherwise misread or reject, or where the meaning of
data that was already valid changed. A consumer that does not use a new optional
feature has no obligation.

A new branch in a closed `oneOf` that a consumer must interpret to read the data
at all (for example a new pointer expression or collection) is `required:` for
consumers, because producers may start to emit it at any time. An addition that
a consumer can skip without misreading anything else (for example a new kind of
context) is `optional:`.

Each impact line states the net effect for a party that moves from the previous
published version to the version of the section. A change inside a schema that
is new in that version obliges nobody, so its lines are `optional:` or
`no change needed.` and describe how the new schema works. An obligation that a
later change in the same version reverses does not appear in an impact line; the
summary may tell the history.

Each version has at most two sections. `### Added` holds a new schema, or a new
keyword or capability. `### Changed` holds a change to something that exists.
The sections do not signal obligations; the prefixes do.

## Unreleased

## 0.1.0-draft.0 — 2026-09-21

The version scheme changed: prerelease versions of the specification are now
`draft.<n>`, and `0.1.0-draft.0` follows `0.1.0-2`. No schema changed.

## 0.1.0-2 — 2026-09-17

### Changed

- The pointer fields of an external call or contract creation `invoke`
  (`target`, `gas`, `value`, `input`, `salt`) describe the operands that the
  marked CALL or CREATE instruction consumes, so they resolve against the state
  immediately before that instruction executes. This is the one exception to
  the rule from [#281] that a context's pointers resolve after its instruction.
  The `invoke` description had kept the earlier "trace step" sentence, which
  contradicted that rule; the context itself stays on the call instruction
  ([#303]).
  - Schemas: **ethdebug/format/program/context/function/invoke**,
    **ethdebug/format/program/instruction**,
    **ethdebug/format/program/context/function/return**
  - Producers: no change needed. The `invoke` examples already placed the
    context on the call instruction with pointers to its operands.
  - Consumers: required: resolve the pointer fields of a `message` or `create`
    `invoke` against the state before the marked instruction executes (a new
    exception in the `context` description). A consumer that followed the
    `invoke` examples already does this.

- A segment's `offset` is no longer limited to a value below `$wordsize`: an
  offset at or past `$wordsize` now carries into later slots. The default
  `length` is now `$wordsize - (offset mod $wordsize)`, which runs to the end of
  the slot in which the segment begins and equals the earlier default for an
  offset inside the slot. A `length` that spans slots was already defined. A new
  segment example shows the carry, and a new pointer example collapses a long
  storage string to one multi-slot region ([#284]).
  - Schemas: **ethdebug/format/pointer/scheme/segment**,
    **ethdebug/format/pointer**
  - Producers: optional: a producer may emit an `offset` at or past `$wordsize`
    and let it carry into later slots. Every pointer that was valid before keeps
    its meaning.
  - Consumers: required: find the slot and byte of an `offset` by division and
    remainder against `$wordsize`, and compute the default `length` as
    `$wordsize - (offset mod $wordsize)`. The `offset` description no longer
    says that the offset "**must** begin inside the slot".

- A property lookup through `$this` (for example `{ ".length": "$this" }`) must
  not be circular: the property it reads has to be resolvable without depending
  on the value being defined. A struct-array example that named its own region
  the long way around now uses `$this` ([#284]).
  - Schemas: **ethdebug/format/pointer/expression**,
    **ethdebug/format/pointer**
  - Producers: required: do not emit a circular property lookup through `$this`.
    A new "must not be circular" in the description imposes this; no validator
    catches it. A pointer that already resolves is not affected.
  - Consumers: no change needed. The rule constrains producers only, and no
    valid data changes meaning.

- Expressions now evaluate to one of two sorts, an unbounded integer or
  definite-width bytes, and the `$concat` and `$keccak256` operands **must** be
  width-bearing bytes rather than bare integers. A hexadecimal literal with an
  even number of digits is bytes of exactly the width written, a literal with an
  odd number of digits is an integer, and widths are never inferred from
  context; the earlier text let a literal omit leading zeroes and padded it to
  the width of its context. No schema keyword changes, so a validator accepts
  the same documents as before, but an expression that passes a bare integer to
  `$concat` or `$keccak256`, as the schema's own earlier examples did, no longer
  conforms. Those examples are corrected ([#286]).
  - Schemas: **ethdebug/format/pointer/expression**
  - Producers: required: give each bare-integer operand of `$concat` or
    `$keccak256` a width first with `$wordsized` or a `$sizedN` form, and write
    a literal that is meant as bytes with its full number of digits (a new
    "**must** be width-bearing" in the description). No validator catches this.
  - Consumers: required: the meaning of literals changed ("Widths are never
    inferred from context"). Read an even-digit hexadecimal literal as bytes of
    exactly the width written, and an odd-digit literal or a JSON number as an
    integer. Arithmetic results are unbounded integers. The specification does
    not say what a consumer does with a bare-integer operand.

## 0.1.0-1 — 2026-09-16

### Added

- A character encoding is a label defined by the WHATWG Encoding Standard, and
  an omitted optional encoding field means `utf-8`.
  **ethdebug/format/materials/source** and
  **ethdebug/format/type/elementary/string** both reference the new primitive
  instead of accepting a free-form string. The label requirement is a normative
  tightening that no validator catches: the schema is still `type: string`, so
  a label the Standard does not define validates anyway. ([#285])
  - Schemas: **ethdebug/format/materials/encoding**,
    **ethdebug/format/materials/source**,
    **ethdebug/format/type/elementary/string**
  - Producers: required: an `encoding` value must be a label that the Standard
    defines (a new **must** in the description); no validator catches this. The
    canonical lowercase name (`utf-16le`, not `utf-16`) is only preferred.
  - Consumers: optional: a consumer may pass the value straight to
    `new TextDecoder(label)`. No validator rejects a label from outside the
    Standard. An omitted field means `utf-8`, as it did before.

- A context may list the compiler transformations that produced an instruction —
  `inline`, `tailcall`, `fold`, `coalesce`, with an extensible identifier set
  and repeats allowed. A transform annotates rather than replaces the semantic
  contexts, and composes flat beside them on one context object. The
  **ethdebug/format/program/context/function/invoke** page now describes how a
  debugger reconstructs activations from `invoke` and `return` contexts, and
  says that a compiler must emit the two as a bracket around a body. ([#216])
  - Schemas: **ethdebug/format/program/context/transform**,
    **ethdebug/format/program/context**,
    **ethdebug/format/program/context/function/invoke**
  - Producers: optional: the **ethdebug/format/program/context** schemas are new
    in 0.1.0-1. A producer that emits `invoke` and `return` **must** emit them
    as a bracket: `invoke` on the first instruction of a body, `return` on its
    last. `transform` is optional.
  - Consumers: optional: the schemas are new in 0.1.0-1. A consumer may ignore
    `transform`, or use it to reconstruct inlined and tail-call activations. It
    should keep an unfamiliar identifier as an opaque label.

- An optional `activation` string pairs an invocation with the return or revert
  that ends it. Distinct activations carry distinct values, unique within the
  program. ([#245])
  - Schemas: **ethdebug/format/program/context/function/invoke**,
    **ethdebug/format/program/context/function/return**,
    **ethdebug/format/program/context/function/revert**
  - Producers: optional: the **ethdebug/format/program/context/function**
    schemas are new in 0.1.0-1. A producer may put one `activation` string on an
    `invoke` and on the `return` or `revert` that ends it, distinct for each
    activation.
  - Consumers: optional: the schemas are new in 0.1.0-1. Where `activation` is
    present, a consumer that reads them may pair a call with its return or
    revert by that value instead of by strict nesting in trace order.

- Contexts mark the function-call lifecycle — an invocation of exactly one kind
  (`jump` for an internal call, `message` for an external message call, `create`
  for a contract creation), a successful return, or a revert — each carrying
  optional function identity (`identifier`, `declaration`, `type`).
  **ethdebug/format/type/specifier** names the "full type or `{ id }` reference"
  pattern that **ethdebug/format/type/wrapper** and context variables now share.
  The `context` description in **ethdebug/format/program/instruction** also
  gained a sentence that tied context pointers to the machine state at that
  instruction's trace step; [#281] later replaced it with the postcondition
  convention. ([#154])
  - Schemas: **ethdebug/format/program/context/function**,
    **ethdebug/format/program/context/function/invoke**,
    **ethdebug/format/program/context/function/return**,
    **ethdebug/format/program/context/function/revert**,
    **ethdebug/format/type/specifier**, **ethdebug/format/type/wrapper**,
    **ethdebug/format/program/context**,
    **ethdebug/format/program/context/variables**,
    **ethdebug/format/program/instruction**
  - Producers: optional: the **ethdebug/format/program/context/function**
    schemas and **ethdebug/format/type/specifier** are new in 0.1.0-1. An
    `invoke` gives exactly one of `jump`, `message` and `create`.
    **ethdebug/format/type/wrapper** accepts the same data as at 0.1.0-0.
  - Consumers: optional: the function contexts are new in 0.1.0-1; a consumer
    may read them to follow calls, returns and reverts.
    **ethdebug/format/type/wrapper** validates the same data as at 0.1.0-0.

- A context may carry a `name` label, now wired into the context dispatcher; it
  is most useful for telling `pick` alternatives apart. ([#179])
  - Schemas: **ethdebug/format/program/context/name**,
    **ethdebug/format/program/context**,
    **ethdebug/format/program/context/pick**
  - Producers: optional: **ethdebug/format/program/context/name** is new in
    0.1.0-1. A producer that emits contexts may put a `name` string on one, for
    example to tell `pick` alternatives apart.
  - Consumers: no change needed. The schema is new in 0.1.0-1; a consumer that
    reads it treats `name` as an opaque label with no format-imposed semantics.

- An array type may state a fixed element `count`; omitting it means the array
  is dynamically sized. ([#168])
  - Schemas: **ethdebug/format/type/complex/array**
  - Producers: required: for fixed-size arrays only. State `count`, because an
    array type without `count` now means a dynamic array ("When omitted, the
    array is dynamically sized"). `count` is not in `required`.
  - Consumers: required: read a missing `count` as a dynamic array and a present
    `count` as the fixed number of elements. The `count` description changed the
    meaning of an array type without `count`.

- A pointer may declare templates inline with a `templates`/`in` pair, and a
  template reference may remap the region names a template produces through
  `yields`; unmapped names pass through unchanged. ([#158])
  - Schemas: **ethdebug/format/pointer/collection/templates**,
    **ethdebug/format/pointer/collection/reference**,
    **ethdebug/format/pointer**, **ethdebug/format/pointer/collection**
  - Producers: optional: a producer may declare templates inline with
    `templates` and `in`, which makes a pointer self-contained, and may add
    `yields` to a template reference to reuse it without region-name collisions.
  - Consumers: required: a consumer that resolves pointers must support both
    forms, because a valid pointer can now contain them (a new `oneOf` branch
    for `templates` in **ethdebug/format/pointer/collection**; a new `yields`
    property). Templates in `templates` are available by name inside `in`.
    `yields` renames regions; unmapped names pass through unchanged.

- A `{ "$concat": [...] }` expression evaluates to the concatenation of its
  operands' bytes, preserving each operand's byte width; an empty operand list
  is permitted. ([#156])
  - Schemas: **ethdebug/format/pointer/expression**
  - Producers: optional: a producer may use `$concat` to build a byte sequence
    from several operands, for example a storage slot key or the input to a
    hash.
  - Consumers: required: a consumer that resolves pointers must support
    `$concat`, because a valid pointer can now contain it (a new `Concat` branch
    in the schema's `oneOf`). Operands join in list order and keep their byte
    widths; no padding is added or removed.

- A `pick` lists two or more alternative contexts of which one holds, a `gather`
  lists two or more contexts that all hold simultaneously, and `frame` names,
  as a bare string, the compilation frame a context's facts belong to — for
  example `"ir"` or `"source"`. ([#144])
  - Schemas: **ethdebug/format/program/context/pick**,
    **ethdebug/format/program/context/gather**,
    **ethdebug/format/program/context/frame**,
    **ethdebug/format/program/context**
  - Producers: optional: the **ethdebug/format/program/context** schemas are new
    in 0.1.0-1. A `pick` or `gather` list needs at least two members
    (`minItems: 2`). `gather` is needed only where two facts use the same key.
  - Consumers: optional: the schemas are new in 0.1.0-1. A consumer that reads
    them reads a `pick` as alternatives of which one is true, reads all members
    of a `gather` as true together, and may separate facts by `frame`.

- One schema covers a non-negative integer given either as a JSON number or as a
  `0x`-prefixed hex string; **ethdebug/format/materials/source-range** offsets
  and lengths, **ethdebug/format/pointer/expression** literals, and
  **ethdebug/format/program/instruction** offsets and operation arguments all
  reference it. ([#126])
  - Schemas: **ethdebug/format/data/value**,
    **ethdebug/format/materials/source-range**,
    **ethdebug/format/pointer/expression**,
    **ethdebug/format/program/instruction**
  - Producers: optional: **ethdebug/format/materials/source-range** `offset` and
    `length` may now be `0x`-prefixed hex strings. The new
    **ethdebug/format/program/instruction** takes either form.
  - Consumers: required: accept `0x`-prefixed hex strings as well as JSON
    numbers in **ethdebug/format/materials/source-range** `offset` and `length`
    (`type: number` at 0.1.0-0; now **ethdebug/format/data/value**).
    **ethdebug/format/program/instruction** is new in 0.1.0-1 and takes both
    forms too.

- A context may carry a human-readable `remark` string, intended primarily for
  humans to use as an annotation and not for compilers to use directly. ([#125])
  - Schemas: **ethdebug/format/program/context/remark**,
    **ethdebug/format/program/context**
  - Producers: optional: **ethdebug/format/program/context** is new in 0.1.0-1.
    A producer that emits a context may put a `remark` string on it; a context
    may hold only a `remark`.
  - Consumers: optional: the schema is new in 0.1.0-1. A consumer that reads it
    may display the `remark`. It is an annotation for humans and has no other
    meaning.

- A new **ethdebug/format/info** schema can represent all debugging information
  of one compilation as one standalone document that holds its `compilation`,
  its `programs`, and by-name lookup tables for `types` and `pointers`. A new
  **ethdebug/format/info/resources** schema holds only the lookup tables (and an
  optional `compilation`), for compilers that give the other data elsewhere in
  their output. The same change raised the compilation `id` uniqueness
  requirement from **should** to **must** (relaxed back to **should** by
  [#131]). ([#123])
  - Schemas: **ethdebug/format/info**, **ethdebug/format/info/resources**,
    **ethdebug/format/materials/compilation**
  - Producers: optional: **ethdebug/format/info** and
    **ethdebug/format/info/resources** are new in 0.1.0-1. A resources object
    gives `types` and `pointers` (`required`); an **ethdebug/format/info**
    document also gives `compilation` and `programs`. Compilation `id`
    uniqueness stays **should**.
  - Consumers: optional: the schemas are new in 0.1.0-1. A consumer that reads
    either form may look up types and pointer templates by name in `types` and
    `pointers`; how a reference resolves against them is not specified.

- A program describes one bytecode of a compilation — its `contract`, its
  `environment` (`call` or `create`), the `context` holding before its first
  instruction, and its `instructions`, each with an `offset`, an `operation`,
  and a `context` carrying source-range and variable facts. ([#113])
  - Schemas: **ethdebug/format/program**,
    **ethdebug/format/program/instruction**,
    **ethdebug/format/program/context**,
    **ethdebug/format/program/context/code**,
    **ethdebug/format/program/context/variables**,
    **ethdebug/format/program/context/name**
  - Producers: optional: **ethdebug/format/program** is new in 0.1.0-1. A
    producer that emits one per bytecode gives `contract`, `environment` and
    `instructions`, and an `offset` per instruction (`required`). For EOF
    bytecode, `offset` **must** count from the container start. A variable
    `type`, when given, **must** be a full type or an `{ id }` reference.
  - Consumers: no change needed. Every schema here is new in 0.1.0-1, and no
    schema from 0.1.0-0 references them. A consumer that reads a program finds
    each instruction by its `offset`.

- A pointer template is a pointer parameterised over the variables it lists in
  `expect`, and a `{ "template": ... }` collection instantiates one by name.
  ([#103])
  - Schemas: **ethdebug/format/pointer/template**,
    **ethdebug/format/pointer/collection/reference**,
    **ethdebug/format/pointer/collection**
  - Producers: optional: a producer may write a repeated pointer shape one time
    as a template and refer to it with a `template` collection. Definitions can
    go in **ethdebug/format/info/resources** `pointers` ([#123]) or an inline
    `templates` collection ([#158]).
  - Consumers: required: a consumer that resolves pointers must support the
    `template` collection (a new `oneOf` branch in
    **ethdebug/format/pointer/collection**): find the template by name and bind
    its `expect` variables from the scope at the reference.

- Two primitives cover a `0x`-prefixed hex string of at least one digit and a
  non-negative JSON integer. **ethdebug/format/materials/source-range** `offset`
  and `length`, **ethdebug/format/pointer/expression** literals, and
  **ethdebug/format/type/elementary/bytes** `size` reference them. This tightens
  source-range values from any number to a non-negative integer and makes the
  non-negative limit on integer literals effective. The `bits` and `places` of
  the elementary numeric types change from `type: number` to `type: integer`.
  ([#104])
  - Schemas: **ethdebug/format/data/hex**, **ethdebug/format/data/unsigned**,
    **ethdebug/format/materials/source-range**,
    **ethdebug/format/pointer/expression**,
    **ethdebug/format/type/elementary/bytes**,
    **ethdebug/format/type/elementary/int**,
    **ethdebug/format/type/elementary/uint**,
    **ethdebug/format/type/elementary/fixed**,
    **ethdebug/format/type/elementary/ufixed**
  - Producers: required: in **ethdebug/format/materials/source-range** `offset`
    and `length`, and in an expression's integer literal, a JSON number must be
    a non-negative integer (`type: integer`, `minimum: 0`). A bytes type `size`
    (`0` is now valid) and the `places` of `fixed` and `ufixed` must be
    integers; `bits` accepts the same values.
  - Consumers: no change needed. Every instance that stays valid keeps its
    meaning; the only newly valid value from this entry is a bytes type `size`
    of `0`.

### Changed

- An instruction's `context` is its **postcondition** — both its semantic
  facts and the pointers it contains resolve against the machine state after
  that instruction has executed. The program-level `context` is the base case of
  the chain: the precondition to instruction 0. ([#281])
  - Schemas: **ethdebug/format/program/instruction**,
    **ethdebug/format/program**
  - Producers: optional: **ethdebug/format/program** is new in 0.1.0-1. A
    producer that emits it gives each instruction a `context` that holds after
    the instruction; the program-level `context` holds before instruction 0.
  - Consumers: no change needed. The schema is new in 0.1.0-1; a consumer that
    reads it applies the context of instruction _i − 1_ at step _i_, and the
    program-level `context` before the first instruction.

- An object whose property set the format fully defines rejects unknown
  properties. **ethdebug/format/materials/compilation**'s `settings` object
  stays open, since it holds settings in a format native to the compiler, and
  **ethdebug/format/info/resources** stays lax when validated alone because
  **ethdebug/format/info** composes it by `$ref`. ([#280])
  - Schemas: **ethdebug/format/info**, **ethdebug/format/program**,
    **ethdebug/format/program/instruction**,
    **ethdebug/format/materials/compilation**,
    **ethdebug/format/materials/source**,
    **ethdebug/format/program/context/function/return**,
    **ethdebug/format/program/context/function/revert**,
    **ethdebug/format/pointer/collection/list**
  - Producers: required: remove unknown keys from
    **ethdebug/format/materials/compilation** (top level and `compiler`;
    `settings` stays open) and **ethdebug/format/materials/source**
    (`unevaluatedProperties: false`), and from `list` of a list collection
    (`additionalProperties: false`). The other five schemas are new in 0.1.0-1.
  - Consumers: no change needed. The change only narrows what producers can
    emit.

- An elementary type **must not** carry `contains`, which is what discriminates
  it from a complex type; a `function` complex type requires `kind` and
  `contains`; `contract`'s `library` and `interface` flags are booleans; a
  context `name` must be non-empty; and a region requires `location`. In a
  `function` complex type, the `parameters` wrapper and an external function's
  `contract` wrapper each also accept an `{ id }` type reference
  (**ethdebug/format/type/reference**) in place of an inline type, matching what
  `returns` already allowed. ([#279])
  - Schemas: **ethdebug/format/type/elementary**,
    **ethdebug/format/type/complex/function**,
    **ethdebug/format/type/elementary/contract**,
    **ethdebug/format/program/context/name**, **ethdebug/format/pointer/region**
  - Producers: required: these no longer validate: an elementary type with
    `contains` (`not`), a `function` type with no `contains` (`required`), and a
    non-boolean `library` or `interface` (`type: boolean`). A region with no
    `location` already failed. **ethdebug/format/program/context/name** is new
    in 0.1.0-1. The `{ id }` references are optional.
  - Consumers: required: a consumer that reads function types must accept an
    `{ id }` reference in the `contains.parameters` wrapper and in an external
    function's `contains.contract` wrapper (a new `oneOf` in each), and resolve
    it like any other type reference.

- Schema examples are corrected — a struct member's field is `name`, a `list`
  index is referenced bare rather than through `$read`, packed `uint128` members
  are 16 bytes and not 128 — and `additionalItems`, which JSON Schema 2020-12
  does not define, is dropped where it was inert.
  **ethdebug/format/pointer/collection/scope**'s `define` validates its keys by
  referencing **ethdebug/format/pointer/identifier** rather than an inline copy
  of that pattern. The **ethdebug/format/type/definition** description now
  states the rule that its `anyOf` enforces: at least one of `name` or
  `location`. ([#277])
  - Schemas: **ethdebug/format/type/base**, **ethdebug/format/type/definition**,
    **ethdebug/format/pointer/collection/list**,
    **ethdebug/format/pointer/collection/scope**,
    **ethdebug/format/info/resources**,
    **ethdebug/format/program/context/function/invoke**,
    **ethdebug/format/program**, **ethdebug/format/info**,
    **ethdebug/format/pointer/template**,
    **ethdebug/format/program/context/gather**,
    **ethdebug/format/program/context/pick**,
    **ethdebug/format/program/context/variables**
  - Producers: no change needed. No instance changes validity; the reworded
    **must** states what the `anyOf` already enforced.
  - Consumers: no change needed. The accepted shape of every valid instance is
    unchanged.

- A `name` is an optional identifier, meant to be unique within a program, that
  today acts only as a label — the format defines no way to reference a
  context by name, so a declared name is inert. Establishing the identifier is
  groundwork for a future name-based `pick` selection. ([#251])
  - Schemas: **ethdebug/format/program/context/name**
  - Producers: optional: **ethdebug/format/program/context/name** is new in
    0.1.0-1. A producer that emits it gives a `name` that is meant to be unique
    within a program; that is an intent, not a **must**.
  - Consumers: no change needed. The schema is new in 0.1.0-1; a consumer that
    reads it treats a `name` as a label, because the format defines no reference
    by name.

- The `target` field is optional on an internal (`jump`) invocation, for the
  cases with no meaningful target pointer — most notably the first instruction
  of an inlined body, whose JUMP has been elided. External calls still require
  it; a contract creation has no `target` field. ([#242])
  - Schemas: **ethdebug/format/program/context/function/invoke**
  - Producers: optional: **ethdebug/format/program/context/function/invoke** is
    new in 0.1.0-1. A producer that emits it may omit `target` on an internal
    (`jump`) invocation. An external (`message`) call requires `target`.
  - Consumers: no change needed. The schema is new in 0.1.0-1; a consumer that
    reads it accepts an internal (`jump`) invoke context that has no `target`.

- A function return context's `data` field is optional, so a bare `return: {}`
  is permitted where a return is known to happen but no return value is
  observable — a void function, or a tail-call-optimized back-edge. ([#211])
  - Schemas: **ethdebug/format/program/context/function/return**
  - Producers: optional: **ethdebug/format/program/context/function/return** is
    new in 0.1.0-1. A producer that emits it may omit `data` when no return
    value is observable: a void function or a tail-call-optimized back-edge.
  - Consumers: no change needed. The schema is new in 0.1.0-1; a consumer that
    reads it accepts a return context that has no `data`, down to a bare
    `return: {}`.

- An id identifies a compilation resource such as a source file or a
  compilation, and **must** be unique within the scope where it appears — source
  ids within one compilation, for instance. Before, only
  **ethdebug/format/materials/source** stated that requirement, and only for
  source ids; the value stays numeric-or-string, as it already was. ([#172])
  - Schemas: **ethdebug/format/materials/id**
  - Producers: required: do not reuse an id within one scope. A new **must** in
    the **ethdebug/format/materials/id** description imposes this; at 0.1.0-0
    only source ids had that **must**. No validator catches a collision.
  - Consumers: no change needed. A consumer may now rely on an id as a key
    within its scope.

- The array type schema carries a description of itself, of `contains`, and of
  each of its examples. ([#170])
  - Schemas: **ethdebug/format/type/complex/array**
  - Producers: no change needed. The change adds only descriptions and example
    comments.
  - Consumers: no change needed. The set of valid array types is unchanged.

- The context schema dispatches on each property with `if`/`then` clauses
  instead of an `anyOf` over the member schemas, so a general-purpose validator
  reports one error against the relevant member rather than a failure of the
  whole union. The rewrite is also what made an empty context (`{}`) validate,
  matching the relaxation [#145] had documented: every `anyOf` member required
  its own key, so an explicit `{}` still failed until here. ([#150])
  - Schemas: **ethdebug/format/program/context**
  - Producers: optional: **ethdebug/format/program/context** is new in 0.1.0-1.
    A producer that emits it may give an explicit `"context": {}`; the
    `if`/`then` clauses accept the empty object.
  - Consumers: no change needed. The schema is new in 0.1.0-1; a consumer that
    reads it accepts an explicit `"context": {}` as the empty context. The
    change in validator errors needs no action.

- An instruction's `context` is optional, and omitting it is equivalent to the
  empty context (`{}`). The program-level `context` was already optional and
  gains the same statement. The change removed `context` from an instruction's
  `required` and removed `minProperties: 1` from the context schema. An explicit
  `{}` still did not validate: the context schema's `anyOf` rejected it, because
  each of its members requires its own key, until [#150] replaced the union.
  ([#145])
  - Schemas: **ethdebug/format/program**,
    **ethdebug/format/program/instruction**, **ethdebug/format/program/context**
  - Producers: optional: **ethdebug/format/program/instruction** is new in
    0.1.0-1. A producer that emits it may omit `context` on an instruction that
    carries no facts; `context` is not in the `required` list.
  - Consumers: no change needed. The schemas are new in 0.1.0-1; a consumer that
    reads them treats a missing instruction `context` as the empty context
    (`{}`).

- A compilation's `id` is `required`. ([#138])
  - Schemas: **ethdebug/format/materials/compilation**
  - Producers: required: emit `id` on every compilation; `id` is now in the
    `required` list. At 0.1.0-0 the description called `id` optional.
  - Consumers: no change needed. A consumer may now rely on `id` as present in
    every valid compilation.

- A compilation's `id` is described as its identifier rather than as optional,
  and its uniqueness requirement returns to **should** after [#123] had raised
  it to **must**. The `required` list is not actually changed here; [#138] does
  that. ([#131])
  - Schemas: **ethdebug/format/materials/compilation**
  - Producers: no change needed. Uniqueness of `id` is **should** at 0.1.0-0 and
    at 0.1.0-1. The net change is that the `id` description no longer says
    "Optional"; [#138] adds `id` to `required`.
  - Consumers: no change needed. The uniqueness of `id` is **should** in both
    releases, so a consumer has no new case to handle.

- A variable object must carry at least one property, and must not carry
  properties the format does not define. ([#127])
  - Schemas: **ethdebug/format/program/context/variables**
  - Producers: optional: **ethdebug/format/program/context/variables** is new in
    0.1.0-1. A producer that emits it gives no empty variable object
    (`minProperties: 1`) and no extension keys (`unevaluatedProperties: false`).
  - Consumers: no change needed. The schema is new in 0.1.0-1, and the rule only
    narrows what producers can emit.

- The `range` field may be omitted as shorthand for a range spanning the entire
  source contents, and is otherwise required. ([#107])
  - Schemas: **ethdebug/format/materials/source-range**
  - Producers: optional: a source range that spans the entire source contents
    may omit `range`.
  - Consumers: required: treat a source range with no `range` as offset 0
    through the full length of the contents of the referenced source. `range` is
    no longer in the `required` list.

## 0.1.0-0 — 2024-07-04

First published version of the specification.

[#103]: https://github.com/ethdebug/format/pull/103
[#104]: https://github.com/ethdebug/format/pull/104
[#107]: https://github.com/ethdebug/format/pull/107
[#113]: https://github.com/ethdebug/format/pull/113
[#123]: https://github.com/ethdebug/format/pull/123
[#125]: https://github.com/ethdebug/format/pull/125
[#126]: https://github.com/ethdebug/format/pull/126
[#127]: https://github.com/ethdebug/format/pull/127
[#131]: https://github.com/ethdebug/format/pull/131
[#138]: https://github.com/ethdebug/format/pull/138
[#144]: https://github.com/ethdebug/format/pull/144
[#145]: https://github.com/ethdebug/format/pull/145
[#150]: https://github.com/ethdebug/format/pull/150
[#154]: https://github.com/ethdebug/format/pull/154
[#156]: https://github.com/ethdebug/format/pull/156
[#158]: https://github.com/ethdebug/format/pull/158
[#168]: https://github.com/ethdebug/format/pull/168
[#170]: https://github.com/ethdebug/format/pull/170
[#172]: https://github.com/ethdebug/format/pull/172
[#179]: https://github.com/ethdebug/format/pull/179
[#211]: https://github.com/ethdebug/format/pull/211
[#216]: https://github.com/ethdebug/format/pull/216
[#242]: https://github.com/ethdebug/format/pull/242
[#245]: https://github.com/ethdebug/format/pull/245
[#251]: https://github.com/ethdebug/format/pull/251
[#277]: https://github.com/ethdebug/format/pull/277
[#279]: https://github.com/ethdebug/format/pull/279
[#280]: https://github.com/ethdebug/format/pull/280
[#281]: https://github.com/ethdebug/format/pull/281
[#284]: https://github.com/ethdebug/format/pull/284
[#285]: https://github.com/ethdebug/format/pull/285
[#286]: https://github.com/ethdebug/format/pull/286
[#303]: https://github.com/ethdebug/format/pull/303
