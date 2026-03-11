import { compile } from "#compiler";
import { Executor } from "@ethdebug/evm";
import { bytesToHex } from "ethereum-cryptography/utils";

export interface ExecuteProgramOptions {
  calldata?: string;
  value?: bigint;
  optimizationLevel?: 0 | 1 | 2 | 3;
}

export interface ExecuteProgramResult {
  deployed: boolean;
  callSuccess?: boolean;
  returnValue: Uint8Array;
  getStorage: (slot: bigint) => Promise<bigint>;
  executor: Executor;
}

export async function executeProgram(
  source: string,
  options: ExecuteProgramOptions = {},
): Promise<ExecuteProgramResult> {
  const { calldata, value, optimizationLevel = 0 } = options;

  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level: optimizationLevel },
  });

  if (!result.success) {
    const errors = result.messages.error ?? [];
    const msgs = errors
      .map((e: { message?: string }) => e.message ?? String(e))
      .join("\n");
    throw new Error(`Compilation failed:\n${msgs}`);
  }

  const { bytecode } = result.value;
  const executor = new Executor();

  const hasCreate = bytecode.create && bytecode.create.length > 0;
  const createCode = hasCreate
    ? bytesToHex(bytecode.create!)
    : bytesToHex(bytecode.runtime);

  await executor.deploy(createCode);

  let callSuccess: boolean | undefined;
  let returnValue: Uint8Array = new Uint8Array();

  if (calldata !== undefined) {
    const execResult = await executor.execute({
      data: calldata,
      value,
    });
    callSuccess = execResult.success;
    returnValue = new Uint8Array(execResult.returnValue);
  }

  return {
    deployed: true,
    callSuccess,
    returnValue,
    getStorage: (slot: bigint) => executor.getStorage(slot),
    executor,
  };
}
