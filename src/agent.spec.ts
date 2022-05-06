import { abi } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import {
  createAddress,
  MockEthersProvider,
  TestTransactionEvent,
} from "forta-agent-tools/lib/tests";

import {
  FindingType,
  FindingSeverity,
  Finding,
  HandleTransaction,
  ethers,
} from "forta-agent";

import agent, {
  provideHandleTransaction,
  FACTORY_CONTRACT_ADDRESS,
  SWAP_EVENT,
  BYTE_CODE_HASHED_POOL_CONTRACT,
  getCreate2Address,
} from "./agent";

jest.setTimeout(10000);

describe("Nethermind bot detect all swaps", () => {
  let handleTransaction: HandleTransaction;
  const mockProvider: MockEthersProvider = new MockEthersProvider();

  beforeAll(() => {
    handleTransaction = agent.handleTransaction;
  });

  beforeEach(() => mockProvider.clear());
  it("returns a finding if any uniswap pool made a swapping transaction using create2Address", async () => {
    const factoryAddress = createAddress("0xfff");
    const block = 14717599;
    const t0 = createAddress("0x0");
    const t1 = createAddress("0x1");
    const fee = 2500;

    const poolAddress = getCreate2Address(
      factoryAddress,
      [t0, t1],
      fee,
      BYTE_CODE_HASHED_POOL_CONTRACT
    );

    const abiInterface = new ethers.utils.Interface(abi);

    mockProvider.addCallTo(poolAddress, block, abiInterface, "token0", {
      inputs: [],
      outputs: [t0],
    });
    mockProvider.addCallTo(poolAddress, block, abiInterface, "token1", {
      inputs: [],
      outputs: [t1],
    });
    mockProvider.addCallTo(poolAddress, block, abiInterface, "fee", {
      inputs: [],
      outputs: [fee],
    });

    const swapEventInterface = new ethers.utils.Interface([
      SWAP_EVENT,
    ]).getEvent("Swap");

    const mockTxEvent = new TestTransactionEvent()
      .setBlock(block)
      .addInterfaceEventLog(swapEventInterface, poolAddress, [
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("2"),
        1,
        1000,
        11,
      ]);

    handleTransaction = provideHandleTransaction(factoryAddress, mockProvider);

    const findings = await handleTransaction(mockTxEvent);

    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: "Uniswap detected a swap transaction",
        description: `Uniswap detected a swap transaction between ${t0} and ${t1}`,
        alertId: "SWAP-0",
        type: FindingType.Info,
        severity: FindingSeverity.Info,
        metadata: {
          token0: t0.toLowerCase(),
          token1: t1,
          fee: fee.toString(),
        },
      }),
    ]);
  });

  it("returns a finding if any uniswap pool made a swapping transaction with correct hard-coded addresses", async () => {
    const poolAddress = "0x3ed96d54be53868edbc3ad5ccc4995710d187dc4";
    const block = 14717599;
    const t0 = "0x4d224452801ACEd8B2F0aebE155379bb5D594381";
    const t1 = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const fee = 3000;
    const abiInterface = new ethers.utils.Interface(abi);

    mockProvider.addCallTo(poolAddress, block, abiInterface, "token0", {
      inputs: [],
      outputs: [t0],
    });
    mockProvider.addCallTo(poolAddress, block, abiInterface, "token1", {
      inputs: [],
      outputs: [t1],
    });
    mockProvider.addCallTo(poolAddress, block, abiInterface, "fee", {
      inputs: [],
      outputs: [fee],
    });

    const swapEventInterface = new ethers.utils.Interface([
      SWAP_EVENT,
    ]).getEvent("Swap");

    const mockTxEvent = new TestTransactionEvent()
      .setBlock(block)
      .addInterfaceEventLog(swapEventInterface, poolAddress, [
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("2"),
        1,
        1000,
        11,
      ]);

    handleTransaction = provideHandleTransaction(
      FACTORY_CONTRACT_ADDRESS,
      mockProvider
    );
    const findings = await handleTransaction(mockTxEvent);

    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: "Uniswap detected a swap transaction",
        description: `Uniswap detected a swap transaction between 0x4d224452801ACEd8B2F0aebE155379bb5D594381 and 0xdAC17F958D2ee523a2206206994597C13D831ec7`,
        alertId: "SWAP-0",
        type: FindingType.Info,
        severity: FindingSeverity.Info,
        metadata: {
          token0: "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
          token1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
          fee: "3000",
        },
      }),
    ]);
  });
});
