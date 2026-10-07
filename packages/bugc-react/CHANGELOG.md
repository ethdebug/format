# Changelog

This file tracks changes to the `@ethdebug/bugc-react` npm package,
React components for visualizing BUG compiler output. Changes to the
specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- The CFG view shows a `block.prevrandao` read as `block.prevrandao`
  ([#363]).
- The IR view shows bugc's new `copy` instruction ([#359]).

### Changed

- The IR and CFG views show each operand of a `hash` instruction, which
  now has a list of `values` ([#365]).

## 0.1.0-preview.1 — 2026-10-03

Updated `@ethdebug/bugc` to `0.1.0-preview.1`.

## 0.1.0-preview.0 — 2026-09-21

The version scheme changed: prerelease versions are now `preview.<n>`, and
`0.1.0-preview.0` follows `0.1.0-2`. No changes.

## 0.1.0-2 — 2026-09-17

### Added

- The published package includes this `CHANGELOG.md` ([#300]).

### Changed

- `yarn watch` now copies stylesheet changes into `dist/` on every
  edit instead of only at startup. Development-only, no effect on
  the published package ([#299]).

## 0.1.0-1 — 2026-09-16

First publication.

[#299]: https://github.com/ethdebug/format/pull/299
[#300]: https://github.com/ethdebug/format/pull/300
[#359]: https://github.com/ethdebug/format/pull/359
[#363]: https://github.com/ethdebug/format/pull/363
[#365]: https://github.com/ethdebug/format/pull/365
