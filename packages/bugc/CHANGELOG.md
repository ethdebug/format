# Changelog

This file tracks changes to the `@ethdebug/bugc` npm package, the
BUG language compiler with `ethdebug/format` debug information
support. Changes to the specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- The `%` operator, with the precedence of `*` and `/`. It compiles to
  the EVM's unsigned `MOD`, so `x % 0` is `0`, as `x / 0` is ([#321]).

### Fixed

- At optimization level 3, block merging now renames the incoming block of
  every phi that named a merged block. Before, a `for` loop that carries a
  local across iterations (and so any loop that calls an internal function
  to update one) compiled to bytecode that reverted ([#320]).
- A local now keeps its value on a path that does not assign it. Before,
  at any optimization level, a local assigned in one branch of an `if` (or
  before a `break`) could read as 0 after a path that skipped that branch.
  At levels 2 and 3, a local assigned in an `if` arm that holds another
  `if` or calls an internal function could read as 0 even on the path that
  assigned it ([#327]).
- A `for` or `while` loop inside the scope of a local that shadows another
  now carries the inner local. Before, at any optimization level, the loop
  started each iteration from the outer local's value ([#330]).
- The phis on a jump now copy their values in parallel. Before, at any
  optimization level, a loop that swaps two locals gave both the same
  value, since one phi's copy overwrote the value another phi read ([#330]).
- A cast, hash or length result now compiles when it is a call argument
  or is live across a block boundary. Before, at any optimization level,
  such a value got no home in memory, and code generation failed with
  "Cannot load value" ([#332]).
- `msg.data.length` now reads the calldata size. Before, it was 0 at
  every optimization level, because the code looked for "msg_data" in the
  name of a temp such as `t1` ([#333]).

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
[#321]: https://github.com/ethdebug/format/pull/321
[#327]: https://github.com/ethdebug/format/pull/327
[#330]: https://github.com/ethdebug/format/pull/330
[#332]: https://github.com/ethdebug/format/pull/332
[#333]: https://github.com/ethdebug/format/pull/333
