import type { EthereumProvider } from "ganache";

import { Data } from "../src/data.js";

export async function deployContract(
  createBytecode: Data,
  provider: EthereumProvider
): Promise<{
  transactionHash: Data;
  contractAddress: Data;
}> {
  // just use the first unlocked account
  const [account] = await provider.request({
    method: "eth_accounts",
    params: []
  });

  // issue a transaction that will be mined immediately
  const transactionHash = Data.fromHex(await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      gas: "0x989680",
      data: createBytecode.toHex()
    }]
  }));

  // read the receipt and extract the deployed contract address
  const contractAddress = Data.fromHex((await provider.request({
    method: "eth_getTransactionReceipt",
    params: [transactionHash.toHex()]
  })).contractAddress);

  return {
    transactionHash,
    contractAddress
  };
}
