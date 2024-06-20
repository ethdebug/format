import type { EthereumProvider } from "ganache";

import { Data } from "../src/data.js";

export interface DeployContractResult {
  transactionHash: Data;
  contractAddress: Data;
}

export async function deployContract(
  createBytecode: Data,
  provider: EthereumProvider
): Promise<DeployContractResult> {

  const [account] = await provider.request({
    method: "eth_accounts",
    params: []
  });

  const transactionHash = Data.fromHex(await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      gas: "0x989680",
      data: createBytecode.toHex()
    }]
  }));

  const contractAddress = Data.fromHex((await provider.request({
    method: "eth_getTransactionReceipt",
    params: [transactionHash.toHex()]
  })).contractAddress);

  return {
    transactionHash,
    contractAddress
  };
}
