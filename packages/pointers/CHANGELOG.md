# Changelog

This file tracks changes to the `@ethdebug/pointers` npm package, the reference
implementation of `ethdebug/format` pointers. Changes to the specification
itself are tracked in the root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Changed

- `dereference` resolves a region whose segment `offset` carries past the end of
  a slot and whose `length` spans the slots that follow, instead of reading
  within the starting slot only ([#284]).
- A pointer that passes a bare integer to `$concat` or `$keccak256` now throws,
  naming the operand, where it used to hash the wrong preimage: a literal took
  its minimal byte width, so a bare slot number hashed as fewer than 32 bytes.
  Word-size the operand with `$wordsized` or a `$sizedN` form. ([#286])

## 0.1.0-1 — 2026-09-16

### Added

- `dereference` resolves pointer templates. `DereferenceOptions` takes a
  `templates` map, and the dereferencer handles a template reference collection
  (`{ template, yields }`) and an inline `{ templates }` collection, reporting
  an unknown template name or a missing expected variable as a thrown error.
  ([`29df1e1`], [`1a8a752`], [`4e9d0ac`])
- A template reference's `yields` mapping renames the regions the template
  produces, so `Cursor.Regions.named` and `Cursor.Regions.lookup` find them
  under the caller's names ([`1a8a752`]).
- Expression evaluation supports the `$concat` operator, concatenating its
  operands' bytes ([`3866cec`]).
- The tarball includes `LICENSE`, the manifest gives a full `repository` entry
  with `directory: packages/pointers`, and the `README.md` states the supported
  TypeScript resolution modes ([#293]).

### Changed

- `@ethdebug/format` is a runtime dependency (`^0.1.0-1`), where `0.1.0-0`
  listed it only as a devDependency. The shipped `evaluate` and dereference
  modules import the `Pointer` guards from it, so the package no longer installs
  usefully on its own. ([#293])
- `Data` registers its custom inspect hook with
  `Symbol.for("nodejs.util.inspect.custom")` rather than a top-level
  `await import("util")`, so the module loads in environments without top-level
  await and without Node's `util` ([`0697233`]).
- The tarball holds only `dist`, the manifest, `README.md` and `LICENSE`.
  `0.1.0-0` also shipped the TypeScript sources under `src`, every test and
  integration test (compiled and as source), the `test` helpers,
  `bin/run-example.ts`, `tsconfig.json`, `typings.d.ts`, `jest.config.cjs` and
  the declaration maps. ([#293])
- Build and dependency housekeeping with no effect on the published API:
  Prettier and ESLint passes, the move from Jest to Vitest, TypeScript project
  references, type-only imports, and upgrades to `ethereum-cryptography`
  `^2.2.1` and the dev toolchain ([#293]).

### Breaking

- `Pointer` and `isPointer` are no longer exported. The entry point now exports
  `dereference`, `Data`, and the `DereferenceOptions`, `Cursor` and `Machine`
  types only; the pointer type and its guard live in `@ethdebug/format`.
  ([`59a5c38`])
- The shipped declarations import the package's own `#`-prefixed specifiers
  (`#cursor`, `#data`, `#dereference`, `#machine`), so TypeScript resolves the
  types only under `moduleResolution` `node16`, `nodenext` or `bundler`. A
  project on the legacy `node10` resolution gets "Cannot find module
  '#dereference'" and no exported members. ([`21e532e`], [#293])
- The manifest declares `engines: { node: ">=20" }`, which `0.1.0-0` did not
  ([#293]).
- Deep imports into the shipped tree break: `dist/src/pointer.js`,
  `dist/src/test-cases.js`, `dist/bin/run-example.js` and everything under
  `dist/test` are gone ([`59a5c38`], [#293]).

## 0.1.0-0 — 2024-07-04

First publication.

[#284]: https://github.com/ethdebug/format/pull/284
[#286]: https://github.com/ethdebug/format/pull/286
[#293]: https://github.com/ethdebug/format/pull/293
[`0697233`]: https://github.com/ethdebug/format/commit/0697233
[`1a8a752`]: https://github.com/ethdebug/format/commit/1a8a752
[`21e532e`]: https://github.com/ethdebug/format/commit/21e532e
[`29df1e1`]: https://github.com/ethdebug/format/commit/29df1e1
[`3866cec`]: https://github.com/ethdebug/format/commit/3866cec
[`4e9d0ac`]: https://github.com/ethdebug/format/commit/4e9d0ac
[`59a5c38`]: https://github.com/ethdebug/format/commit/59a5c38
