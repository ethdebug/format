#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * BUG compiler CLI
 */

import { handleCompileCommand } from "#cli";

// Parse command line arguments
const args = process.argv.slice(2);

// Show help if no arguments or help flag
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  showHelp();
  process.exit(0);
}

// Run the compiler
handleCompileCommand(process.argv);

function showHelp(): void {
  console.log(`bugc - The BUG language compiler

Usage: bugc [options] <file.bug>

Options:
  -s, --stop-after <phase>  Stop compilation after phase (ast, ir, bytecode, debug)
                           Default: bytecode
  -O, --optimize <level>    Set optimization level (0-3)
                           Default: 0
  -f, --format <format>     Output format (text, json)
                           Default: text
  -o, --output <file>       Write output to file instead of stdout
  -p, --pretty             Pretty-print JSON output
  -d, --disassembly        Show bytecode disassembly
  --validate               Validate output (IR or debug info)
  --stats                  Show IR statistics
  --show-both              Show both unoptimized and optimized IR
  -h, --help               Show this help message

Examples:
  bugc program.bug                          # Compile to bytecode
  bugc -s ast program.bug                   # Show AST only
  bugc -s ir -O 2 program.bug               # Show optimized IR
  bugc -s bytecode -d program.bug           # Show bytecode with disassembly
  bugc -s debug -o debug.json program.bug   # Generate debug info

Phase descriptions:
  ast       Parse source and output abstract syntax tree
  ir        Compile to intermediate representation
  bytecode  Compile to EVM bytecode (default)
  debug     Generate ethdebug/format debug information`);
}
