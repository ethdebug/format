# ethdebug format

_Because debugging on Ethereum is hard._

## Problem statement

Smart contracts offer the fundamental promise that code execution is verifiably
transparent. Not only is this necessary to ensure network liveness,
but this ability to _directly observe_ the step-by-step operation of the
Ethereum Virtual Machine (EVM) affords a foundation for public trust amongst
software developers, auditors, and end-users at large.

Unfortunately, direct observation of the EVM fails to connect
low-level system behavior with any code authors' original framework of
meaning. Humans usually write programs in high-level languages that they must
compile to a form the machine can execute. It is
_extremely impractical_ to reason about the machine-code that compilers
output and the system behavior that results upon executing this code.

Traditional computing platforms have largely solved this problem through the
design, standardization, and use of **debugging data formats**[^1], which allow
compilers a mechanism to specify precisely how to translate a program as the
machine runs it into a program as the human wrote it. Several such formats
exist in use today, most notably DWARF[^2], and these allow ubiquitous
software integration between compilers, editors, and debuggers. Sadly, no existing
format suffices to cover the intrinsic differences present in smart contract
programming, let alone cover some of the architectural decisions that
high-level languages have made in response to the EVM's constraints.

Although it's straightforward to observe and replay the EVM directly,
understanding the EVM and the smart contracts running on it remains within the
domain of experts. Without a mechanism for machine-to-human translation,
smart contract software quality comes at a higher cost, and any promise of
trust risks erosion.

## Purpose of this repository

This repository serves as a home for the **ethdebug/format** working group to
design a standard debugging data format for smart contracts on
Ethereum-compatible networks.

## Contents

This repository contains a
[`schemas/`](https://github.com/ethdebug/format/tree/main/schemas) directory
with the formal JSON Schemas defined by this project (in YAML format).

This repository also contains the source materials for the following NPM packages:
- **@ethdebug/format** in
  [`packages/format/`](https://github.com/ethdebug/format/tree/main/packages/format)
  distributes the formal schemas for use in TypeScript
  or JavaScript projects, along with corresponding
  type predicate functions[^3] to help maintain type-safety when reading
  objects in these schemas.

- **@ethdebug/pointers** in
  [`packages/pointers/`](https://github.com/ethdebug/format/tree/main/packages/pointers)
  provides a functional reference implementation for dereferencing
  [ethdebug/format/pointer](https://ethdebug.github.io/format/spec/pointer/overview)
  objects against running raw EVM machine state.

  For more about this reference implementation, please see accompanying
  [Dereferencing pointers](https://ethdebug.github.io/format/docs/implementation-guides/pointers/)
  implementation guide on this project's homepage.

- **@ethdebug/format-web** _(unpublished package)_ in
  [`packages/web/`](https://github.com/ethdebug/format/tree/main/packages/web)
  contains the materials for
  the Docusaurus site powering
  [this project's homepage](https://ethdebug.github.io/format).

## Developing locally

To build and run the site locally, please ensure you have Node.js
(LTS or better) and `yarn` installed globally.

First, clone this repo and install the Node.js dependencies:
```console
git clone https://github.com/ethdebug/format.git
cd format
yarn
```

Then, run this command to start a watcher process which rebuilds and reloads
on any changes. This will open your browser to `http://localhost:3000/format`:

```console
yarn start
```

[^1]: See [Debugging data format -
  Wikipedia](https://en.wikipedia.org/wiki/Debugging_data_format)

[^2]: See [DWARF - Wikipedia](https://en.wikipedia.org/wiki/DWARF)

[^3]: See [Using type predicates](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
  section from TypeScript's Narrowing documentation.
