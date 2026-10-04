# Changelog

This file tracks changes to the `@ethdebug/bugc` npm package, the
BUG language compiler with `ethdebug/format` debug information
support. Changes to the specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Fixed

- At optimization level 3, block merging now renames the incoming block of
  every phi that named a merged block. Before, a `for` loop that carries a
  local across iterations (and so any loop that calls an internal function
  to update one) compiled to bytecode that reverted ([#320]).

## 0.1.0-preview.1 — 2026-10-03

### Changed

- Every program `bugc` emits carries a stamp in its `ethdebug` field,
  naming **ethdebug/format/program** and the specification version
  ([#305]).

## 0.1.0-preview.0 — 2026-09-21

The version scheme changed: prerelease versions are now `preview.<n>`, and
`0.1.0-preview.0` follows `0.1.0-2`. No changes.

## 0.1.0-2 — 2026-09-17

### Added

- The published package includes this `CHANGELOG.md` ([#300]).

### Changed

- The pointer expressions that compute a mapping or array-element slot
  now word-size their `$keccak256` operand, as the two-sorted
  expression semantics require. Emitted debug information does not
  change: nothing reaches that code path yet ([#286]).
- Normalized the `bin` path in `package.json` to the form npm
  expects, silencing an auto-correction warning at publish time
  ([#298]).

## 0.1.0-1 — 2026-09-16

First publication.

[#286]: https://github.com/ethdebug/format/pull/286
[#298]: https://github.com/ethdebug/format/pull/298
[#300]: https://github.com/ethdebug/format/pull/300
[#305]: https://github.com/ethdebug/format/pull/305
[#320]: https://github.com/ethdebug/format/pull/320
