# Changelog

This file tracks changes to the `@ethdebug/bugc` npm package, the
BUG language compiler with `ethdebug/format` debug information
support. Changes to the specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- The `%` operator, with the precedence of `*` and `/`. It compiles to
  the EVM's `MOD` (`SMOD` for signed operands), so `x % 0` is `0`, as
  `x / 0` is ([#321]).
- Each instruction has a `variables` context that lists the local
  variables in scope (the innermost declaration of each name, which hides
  a storage variable of that name), with a type, and a pointer to the
  exact bytes that hold the value, in memory or on the stack, where the
  value is there. For a dynamic array, `string` or `bytes` local, the
  pointer reads the local's word and goes on to the length and the
  elements or data it refers to. At optimization levels 1 to 3, a local
  whose current value the optimizer folded to a constant or removed is
  listed without a pointer, and an inlined function's locals are listed
  in its inlined code, with the storage variables, in one flat
  `variables` list: from the instruction that invokes it up to the one
  that returns from it, which lists the caller's variables ([#328],
  [#341]).

### Changed

- An integer literal operand of an arithmetic or comparison operator now
  takes the type of the other operand when its value fits, so with
  `x: int8`, `x < 0`, `x == 1` and `-1 < x` compare as `int8`. A literal
  that type cannot hold, such as `x < 128`, is a type error. Before,
  every integer literal was a `uint256`, so `x == 1` was a type error
  while `x < 1` compiled ([#339]).
- Arithmetic and comparison operators now reject operands of mixed
  signedness, as Solidity does: cast one operand to the other's type.
  Before, a comparison such as `u > x`, with `u: uint256` and `x: int8`,
  compiled ([#339]).
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
- An index out of bounds now reverts with Solidity's `Panic(0x32)`, as
  in Solidity: `a[i]` on an array or `bytes` in memory, or on a
  fixed-size array in storage, reverts unless `i` is less than the
  length, for reads and writes, at each level of a nested array. A slice
  `b[s:e]` reverts unless `s <= e <= b.length`, so `msg.data[0:4]`
  reverts on shorter calldata. The `REVERT` has a `revert` context with
  the panic code. Before, an index past the end read or wrote the memory
  that follows, such as the next inner array's length word. A dynamic
  array in storage is not checked ([#344]).
- An array or bytes index and a slice bound must now be an unsigned
  integer, as in Solidity; cast a signed one, as in `a[i as uint256]`.
  Before, a signed index compiled ([#344]).
- A function's `return` context is now on its exit: the `JUMP` back to
  the caller, as the format's documentation describes. Its `data`
  pointer (stack slot 0) is there when the function returns a value. The
  caller's continuation `JUMPDEST` keeps only the call site's `code`
  range. Before, the `return` was on that `JUMPDEST`, one instruction
  later, so a debugger showed the function's frame for two steps after
  control was back in the caller ([#349]).
- A function with a return type must now return on every path through
  its body, as in Rust: a body that can end without a `return` is a type
  error (`TYPE015`, "Missing return"). An `if` returns on every path only
  when it has an `else` and both branches do; a loop never does, so a
  function whose `return` is only inside a loop needs one after it.
  Before, such a function compiled, and the compiler ended it with a
  `return` that gave no value ([#352]).

### Fixed

- At optimization levels 2 and 3, an inlined body's control flow now has
  a `transform: ["inline"]` context: the branch of an `if`, the jumps
  between the body's blocks, each block's `JUMPDEST`, and the jump that
  carries the body's `return`. Before, only the body's other instructions
  had it, so a debugger that reads the transform closed the inlined frame
  at the body's first branch ([#356]).
- The block that bugc puts on a branch edge into a block with phis now
  has the branch's context: its source range, its variables (the storage
  variables too) and its transforms. Before, it had no context, so a
  debugger listed no variables while it ran ([#356]).
- The `invoke` context on a caller's `JUMP` into a function now has the
  call's `arguments`, as the callee's entry `JUMPDEST` does: the `JUMP`
  leaves them on the stack, and the `JUMPDEST` does not change it.
  Before, only the `JUMPDEST`'s `invoke` had them, so a debugger that
  opens the frame on the step after the `JUMP` showed it for one step
  without its arguments ([#354]).
- A call to a function with no return type now compiles as a statement,
  as in `bump();`, at every optimization level. The function's `return`
  context has no `data`. Before, IR generation failed with "Cannot convert
  type with kind fail to IR type" ([#351]).
- At optimization levels 2 and 3, an inlined function that starts with an
  inlined call, or returns one's result, now has its own `invoke` and
  `return` contexts, around the inner call's. Before, its `invoke` (or its
  `return`) was lost, so the call stack did not balance ([#341]).
- At optimization levels 2 and 3, the jump that leaves an inlined body
  for the caller's code no longer has a `transform: ["inline"]` context.
  It runs after the inlined function's `return`, so it is not part of the
  inlined body. Before, a debugger that reads the transform put that jump
  in an inlined body that had already returned, with no function or call
  site to name ([#347]).
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
- Comparisons (`<`, `<=`, `>`, `>=`) of signed integers are now signed.
  Before, at every optimization level, they compiled to the EVM's
  unsigned `LT` and `GT`, so a negative value compared greater than any
  positive one: `(-56 as int8) < (0 as int8)` was false. The optimizer
  folds constant comparisons by the same rule ([#339]).
- `/` and `%` on signed integers now compile to the EVM's `SDIV` and
  `SMOD`, so division truncates toward zero and a remainder has the sign
  of the dividend, as in Solidity. Before, at every optimization level,
  they were unsigned, so `(-7 as int8) / (2 as int8)` was a large
  positive number. Arithmetic does not check for overflow, so the least
  `int256` divided by `-1` is itself. The optimizer folds constants by
  the same rules ([#339]).
- A write to a mapping value or array element narrower than a slot now
  writes only that value's bytes. Before, at every optimization level,
  `m[5] = -2 as int16` with `m: mapping<uint256, int16>` stored a full
  word of `ff` bytes ending in `fffe`, where Solidity stores `fffe`.
  bugc gives each array element its own slot, without Solidity's
  packing, so only a mapping value's layout matches Solidity's ([#339]).
- Arithmetic (`+`, `-`, `*`, `/`, and unary `-`) on an integer type
  narrower than 256 bits now wraps to the type's width, as in a Solidity
  `unchecked { }` block: an unsigned result keeps its low bits, and a
  signed result sign-extends. Before, at every optimization level, a
  result could be out of its type's range: `(255 as uint8) + (1 as uint8)`
  was 256, and `(127 as int8) + (1 as int8)` was 128. The optimizer folds
  constants by the same rule, and now wraps 256-bit results at the word,
  where it failed to compile a constant result outside it ([#340]).
- At optimization levels 2 and 3, common subexpression elimination now
  renames the operands of an offset computation, a cast and an
  allocation. Before, when it dropped a repeated computation (such as the
  address of a local array's elements, which `a[0] + a[2]` computes
  twice), the instruction that used it still named the dropped result,
  and code generation failed with "Cannot load value" ([#343]).
- Reading an element of an array that is itself an array element, as in
  `m[i][j]`, now skips the inner array's length word. Before, at every
  optimization level, it read the element before, so `m[i][0]` read the
  length of `m[i]` ([#343]).
- A write to an element of a memory array now compiles: `a[i] = x` for a
  local or a parameter, `m[i][j] = x` for a nested array, and
  `names[i] = "x"` for an array of strings. Before, at every optimization
  level, code generation failed with error EVM999 ("Internal code
  generation error"), because the compiler emitted the element's address
  computation without its kind. That computation also left out the
  length word, so the write would have gone to the element before ([#343]).
- Indexing `bytes` in memory, as in `b[i]` and `b[i] = x`, now reads and
  writes the byte at `i`. Before, at every optimization level, a read
  skipped no length word and read a whole word, so it gave the length's
  bytes; a write failed with error EVM999, as an array element write did
  ([#343]).
- `.length` of an array literal, as in `[1, 2, 3].length`, is now the
  number of elements. Before, at every optimization level, it was 32
  ([#344]).
- A local initialized with a `bytes` literal
  (`let data: bytes = 0x0001…;`) now holds the literal's bytes. Before, at
  every optimization level, its data was the memory address of a copy of
  the literal, so its debug pointer read zeros and then that address
  ([#345]).

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
[#339]: https://github.com/ethdebug/format/pull/339
[#340]: https://github.com/ethdebug/format/pull/340
[#341]: https://github.com/ethdebug/format/pull/341
[#343]: https://github.com/ethdebug/format/pull/343
[#344]: https://github.com/ethdebug/format/pull/344
[#345]: https://github.com/ethdebug/format/pull/345
[#347]: https://github.com/ethdebug/format/pull/347
[#349]: https://github.com/ethdebug/format/pull/349
[#351]: https://github.com/ethdebug/format/pull/351
[#352]: https://github.com/ethdebug/format/pull/352
[#354]: https://github.com/ethdebug/format/pull/354
[#356]: https://github.com/ethdebug/format/pull/356
