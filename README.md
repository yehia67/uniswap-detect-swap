# Uniswap Detect Swap


## Description

Agent to detect UniSwap swap transactions

## Supported Chains

- Ethereum

## Alerts

- SWAP-0
  - Fired when a uniswap pool swap a transaction
  - Severity is always set to "Info"
  - Type is always set to "Info"
  - Metadata "token0" and "token1" the swapped tokens and the transaction "fees"

## Test Data

The agent behavior can be verified with the following transactions:

- 0x59ba57e31ba219bfaf04ad43c433c89d6b5a5352302b376e720527aea9214348 
- 0xc9b7b63dad4de1c360bf8d937e25aadb6a5b47dbb090ee8c9b21b238ba19dac4