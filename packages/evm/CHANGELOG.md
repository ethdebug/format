# Changelog

This file tracks changes to the `@ethdebug/evm` npm package (EVM
execution and state access for `ethdebug/format`). Changes to the
specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

## 0.1.0-preview.2 — 2026-10-07

Updated `@ethdebug/pointers` to `0.1.0-preview.2`.

## 0.1.0-preview.1 — 2026-10-03

### Fixed

- The executor now runs with the Prague hardfork instead of Shanghai, so
  bytecode from current `solc` (which uses `MCOPY`, `TLOAD` and `TSTORE`)
  executes ([#314]).

## 0.1.0-preview.0 — 2026-09-21

The version scheme changed: prerelease versions are now `preview.<n>`, and
`0.1.0-preview.0` follows `0.1.0-2`. No changes.

## 0.1.0-2 — 2026-09-17

### Added

- The published package includes this `CHANGELOG.md` ([#300]).

### Changed

- Updated `@ethdebug/pointers` to `0.1.0-2`.

## 0.1.0-1 — 2026-09-16

First publication.

[#300]: https://github.com/ethdebug/format/pull/300
[#314]: https://github.com/ethdebug/format/pull/314
