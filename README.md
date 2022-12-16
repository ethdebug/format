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

[^1]: See [Debugging data format -
  Wikipedia](https://en.wikipedia.org/wiki/Debugging_data_format)

[^2]: See [DWARF - Wikipedia](https://en.wikipedia.org/wiki/DWARF)

## Purpose of this repository

This repository serves as a home for the working group to design
a standard debugging data format for smart contracts on
Ethereum-compatible networks.
