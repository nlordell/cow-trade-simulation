// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import { IERC20, IMintableERC20, INativeERC20 } from "./interfaces/IERC20.sol";
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

    function roundtrip(
        INativeERC20 native,
        IERC20 token,
        uint256 amountToken,
        Interaction[][3] calldata native2token,
        Interaction[][3] calldata token2native
    ) external {
        uint256 amountNative = address(this).balance;
        uint256 balanceToken = token.balanceOf(address(this));

        native.deposit{value: amountNative}();
        native.safeApprove(address(SETTLEMENT.vaultRelayer()), type(uint256).max);
        token.safeApprove(address(SETTLEMENT.vaultRelayer()), type(uint256).max);

        address[] memory tokens = new address[](2);
        tokens[0] = address(native);
        tokens[1] = address(token);

        {
            uint256[] memory clearingPrices = new uint256[](2);
            clearingPrices[0] = amountToken;
            clearingPrices[1] = amountNative;

            Trade[] memory trades = new Trade[](1);
            trades[0] = Trade({
                sellTokenIndex: 0,
                buyTokenIndex: 1,
                receiver: address(0),
                sellAmount: type(uint128).max,
                buyAmount: amountToken,
                validTo: type(uint32).max,
                appData: bytes32(0),
                feeAmount: 0,
                flags: 0x41,
                executedAmount: 0,
                signature: abi.encodePacked(address(this))
            });

            SETTLEMENT.settle(tokens, clearingPrices, trades, native2token);
        }

        require(
            token.balanceOf(address(this)) == amountToken + balanceToken,
            "Trader: missing token balance"
        );

        {
            uint256[] memory clearingPrices = new uint256[](2);
            clearingPrices[0] = 0;
            clearingPrices[1] = amountNative;

            Trade[] memory trades = new Trade[](1);
            trades[0] = Trade({
                sellTokenIndex: 1,
                buyTokenIndex: 0,
                receiver: address(0),
                sellAmount: amountToken,
                buyAmount: 0,
                validTo: type(uint32).max,
                appData: bytes32(0),
                feeAmount: 0,
                flags: 0x40,
                executedAmount: 0,
                signature: abi.encodePacked(address(this))
            });

            SETTLEMENT.settle(tokens, clearingPrices, trades, token2native);
        }

        require(
            token.balanceOf(address(this)) == balanceToken,
            "Trader: unused unused balance"
        );
    }

    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0x1626ba7e;
    }
}
