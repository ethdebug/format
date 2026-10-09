# Changelog

This file tracks changes to the `@ethdebug/programs-react` npm
package, React components for visualizing `ethdebug/format` program
annotations. Changes to the specification itself are tracked in the
root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Changed

- The `react` and `react-dom` peer ranges now include React 19
  (`^18.0.0 || ^19.0.0`) ([#374]). The components' return types now
  read `React.JSX.Element`, which both React 18 and 19 types define;
  the global `JSX` they used before is gone in `@types/react` 19.
- The `shiki` dependency range now includes version 3
  (`^2.5.0 || ^3.0.0`) ([#374]). The package no longer depends on
  `@shikijs/langs` and `@shikijs/themes`, which could resolve to a
  different major than `shiki`. It loads its grammars and theme through
  `shiki/langs` and `shiki/themes` instead.

## 0.1.0-preview.2 — 2026-10-07

### Changed

- `buildCallStack` now pops a frame on the step that observes its
  `return` (or `revert`) context's postcondition: the step after the
  instruction that carries it. Before, it popped the frame one step
  later. With a `return` on the callee's exit `JUMP`, the frame is gone
  at the first step back in the caller. An instruction that carries
  both an `invoke` and a `return`, such as a one-instruction inlined
  body, now shows no frame at any step ([#349]).

### Fixed

- `extractVariablesFromInstruction` now reads every `variables` list in a
  context: its own and those of each context in its `gather`. Before, a
  context with its own `variables` hid those in its `gather`, so at
  bugc's inlined code the storage variables disappeared. Of a `pick`,
  only one of whose contexts holds, it now lists only the variables that
  all of its contexts list alike (the same identifier, declaration and
  pointer), without a type they differ on; before, it took the first
  context with variables. Entries
  for one variable (the same identifier and declaration, in the same
  `frame`) compose into one; an entry without a declaration stays apart
  ([#342]).

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
  ship under `dist/src/components/` ([#298]).
- `yarn watch` now copies stylesheet changes into `dist/` on every
  edit instead of only at startup. Development-only, no effect on
  the published package ([#299]).

## 0.1.0-1 — 2026-09-16

First publication.

[#298]: https://github.com/ethdebug/format/pull/298
[#299]: https://github.com/ethdebug/format/pull/299
[#300]: https://github.com/ethdebug/format/pull/300
[#323]: https://github.com/ethdebug/format/pull/323
[#342]: https://github.com/ethdebug/format/pull/342
[#349]: https://github.com/ethdebug/format/pull/349
[#374]: https://github.com/ethdebug/format/pull/374
