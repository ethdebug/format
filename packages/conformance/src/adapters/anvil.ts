import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export interface AnvilOptions {
  executable?: string;
  host?: string;
  port?: number;
  stepsTracing?: boolean;
  silent?: boolean;
}

export interface AnvilInstance {
  rpcUrl: string;
  stop(): Promise<void>;
}

export interface CastOptions {
  executable?: string;
  privateKey?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  contractAddress?: string | null;
}

async function freePort(host: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address() as AddressInfo;
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function rpcRequest(rpcUrl: string, method: string): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: [],
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { error?: unknown; result?: unknown };
  if (body.error) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

async function waitForRpc(
  child: ChildProcess,
  rpcUrl: string,
  stderr: () => string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() < deadline) {
    if (spawnError) {
      throw spawnError;
    }
    if (child.exitCode !== null) {
      throw new Error(
        `anvil exited before accepting RPC requests\n${stderr()}`,
      );
    }

    try {
      await rpcRequest(rpcUrl, "eth_chainId");
      return;
    } catch {
      await delay(100);
    }
  }

  throw new Error(`timed out waiting for anvil at ${rpcUrl}\n${stderr()}`);
}

export async function startAnvil(
  options: AnvilOptions = {},
): Promise<AnvilInstance> {
  const executable =
    options.executable ?? process.env.ETHDEBUG_CONFORMANCE_ANVIL ?? "anvil";
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? (await freePort(host));
  const rpcUrl = `http://${host}:${port}`;
  const args = ["--host", host, "--port", String(port)];

  if (options.stepsTracing ?? true) {
    args.push("--steps-tracing");
  }
  if (options.silent ?? true) {
    args.push("--silent");
  }

  const child = spawn(executable, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });

  await waitForRpc(child, rpcUrl, () => stderr);

  return {
    rpcUrl,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill("SIGTERM");
      const close = once(child, "close");
      const timeout = delay(2_000).then(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      });
      await Promise.race([close, timeout]);
    },
  };
}

async function runCast(
  args: string[],
  options: CastOptions = {},
): Promise<TransactionReceipt> {
  const executable =
    options.executable ?? process.env.ETHDEBUG_CONFORMANCE_CAST ?? "cast";

  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `cast ${args.join(" ")} failed with exit code ${exitCode}\n${stderr}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout) as TransactionReceipt);
      } catch (error) {
        reject(
          new Error(
            `cast output was not valid JSON: ${
              error instanceof Error ? error.message : String(error)
            }\n${stdout}`,
          ),
        );
      }
    });
  });
}

export async function deployBytecode(
  anvil: AnvilInstance,
  bytecode: string,
  options: CastOptions = {},
): Promise<TransactionReceipt> {
  const receipt = await runCast(
    [
      "send",
      "--rpc-url",
      anvil.rpcUrl,
      "--private-key",
      options.privateKey ?? DEFAULT_PRIVATE_KEY,
      "--create",
      bytecode,
      "--json",
    ],
    options,
  );

  if (!receipt.transactionHash || !receipt.contractAddress) {
    throw new Error(`cast deploy did not return a contract address`);
  }
  return receipt;
}

export async function sendContractTransaction(
  anvil: AnvilInstance,
  contractAddress: string,
  signature: string,
  args: string[],
  options: CastOptions = {},
): Promise<TransactionReceipt> {
  const receipt = await runCast(
    [
      "send",
      contractAddress,
      signature,
      ...args,
      "--rpc-url",
      anvil.rpcUrl,
      "--private-key",
      options.privateKey ?? DEFAULT_PRIVATE_KEY,
      "--json",
    ],
    options,
  );

  if (!receipt.transactionHash) {
    throw new Error(`cast send did not return a transaction hash`);
  }
  return receipt;
}
