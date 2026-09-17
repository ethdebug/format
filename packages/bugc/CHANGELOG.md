# Changelog

This file tracks changes to the `@ethdebug/bugc` npm package, the
BUG language compiler with `ethdebug/format` debug information
support. Changes to the specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

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
