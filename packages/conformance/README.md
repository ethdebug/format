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

Static validation uses both the package's TypeScript type guards and the
published JSON-Schemas. The schemas are normative; the type guards remain as an
extra compatibility signal for TypeScript consumers. Negative fixtures are kept
alongside positive fixtures to prove the validator rejects malformed artifacts.

The second layer checks real debugger consumers: tests can run a debugger,
parse its output, and assert resources, source steps, frames, or values. SolDB
is the first consumer backend, but the runner is not tied to SolDB. The SolDB
adapter can materialize compiler output as a SolDB-compatible debug directory
and then drive `soldb info resources` over it. The optional Foundry adapter
starts a local `anvil --steps-tracing` node, deploys a compiled contract with
`cast`, sends a transaction, and scripts SolDB's interactive REPL to assert
source-line breakpoint set/hit behavior.

Consumer adapters are black-box by default so the same harness can test CLIs,
libraries, or services. The current SolDB adapter shells out to the CLI because
that is the stable public integration point; a future SolDB library adapter can
be added without changing the compiler conformance layer.

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

## Expected failures

When the format and a tool disagree, the tests do not wait for the tool. This
applies whichever side moved: a format change that a tool does not follow yet,
or a tool that does not follow the format. Each such divergence, per tool, goes
through these steps:

1. Open one tracking issue on ethdebug/format. It says what the tool does and
   where in the tool's code.
2. Add a shim and a tripwire to the test. The shim makes the test pass now. The
   tripwire fails once the tool conforms, and its message names the shim and
   the issue. When the format change causes the divergence, the shim lands in
   the same PR as the format change, so main stays green.
3. When the tripwire fires, one PR removes the shim and the tripwire and closes
   the issue.

Prefer a shim in the test to a pinned tool version.
