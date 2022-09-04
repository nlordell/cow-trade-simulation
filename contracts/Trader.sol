// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import { IMintableERC20, IERC20 } from "./interfaces/IERC20.sol";
import { Interaction, Trade, SETTLEMENT } from "./interfaces/ISettlement.sol";
import { Caller } from "./libraries/Caller.sol";
import { SafeERC20 } from "./libraries/SafeERC20.sol";

contract Trader {
    using Caller for address;
    using SafeERC20 for IERC20;

    function trade(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 mint,
        address spender,
        address exchange,
        bytes calldata cdata
    ) external returns (
        uint256 gasUsed,
        uint256 executedIn,
        uint256 executedOut
    ) {
        if (mint != 0) {
            IMintableERC20(address(tokenIn)).mint(address(this), mint);
        }

        uint256 balanceIn = tokenIn.balanceOf(address(this));
        uint256 balanceOut = tokenOut.balanceOf(address(this));

        if (spender != address(0)) {
            tokenIn.safeApprove(spender, type(uint256).max);
        }

        gasUsed = exchange.doMeteredCallNoReturn(cdata);

        executedIn = balanceIn - tokenIn.balanceOf(address(this));
        executedOut = tokenOut.balanceOf(address(this)) - balanceOut;
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
        IERC20(tokens[0]).safeApprove(address(SETTLEMENT), type(uint256).max);

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
