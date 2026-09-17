# Changelog

This file tracks changes to the `@ethdebug/pointers-react` npm
package, React components for visualizing `ethdebug/format` pointer
resolution. Changes to the specification itself are tracked in the
root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

## 0.1.0-2 — 2026-09-17

### Added

- The published package includes this `CHANGELOG.md` ([#300]).

### Changed

- Fixed the documented CSS import paths in comments; the stylesheets
  ship under `dist/src/components/`, and `variables.css` must be
  imported first ([#298]).
- `yarn watch` now copies stylesheet changes into `dist/` on every
  edit instead of only at startup. Development-only, no effect on
  the published package ([#299]).

## 0.1.0-1 — 2026-09-16

First publication.

[#298]: https://github.com/ethdebug/format/pull/298
[#299]: https://github.com/ethdebug/format/pull/299
[#300]: https://github.com/ethdebug/format/pull/300
