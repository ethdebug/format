# @ethdebug/conformance

Reusable ETHDebug conformance infrastructure.

This package is intentionally language- and consumer-neutral. Compiler adapters
produce ETHDebug artifacts; consumer adapters exercise debugger implementations
against those artifacts.

Current adapters:

- `bugc`: in-process BUG compiler adapter.
- `solc`: external `solc --standard-json` adapter.
- `soldb`: external SolDB CLI adapter.

The first layer checks the contract that every compiler should satisfy:

- emitted programs are valid `ethdebug/format/program` objects,
- resources and compilations are valid when present,
- source references used by programs resolve to compilation sources.

The second layer is Dexter-like consumer conformance: tests can run a debugger
consumer, parse its output, and assert resources, source steps, frames, or
values. SolDB is the first consumer backend, but the runner is not tied to
SolDB. The SolDB adapter can materialize compiler output as a SolDB-compatible
debug directory and then drive `soldb info resources` over it. The optional
Foundry adapter starts a local `anvil --steps-tracing` node, deploys a compiled
contract with `cast`, sends a transaction, and scripts SolDB's interactive REPL
to assert source-line breakpoint set/hit behavior.

External adapters are opt-in in tests:

```console
ETHDEBUG_CONFORMANCE_SOLC=/path/to/solc yarn test
ETHDEBUG_CONFORMANCE_SOLDB=/path/to/soldb yarn test
ETHDEBUG_CONFORMANCE_ANVIL=/path/to/anvil ETHDEBUG_CONFORMANCE_CAST=/path/to/cast yarn test
```

To run the full Solidity -> SolDB resources path, set `ETHDEBUG_CONFORMANCE_SOLC`
and `ETHDEBUG_CONFORMANCE_SOLDB`. If `anvil` and `cast` are on `PATH`, the
SolDB breakpoint test runs as well; the executable paths can be overridden with
`ETHDEBUG_CONFORMANCE_ANVIL` and `ETHDEBUG_CONFORMANCE_CAST`.
