# CoW Trade Simulation

This repository contains a proof of concept of how `eth_call` with state overrides can be used for trade simulations.

## Motivation

Simulating trades in single order settlements can help detect unsupported tokens, as well as catch unatainable price estimates.
This project contains a set of contracts and a demonstration of how these contracts can be used in an `eth_call` with state overrides to simulate trades.

## Contracts

### `Trader`

The `Trader` contract is used to impersonate an EOA trader.
Using a state override to specify code for an EOA, we can pretend that to chain multiple transactions on behalf of the account, and even apply some logic based on on-chain state.
This is similar to setting up a fork and applying these transactions one at a time.
The upside to the `eth_call` with state overrides is that it is supported by most nodes (Geth and Erigon for example) and notably external node providers such as Infura.

The `Trader` contracts provides two entry points:
- **`trade`**: this is used for simulating a direct trade on behalf of the EOA:
    1. mint some "phony token" if specified (see description of `PhonyERC20` below)
    2. approve the required spender
    3. execute the trade
    4. return recorded gas usage and balance changes.
- **`settle`**: this is used for simulating a trade within a CoW protocol settlement:
    1. mint some "phony token" if specified
    2. approve the CoW protocol vault relayer
    3. execute the trade as part of a settlement (specifically, we create an EIP-1271 order, and have the `Trader` validate all signatures)
    4. return recorded gas usage and balance changes for both the trader and settlement contract.

### `PhonyERC20`

The `PhonyERC20` contract implements an ERC20-specific proxy contract, with additional logic to be able to mint and transfer.
This allows us to "replace" real token implementations in a way where we can mint balances for EOAs when we don't have one with an acceptable balance.
Using the phony token contract isn't perfect.
Specifically, we don't exercise the logic for transferring tokens from the trader to the settlement contract, and from the settlement contract to wherever it needs to go for the on-chain trade.
However, it does allow us to exercise the actual trading path, which is a huge step in the right direction for simulating trades.

### `AnyoneAuthenticator`

This is just a solver authenticator for the CoW protocol's settlement contract that allows any address to solve.
This allows the trader to call the settlement contract directly without requiring additional state overrides to pretend that a configured solver executed the settlement.
