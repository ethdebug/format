# @ethdebug/common

_This NPM package contains runtime code that the **ethdebug/format** packages
share._

It provides `Raw`, a byte string (a `Uint8Array`) with functions to make,
read and resize one; the `Machine` interfaces, which model a running EVM for
a debugger to read; and `keccak256`. `@ethdebug/pointers`, `@ethdebug/evm`
and the React packages use it.

## TypeScript

This package uses `package.json` `imports` for internal modules.
Consumers must use `moduleResolution` `node16`, `nodenext`, or
`bundler`. The legacy `node10` resolution is not supported.
