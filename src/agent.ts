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

    const { addresses } = txEvent;

    for (const address of Object.keys(addresses)) {
      // if its the user wallet, skip
      const code = await provider.getCode(address);
      if (code === "0x") {
        continue;
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

        // If this address is a Uniswap Pool then it shall be available on getPool() query
        const poolAddress = await factoryContract.getPool(token0, token1, fee);

        if (poolAddress.length > 0) {
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
                fee,
              },
            })
          );
        }
      } catch (error) {
        //ignore
      }
    }

    return findings;
  };
  return handleTransaction;
};

export default {
  handleTransaction: provideHandleTransaction(FACTORY_CONTRACT_ADDRESS),
};
