// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import { IMintableERC20, IERC20 } from "./interfaces/IERC20.sol";
import { Interaction, Trade, SETTLEMENT } from "./interfaces/ISettlement.sol";
import { Caller } from "./libraries/Caller.sol";
import { SafeERC20 } from "./libraries/SafeERC20.sol";

contract Trader {
    using Caller for *;
    using SafeERC20 for *;

    function trade(
        IERC20 tokenIn,
        IERC20 tokenOut,
        Interaction[][2] calldata interactions,
        uint256 mint
    ) external returns (
        uint256 gasUsed,
        int256 balanceIn,
        int256 balanceOut
    ) {
        if (mint != 0) {
            IMintableERC20(address(tokenIn)).mint(address(this), mint);
        }
        interactions[0].executeMany();

        balanceIn = -int256(tokenIn.balanceOf(address(this)));
        balanceOut = -int256(tokenOut.balanceOf(address(this)));

        gasUsed = interactions[1].executeManyMetered();

        balanceIn += int256(tokenIn.balanceOf(address(this)));
        balanceOut += int256(tokenOut.balanceOf(address(this)));
    }

    function settle(
        address[] calldata tokens,
        uint256[] calldata clearingPrices,
        Interaction[][3] calldata interactions,
        uint256 mint
    ) external returns (
        uint256 gasUsed,
        int256[] memory traderBalances,
        int256[] memory settlementBalances
    ) {
        if (mint != 0) {
            IMintableERC20(tokens[0]).mint(address(this), mint);
        }
        IERC20(tokens[0]).safeApprove(address(SETTLEMENT.vaultRelayer()), type(uint256).max);

        traderBalances = new int256[](tokens.length);
        settlementBalances = new int256[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            traderBalances[i] = -int256(IERC20(tokens[i]).balanceOf(address(this)));
            settlementBalances[i] = -int256(IERC20(tokens[i]).balanceOf(address(SETTLEMENT)));
        }

        Trade[] memory trades = new Trade[](1);
        trades[0] = Trade({
            sellTokenIndex: 0,
            buyTokenIndex: tokens.length - 1,
            receiver: address(0),
            sellAmount: clearingPrices[tokens.length - 1],
            buyAmount: clearingPrices[0],
            validTo: type(uint32).max,
            appData: bytes32(0),
            feeAmount: 0,
            flags: 0x40,
            executedAmount: 0,
            signature: abi.encodePacked(address(this))
        });

        gasUsed = address(SETTLEMENT).doMeteredCallNoReturn(
            abi.encodeCall(
                SETTLEMENT.settle,
                (tokens, clearingPrices, trades, interactions)
            )
        );

        for (uint256 i; i < tokens.length; ++i) {
            traderBalances[i] += int256(IERC20(tokens[i]).balanceOf(address(this)));
            settlementBalances[i] += int256(IERC20(tokens[i]).balanceOf(address(SETTLEMENT)));
        }
    }

    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0x1626ba7e;
    }
}
