# @ethdebug/evm

EVM execution and state access for ethdebug/format.

Part of [ethdebug/format](https://github.com/ethdebug/format). See
the [documentation](https://ethdebug.github.io/format/).

## TypeScript

This package uses `package.json` `imports` for internal modules.
Consumers must use `moduleResolution` `node16`, `nodenext`, or
`bundler`. The legacy `node10` resolution is not supported.

## Usage

```typescript
import { Executor, createTrace, createMachineState } from "@ethdebug/evm";

const executor = new Executor({ chainId: 1n });
await executor.fund(alice, 10n ** 18n);
const { address } = await executor.deploy({ from: alice, create });

// Record one transaction, then read the state at any of its steps
const trace = createTrace({ memory: "changed" });
await executor.call(
  { from: alice, to: address!, input, block: { number: 1n } },
  trace,
);
const state = createMachineState(trace.stateAt(i));
```
