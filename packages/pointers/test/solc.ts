import { Data } from "../src/data.js";
import type * as Solc from "solc";

let solc: typeof Solc | undefined;
try {
  solc = (await import("solc")).default;
} catch {}

/**
 * Organizes the sources being compiled by their path identifier, as well
 * as includes information about which contract's bytecode is desired
 */
export interface CompileOptions {
  sources: {
    [path: string]: {
      content: string
    }
  };

  target: {
    path: string;
    contractName: string;
  };
}

/**
 * Compile a collection of sources and return the create (deployment) bytecode
 * for a particular target contract
 */
export async function compileCreateBytecode({
  sources,
  target
}: CompileOptions): Promise<Data> {
  if (!solc) {
    throw new Error("Unable to load solc");
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      outputSelection: {
        "*": {
          "*": ["ir", "*"],
          "": ["*"]
        }
      },
      viaIR: true,
      optimizer: {
        enabled: true
      }
    }
  };

  const output = JSON.parse(
    solc.compile(
      JSON.stringify(input),
    )
  );

  const { errors = [] } = output;
  if (errors.length > 0) {
    throw new Error(`Compilation error: ${JSON.stringify(errors, undefined, 2)}`);
  }

  const {
    evm: {
      bytecode: createBytecode
    }
  } = output.contracts[target.path][target.contractName];

  return Data.fromHex(`0x${createBytecode.object}`);
}

/**
 * "Syntactic sugar"-like helper function to initialize CompileOptions for
 * compiling only a single source file.
 */
export function singleSourceCompilation(options: {
  path: string;
  contractName: string;
  content: string;
}): CompileOptions {
  const { path, contractName, content: contentWithoutHeader } = options;

  const spdxLicenseIdentifier = "// SPDX-License-Identifier: UNLICENSED";
  const pragma = "pragma solidity ^0.8.25;";
  const header = `${spdxLicenseIdentifier}\n${pragma}\n`;

  return {
    sources: {
      [path]: {
        content: `${header}\n${contentWithoutHeader}\n`
      }
    },

    target: {
      path,
      contractName
    }
  };
}
