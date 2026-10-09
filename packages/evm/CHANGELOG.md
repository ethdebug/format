# Changelog

This file tracks changes to the `@ethdebug/evm` npm package (EVM
execution and state access for `ethdebug/format`). Changes to the
specification itself are tracked in the root
[`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- Transactions from any account: `deploy({ from, create, value })`
  returns the new contract's address, `call({ from, to, input, value })`
  calls any address, and `fund(address, balance)` sets an account's
  balance. `getStorage`, `setStorage` and `getCode` take an optional
  address ([#375]).
- A `block` option for each call (number, timestamp, prevrandao,
  coinbase, base fee, blob base fee, gas limit), and a `chainId`
  executor option, so contracts read these values. `BLOCKHASH` of one of
  the 256 previous blocks is keccak256 of its number ([#375]).
- `createTrace({ memory })` records one transaction: pass it to `call`,
  `deploy` or `execute`. `trace.stateAt(index)` gives the complete state
  at a step (stack, memory, storage, transient storage, calldata, return
  data, code), with storage written in frames that later reverted undone
  from the revert on. `trace.frames` lists the message frames. The
  `memory` option records a copy at every step (`"full"`, the default),
  a new copy only when memory changed (`"changed"`), or none (`"none"`,
  and then `stateAt` gives no memory) ([#375]).
- Message frame events: a `frame` handler gets an `enter` and an `exit`
  event for each call or create, with its depth, addresses, caller,
  calldata, value, return data, whether it reverted, and its first and
  last step indexes ([#375]).
- A trace's step state carries its position (`at`), so
  `createMachineState(trace.stateAt(i))` has the step's pc, opcode and
  index ([#375]).
- `executor.currentState()` gives the executor's state now, as a step
  state ([#375]).
- `endTransaction()` clears transient storage, the warm address and
  slot sets and the slots' original values. `deploy(options)` and `call`
  end their transaction; `execute` does not ([#375]).

### Changed

- **Breaking:** a `TraceStep` is the event only: `pc`, `opcode`, `op`
  (the opcode byte), `gasRemaining`, `gasCost`, `depth`, `address` and
  `codeAddress`. Its stack and memory moved to `Trace.stateAt` ([#375]).
- **Breaking:** `createMachineState(state, { pc, opcode, traceIndex })`
  takes a complete step state (from `Trace.stateAt` or
  `Executor.currentState`) instead of an executor, and never reads the
  executor's current state for a past step ([#375]).
- **Breaking:** `createTraceCollector` is removed; use `createTrace`
  ([#375]).
- A step handler gets the step's index as its second argument ([#375]).
- The package no longer uses Node's `Buffer`, so it runs in browsers
  without a polyfill ([#375]).

### Fixed

- A run that throws (as BASEFEE does without a block) no longer leaves
  the executor's state checkpoints open ([#375]).

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
[#375]: https://github.com/ethdebug/format/pull/375
