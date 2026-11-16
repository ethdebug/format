import type { EthereumProvider } from "ganache";

import { Raw } from "@ethdebug/common";

export async function deployContract(
  createBytecode: Raw,
  provider: EthereumProvider,
): Promise<{
  transactionHash: Raw;
  contractAddress: Raw;
}> {
  // just use the first unlocked account
  const [account] = await provider.request({
    method: "eth_accounts",
    params: [],
  });

  // issue a transaction that will be mined immediately
  const transactionHash = Raw.fromHex(
    await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          gas: "0x989680",
          data: Raw.toHex(createBytecode),
        },
      ],
    }),
  );

  // read the receipt and extract the deployed contract address
  const contractAddress = Raw.fromHex(
    (
      await provider.request({
        method: "eth_getTransactionReceipt",
        params: [Raw.toHex(transactionHash)],
      })
    ).contractAddress,
  );

  return {
    transactionHash,
    contractAddress,
  };
}
