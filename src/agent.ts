import {
  Finding,
  HandleTransaction,
  TransactionEvent,
  FindingSeverity,
  FindingType,
  ethers,
  getJsonRpcUrl,
} from "forta-agent";

import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import { abi as V3_FACTORY_ABI } from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";

export const SWAP_EVENT =
  "event Swap( address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick )";

export const FACTORY_CONTRACT_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";

interface SwapInfo {
  token0: string;
  token1: string;
  fee: string;
}
const poolCache: Record<string, SwapInfo> = {};

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
    ethers.utils.keccak256(bytecode),
  ];
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`;
  return ethers.utils.getAddress(
    `0x${ethers.utils.keccak256(sanitizedInputs).slice(-40)}`
  );
}
export const provideHandleTransaction = (
  FACTORY_CONTRACT_ADDRESS: string
): HandleTransaction => {
  const handleTransaction: HandleTransaction = async (
    txEvent: TransactionEvent
  ) => {
    const findings: Finding[] = [];

    // check for swap events
    const swapEvents = txEvent.filterLog(SWAP_EVENT);

    if (!swapEvents.length) return findings;
    const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());
    const factoryContract = new ethers.Contract(
      FACTORY_CONTRACT_ADDRESS,
      V3_FACTORY_ABI,
      provider
    );

    await Promise.all(
      swapEvents.map(async (swapEvent) => {
        const { address } = swapEvent;

        if (poolCache[address]) {
          findings.push(
            Finding.fromObject({
              name: "Uniswap detected a swap transaction",
              description: `Uniswap detected a swap transaction between ${poolCache[address].token0} and ${poolCache[address].token1}`,
              alertId: "SWAP-0",
              type: FindingType.Info,
              severity: FindingSeverity.Info,
              metadata: {
                token0: poolCache[address].token0,
                token1: poolCache[address].token1,
                fee: poolCache[address].fee,
              },
            })
          );
          return;
        }

        const poolContract = new ethers.Contract(
          address,
          IUniswapV3PoolABI,
          provider
        );
        // If its not a pool address all queries will throw exception
        try {
          const [token0, token1, fee] = await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
            poolContract.fee(),
          ]);
          const bytecode = await provider.getCode(address);
          const computedAddress = getCreate2Address(
            FACTORY_CONTRACT_ADDRESS,
            [token0, token1],
            fee,
            bytecode
          );

          if (computedAddress === address) {
            poolCache[address] = {
              token0,
              token1,
              fee: fee.toString(),
            };
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
          }
        } catch (error) {
          // Ignore
        }
      })
    );

    return findings;
  };
  return handleTransaction;
};

export default {
  handleTransaction: provideHandleTransaction(FACTORY_CONTRACT_ADDRESS),
};
