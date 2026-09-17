# Changelog

This file tracks changes to the `@ethdebug/format` npm package (the schemas
distributed for programmatic use). Changes to the specification itself are
tracked in the root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

## 0.1.0-1 — 2026-09-16

### Added

- The entry point exports TypeScript types and guards for the spec's data model:
  the `Program`, `Pointer`, `Type`, `Materials` and `Data` namespaces, their
  `isProgram`, `isPointer`, `isType`, `isSource`, `isValue` and sibling guards,
  and the `mayHaveClass` and `hasKind` helpers. `0.1.0-0` exported only
  `describeSchema`, `referencesId`, `referencesYaml`, `schemas`, `schemaIds` and
  the `Schema` type. ([`59a5c38`])
- `Program.Context` covers the whole context vocabulary, each member with its
  own guard: `pick` ([`74c7d5f`]), `frame` ([`fc976ed`]), `gather`
  ([`e469502`]), the function-call contexts `invoke`, `return` and `revert`
  ([#154]), `name` ([#246]) and `transform` ([#216]).
- The function-call context types carry an optional `activation` identifier that
  correlates an invocation with its return or revert ([#245]), and treat
  `invoke.target` ([#242]) and `return.data` ([#211]) as optional.
- The guards use `Array.isArray` instead of `instanceof Array`, so arrays from
  another realm pass ([#231]). `Pointer.isIdentifier` matches the identifier
  schema's pattern, and `Type.Elementary.isContract` carries and validates the
  `library` and `interface` flags and rejects a type that sets both ([#276]).
- `describeSchema` accepts a schema id as a plain string, so
  `describeSchema({ schema: "schema:ethdebug/format/program" })` works where
  `0.1.0-0` required `{ schema: { id } }`. `referencesId` narrows a string as
  well as an `{ id }` object, and a `SchemaId` type is exported. ([`e523e09`],
  [`f87f678`])
- The tarball includes `LICENSE` and `README.md`, and the manifest gives a full
  `repository` entry with `directory: packages/format` ([#293]).

### Changed

- The bundled schemas are those of spec version `0.1.0-1`; see the root
  `CHANGELOG.md`. `schemaIds` grows from 47 ids to 72, adding the
  **ethdebug/format/program** family (including every `program/context/*` schema
  and **ethdebug/format/program/instruction**), **ethdebug/format/info** and
  **ethdebug/format/info/resources**, **ethdebug/format/data/value**,
  **ethdebug/format/data/unsigned**, **ethdebug/format/data/hex**,
  **ethdebug/format/type/specifier**, **ethdebug/format/materials/encoding**,
  **ethdebug/format/pointer/template** and the
  **ethdebug/format/pointer/collection/reference** and
  **ethdebug/format/pointer/collection/templates** schemas. No schema id was
  removed.
- `describeSchema` parses schema YAML with merge keys enabled, so the `<<:`
  anchor merges that the schemas use resolve into the returned `schema` and
  `rootSchema` objects instead of surviving as a literal `<<` property
  ([`0ef2f37`]).
- The `SchemaInfo` that `describeSchema` returns omits `pointer` entirely when
  no pointer was requested, where `0.1.0-0` always set the property, to
  `undefined` if need be ([`f87f678`]).
- The tarball no longer contains declaration maps (`*.d.ts.map`), so editors
  step into the shipped `.d.ts` files rather than the original sources ([#293]).
- Build and dependency housekeeping with no effect on the published API:
  Prettier and ESLint passes, the move to Vitest, TypeScript project references,
  `json-schema-typed` pinned to `8.0.1` and `yaml` raised to `^2.8.2` ([#293]).

### Breaking

- The package is an ES module: the manifest sets `"type": "module"` and `dist`
  holds `import`/`export` statements, where `0.1.0-0` shipped CommonJS with
  `require` calls. `require("@ethdebug/format")` now works only on Node versions
  that support `require(esm)` (Node 20.19 and later); on earlier Node, and in a
  CommonJS-only bundler pipeline, consumers have to switch to `import`.
  ([`a5a7d6c`])
- The shipped declarations import the package's own `#`-prefixed specifiers
  (`#describe`, `#schemas`, `#types`), so TypeScript resolves the types only
  under `moduleResolution` `node16`, `nodenext` or `bundler`. A project on the
  legacy `node10` resolution gets "Cannot find module '#describe'" and no
  exported members. ([`21e532e`], [#293])
- The manifest declares `engines: { node: ">=20" }`, which `0.1.0-0` did not
  ([#293]).
- The layout under `dist` changed, which breaks deep imports:
  `dist/src/schemas.js` is now `dist/src/schemas/index.js`, `dist/yamls.js` is
  now `dist/src/schemas/yamls.js` ([`10ab103`]), and the `dist/src/bundle.js`
  module with its `bundleSchemas` function is gone ([`59a5c38`]).

## 0.1.0-0 — 2024-07-04

First publication.

[#154]: https://github.com/ethdebug/format/pull/154
[#211]: https://github.com/ethdebug/format/pull/211
[#216]: https://github.com/ethdebug/format/pull/216
[#231]: https://github.com/ethdebug/format/pull/231
[#242]: https://github.com/ethdebug/format/pull/242
[#245]: https://github.com/ethdebug/format/pull/245
[#246]: https://github.com/ethdebug/format/pull/246
[#276]: https://github.com/ethdebug/format/pull/276
[#293]: https://github.com/ethdebug/format/pull/293
[`0ef2f37`]: https://github.com/ethdebug/format/commit/0ef2f37
[`10ab103`]: https://github.com/ethdebug/format/commit/10ab103
[`21e532e`]: https://github.com/ethdebug/format/commit/21e532e
[`59a5c38`]: https://github.com/ethdebug/format/commit/59a5c38
[`74c7d5f`]: https://github.com/ethdebug/format/commit/74c7d5f
[`a5a7d6c`]: https://github.com/ethdebug/format/commit/a5a7d6c
[`e469502`]: https://github.com/ethdebug/format/commit/e469502
[`e523e09`]: https://github.com/ethdebug/format/commit/e523e09
[`f87f678`]: https://github.com/ethdebug/format/commit/f87f678
[`fc976ed`]: https://github.com/ethdebug/format/commit/fc976ed
