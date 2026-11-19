# Changelog

This file tracks changes to the `@ethdebug/common` npm package, the runtime
code that the `ethdebug/format` packages share. Changes to the specification
itself are tracked in the root [`CHANGELOG.md`](../../CHANGELOG.md).

## Unreleased

### Added

- First release. `Raw` is a byte string (a `Uint8Array`) with functions to
  make, read and resize one (`Raw.fromHex`, `Raw.toHex`, `Raw.asUint`,
  `Raw.resizeTo`, `Raw.concat`, and so on). It replaces the `Data` class from
  `@ethdebug/pointers`.
- The `Machine` interfaces, which describe the EVM state that a debugger reads
  (stack, memory, storage, calldata, returndata, transient storage and code).
  Every read gives a `Raw`. They used to live in `@ethdebug/pointers`.
- `keccak256(raw)`, the Keccak-256 hash of a `Raw`.
