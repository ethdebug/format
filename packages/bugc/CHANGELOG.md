# Changelog

This file tracks changes to the `@ethdebug/bugc` npm package, the
BUG language compiler with `ethdebug/format` debug information
support. Changes to the specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- The `%` operator, with the precedence of `*` and `/`. It compiles to
  the EVM's unsigned `MOD`, so `x % 0` is `0`, as `x / 0` is ([#321]).
- Each instruction has a `variables` context that lists the local
  variables in scope (the innermost declaration of each name, which hides
  a storage variable of that name), with a type, and a pointer to the
  exact bytes that hold the value, in memory or on the stack, where the
  value is there. For a dynamic array, `string` or `bytes` local, the
  pointer reads the local's word and goes on to the length and the
  elements or data it refers to. At optimization levels 1 to 3, a local
  whose current value the optimizer folded to a constant or removed is
  listed without a pointer, and an inlined function's locals are listed
  in its inlined code ([#328]).

### Changed

- A cast now converts its value as Solidity does. A cast to a narrower
  integer type or to `address` keeps the low bits, and a cast to a signed
  type then sign-extends: `300 as uint8` is 44, `200 as int8` is -56, and
  `(-1 as int256) as uint8` is 255. A cast from a signed type to a wider
  type sign-extends. A cast to a narrower `bytesN` keeps the leading
  bytes, and a cast to a wider one pads with zero bytes at the end:
  `0x11223344 as bytes8` is `0x1122334400000000`. Before, a cast emitted
  no code, so the value kept all its bits. The optimizer folds a cast of
  a constant by the same rules ([#334]).
- A cast from dynamic `bytes` to an integer or `address` is now a type
  error, as in Solidity: cast to `bytesN` first, as in
  `msg.data[4:36] as bytes32 as uint256` ([#334]).

### Fixed

- A cast from dynamic `bytes` to a fixed-size type now reads the bytes.
  `msg.data[0:4] as bytes4` is the first four bytes of calldata; bytes
  past the slice's length are zero. Before, the cast gave the slice's
  memory address ([#334]).
- A slice of `msg.data` now copies from calldata. Before, it copied from
  memory ([#334]).
- Each expression in a chain of postfix operations (casts, calls, slices,
  members and indexes, as in `v as int8 as int256`) now has its own source
  location. Before, every one but the last had location 0:0, so their
  types overwrote each other ([#334]).
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
- The pointer for a storage struct with a struct or array member is now a
  valid **ethdebug/format/pointer**. Before, at optimization level 0, it
  gave that member's `group` or `list` a `name`, which only regions may
  have, so the program failed validation against
  **ethdebug/format/program**. Now each region inside such a member has a
  name qualified by the member's name, such as `ceo-salary` for
  `company.ceo.salary` ([#335]).
- A storage struct field past the struct's first slot is now read and
  written in its own slot. Before, at every optimization level, the
  compiler counted the field's slot offset twice over (once in slots,
  then again as if in bytes), so every such field used the struct's
  first slot ([#336]).
- Reading a storage struct field that shares its slot now reads the
  bytes the field was written to. Before, at every optimization level,
  writes counted a field's offset from the low-order end of the slot and
  reads counted it from the high-order end, so such a field read back
  as some other bytes of the slot, often 0 ([#336]).
- Programs compiled at optimization levels 1 to 3 now carry their storage
  variables in the program-level context, as at level 0. Before, the
  optimizer dropped that context ([#336]).
- The pointer for a storage value narrower than a slot now has the
  `offset` that **ethdebug/format/pointer** defines, counted from the most
  significant byte. Before, it gave the offset from the low-order end, so
  a debugger read the wrong bytes: for example, an `address` at the start
  of a slot read as the slot's high-order 20 bytes ([#336]).
- Reading a signed integer narrower than a word from storage now
  sign-extends it, so a struct field, variable or mapping value of type
  `int8` that holds `-56` reads as `-56`. Before, at every optimization
  level, a packed field read back as its unsigned bytes, such as `200`
  ([#337]).
- A write to a storage value narrower than a slot, whether a struct
  field or a variable such as `x: int8`, now writes only that value's
  bytes. Before, at every optimization level, a negative signed value
  such as `-2 as int16` filled every higher byte of the slot with `ff`,
  so the fields packed above it read back wrong, and `x = -56` stored a
  full word where Solidity stores one byte ([#337]).
- At optimization level 3, merging adjacent writes to one slot now masks
  each value to its width. Before, a negative signed value written next
  to other fields of a packed struct overwrote them ([#337]).
- At optimization level 3, merged writes to one slot that do not start
  at the slot's first byte now land at their fields' offsets. Before,
  each value was shifted by its field's offset twice, so writing `s.b`
  and `s.c` but not `s.a` put them in the wrong bytes ([#337]).
- At optimization level 3, two writes in a row to the same field of a
  packed struct now leave the second value. Before, read/write merging
  combined the two values with `or` ([#337]).
- A local initialized with a string literal (`let s = "hello";`) now
  holds the string. Before, it held an empty allocation, so `s.length`
  was `0` ([#328]).

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
[#328]: https://github.com/ethdebug/format/pull/328
[#330]: https://github.com/ethdebug/format/pull/330
[#332]: https://github.com/ethdebug/format/pull/332
[#333]: https://github.com/ethdebug/format/pull/333
[#334]: https://github.com/ethdebug/format/pull/334
[#335]: https://github.com/ethdebug/format/pull/335
[#336]: https://github.com/ethdebug/format/pull/336
[#337]: https://github.com/ethdebug/format/pull/337
