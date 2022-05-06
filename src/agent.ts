import { abi } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import {
  Finding,
  HandleTransaction,
  TransactionEvent,
  FindingSeverity,
  FindingType,
  ethers,
  getEthersProvider,
} from "forta-agent";

import LRU from "lru-cache";

import { MockEthersProvider } from "forta-agent-tools/lib/mock.utils";
const provider = getEthersProvider();

export const SWAP_EVENT =
  "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick )";

export const FACTORY_CONTRACT_ADDRESS =
  "0x1f98431c8ad98523631ae4a59f267346ea31f984";

const BYTE_CODE_HASHED_POOL_CONTRACT =
  "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

interface SwapInfo {
  token0: string;
  token1: string;
  fee: string;
}

const poolCache: LRU<string, SwapInfo | null> = new LRU<
  string,
  SwapInfo | null
>({
  max: 10000,
});

function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  fee: number,
  bytecode: string
): string {
  const [token0, token1] =
    tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  const constructorArgumentsEncoded = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "uint24"],
    [token0, token1, fee]
  );
  const create2Inputs = [
    "0xff",
    factoryAddress,
    // salt
    ethers.utils.keccak256(constructorArgumentsEncoded),
    // init code. bytecode + constructor arguments
    bytecode,
  ];
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`;
  return ethers.utils.getAddress(
    `0x${ethers.utils.keccak256(sanitizedInputs).slice(-40)}`
  );
}
export const provideHandleTransaction = (
  FACTORY_CONTRACT_ADDRESS: string,
  provider: ethers.providers.JsonRpcProvider | MockEthersProvider
): HandleTransaction => {
  const handleTransaction: HandleTransaction = async (
    txEvent: TransactionEvent
  ) => {
    const findings: Finding[] = [];

    // check for swap events
    const swapEvents = txEvent.filterLog(SWAP_EVENT);

    if (!swapEvents.length) return findings;

    await Promise.all(
      swapEvents.map(async (swapEvent) => {
        const { address } = swapEvent;

        if (poolCache.has(address)) {
          const cachedPool = poolCache.get(address);
          if (!cachedPool) {
            return;
          }
          findings.push(
            Finding.fromObject({
              name: "Uniswap detected a swap transaction",
              description: `Uniswap detected a swap transaction between ${cachedPool.token0} and ${cachedPool.token1}`,
              alertId: "SWAP-0",
              type: FindingType.Info,
              severity: FindingSeverity.Info,
              metadata: {
                token0: cachedPool.token0,
                token1: cachedPool.token1,
                fee: cachedPool.fee,
              },
            })
          );
          return;
        }

        const poolContract = new ethers.Contract(
          address,
          abi,
          provider as any
        );
        // If its not a pool address all queries will throw exception
        try {
          const [token0, token1, fee] = await Promise.all([
            poolContract.token0({ blockTag: txEvent.blockNumber }),
            poolContract.token1({ blockTag: txEvent.blockNumber}),
            poolContract.fee({ blockTag: txEvent.blockNumber }),
          ]);

          const computedAddress = getCreate2Address(
            FACTORY_CONTRACT_ADDRESS,
            [token0, token1],
            fee,
            BYTE_CODE_HASHED_POOL_CONTRACT
          );

          if (computedAddress.toLowerCase() === address) {
            console.log({ provider });
            poolCache.set(address, {
              token0,
              token1,
              fee: fee.toString(),
            });
            findings.push(
              Finding.fromObject({
                name: "Uniswap detected a swap transaction",
                description: `Uniswap detected a swap transaction between ${token0} and ${token1}`,
                alertId: "SWAP-0",
                type: FindingType.Info,
                severity: FindingSeverity.Info,
                metadata: {
                  token0,
                  token1,
                  fee: fee.toString(),
                },
              })
            );
          } else {
            poolCache.set(address, null);
          }
        } catch (error) {
          //ignore
          poolCache.set(address, null);
          console.log({ error });
        }
      })
    );

    return findings;
  };
  return handleTransaction;
};

export default {
  handleTransaction: provideHandleTransaction(
    FACTORY_CONTRACT_ADDRESS,
    provider
  ),
};
