import {
  createAddress,
  MockEthersProvider,
  MockEthersSigner,
  TestTransactionEvent,
} from "forta-agent-tools/lib/tests";
import {
  FindingType,
  FindingSeverity,
  Finding,
  HandleTransaction,
  createTransactionEvent,
} from "forta-agent";

import agent, {
  provideHandleTransaction,
  FACTORY_CONTRACT_ADDRESS,
} from "./agent";

jest.setTimeout(10000);

describe("Nethermind bot detect all swaps", () => {
  let handleTransaction: HandleTransaction;
  const mockProvider: MockEthersProvider = new MockEthersProvider();
  //const mockSigner: MockEthersSigner = new MockEthersProvider();

  beforeAll(() => {
    handleTransaction = agent.handleTransaction;
  });
  it("no finding if swap transaction didn't emit ", async () => {
    const poolAddress = "0x3ed96d54be53868edbc3ad5ccc4995710d187dc4";
    const addresses = { [poolAddress]: true };
    const mockTxEvent = createTransactionEvent(addresses as any);

    handleTransaction = provideHandleTransaction(
      FACTORY_CONTRACT_ADDRESS,
      mockProvider
    );

    const findings = await handleTransaction(mockTxEvent);

    expect(findings).toStrictEqual([]);
  });

  it("no finding if swap transaction emitted but not from uniswap ", async () => {
    const poolAddress = "0x2ed96d54be53868edbc3ad5ccc4995710d187dc4";
    const addresses = { [poolAddress]: true };
    const mockTxEvent = createTransactionEvent({ addresses } as any);

    const swapTxEvent = {
      args: {
        sender: "0x0000000000000000000000000000000000000000",
        recipient: "0x0000000000000000000000000000000000000000",
        amount0: 1,
        amount1: 2,
        sqrtPriceX96: 1,
        liquidity: 1000,
        tick: 11,
      },
      address: poolAddress,
    };

    mockTxEvent.filterLog = jest.fn().mockReturnValue([swapTxEvent]);

    handleTransaction = provideHandleTransaction(
      FACTORY_CONTRACT_ADDRESS,
      mockProvider
    );

    const findings = await handleTransaction(mockTxEvent);

    expect(findings).toStrictEqual([]);
  });

  it("returns a finding if any uniswap pool made a swapping transaction ", async () => {
    const poolAddress = "0x3ed96d54be53868edbc3ad5ccc4995710d187dc4";
    const addresses = { [poolAddress]: true };
    const mockTxEvent = createTransactionEvent({ addresses } as any);

    const swapTxEvent = {
      args: {
        sender: "0x0000000000000000000000000000000000000000",
        recipient: "0x0000000000000000000000000000000000000000",
        amount0: 1,
        amount1: 2,
        sqrtPriceX96: 1,
        liquidity: 1000,
        tick: 11,
      },
      address: poolAddress,
    };

    mockTxEvent.filterLog = jest.fn().mockReturnValue([swapTxEvent]);

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
