import * as util from "util";
import { Data } from "../src/data.js";
import solc from "solc";

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

// just compile and get something that can go into transaction data
export async function compileCreateBytecode({
  sources,
  target
}: CompileOptions): Promise<Data> {
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
    throw new Error(util.inspect(errors));
  }

  const {
    evm: {
      bytecode: createBytecode
    }
  } = output.contracts[target.path][target.contractName];

  return Data.fromHex(`0x${createBytecode.object}`);
}
