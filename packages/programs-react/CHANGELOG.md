# Changelog

This file tracks changes to the `@ethdebug/programs-react` npm
package, React components for visualizing `ethdebug/format` program
annotations. Changes to the specification itself are tracked in the
root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- `specification` in the trace state: `undefined` when the program has
  no `ethdebug` identification, otherwise the program's version, the
  version this package supports, and a verdict of `"ok"`, `"newer"` or
  `"unsupported"`. The Docusaurus trace viewer shows a notice in place
  of the trace when the verdict is `"unsupported"` ([#305]).

## 0.1.0-preview.0 — 2026-09-21

The version scheme changed: prerelease versions are now `preview.<n>`, and
`0.1.0-preview.0` follows `0.1.0-2`. No changes.

## 0.1.0-2 — 2026-09-17

### Added

- The published package includes this `CHANGELOG.md` ([#300]).

### Changed

- Fixed the documented CSS import paths in comments; the stylesheets
  ship under `dist/src/components/` ([#298]).
- `yarn watch` now copies stylesheet changes into `dist/` on every
  edit instead of only at startup. Development-only, no effect on
  the published package ([#299]).

## 0.1.0-1 — 2026-09-16

First publication.

[#298]: https://github.com/ethdebug/format/pull/298
[#299]: https://github.com/ethdebug/format/pull/299
[#300]: https://github.com/ethdebug/format/pull/300
[#305]: https://github.com/ethdebug/format/pull/305
