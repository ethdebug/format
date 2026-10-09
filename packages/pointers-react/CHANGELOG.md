# Changelog

This file tracks changes to the `@ethdebug/pointers-react` npm
package, React components for visualizing `ethdebug/format` pointer
resolution. Changes to the specification itself are tracked in the
root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Changed

- The `react` and `react-dom` peer ranges now include React 19
  (`^18.0.0 || ^19.0.0`) ([#374]). The components' return types now
  read `React.JSX.Element`, which both React 18 and 19 types define;
  the global `JSX` they used before is gone in `@types/react` 19.

## 0.1.0-preview.2 — 2026-10-07

### Breaking

- Follows the `~` vocabulary of `@ethdebug/pointers` ([#323]).

## 0.1.0-preview.1 — 2026-10-03

Updated `@ethdebug/format` to `0.1.0-draft.1` and `@ethdebug/pointers` to
`0.1.0-preview.1`.

## 0.1.0-preview.0 — 2026-09-21

The version scheme changed: prerelease versions are now `preview.<n>`, and
`0.1.0-preview.0` follows `0.1.0-2`. No changes.

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
[#323]: https://github.com/ethdebug/format/pull/323
[#374]: https://github.com/ethdebug/format/pull/374
