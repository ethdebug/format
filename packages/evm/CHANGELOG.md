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
  address.
- A `block` option for each call (number, timestamp, prevrandao,
  coinbase, base fee, gas limit), and a `chainId` executor option, so
  contracts read these values.
- Trace steps carry `depth`, `address`, `codeAddress` and `gasCost`. A
  `memory` trace option chooses whether steps record memory: `"none"`,
  `"full"` (a copy at every step, the default) or `"changed"` (a new copy
  only when memory changed; other steps share the previous copy).
- Message frame events: a `frame` trace handler gets an `enter` and an
  `exit` event for each call or create, with its depth, addresses,
  caller, calldata, value, return data and whether it reverted.
- `createMachineState` takes a `state` option: storage, transient
  storage, calldata, return data and code at the trace step, read
  instead of the executor's current state.
- `endTransaction()` clears transient storage and the warm address and
  slot sets. `deploy(options)` and `call` end their transaction;
  `execute` does not.

### Changed

- The package no longer uses Node's `Buffer`, so it runs in browsers
  without a polyfill.

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
