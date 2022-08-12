// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.16;

import { Dummy } from "./Dummy.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { settlement } from "./interfaces/ISettlement.sol";
import { Assertions } from "./libraries/Assertions.sol";
import { Interaction } from "./libraries/Interaction.sol";
import { Order } from "./libraries/Order.sol";
import { Trade } from "./libraries/Trade.sol";

contract Trader {
    using Order for Order.Data;

    struct Context {
        address token;
        address pool;
    }

    function execute(address token, uint256 amount, Context memory dummy) external returns (bytes4) {
        uint256 balance = IERC20(token).balanceOf(address(this));

        // swap from token to dummy
        {
            Order.Data memory order = Order.Data({
                sellToken: token,
                buyToken: dummy.token,
                receiver: address(0),
                sellAmount: amount,
                buyAmount: 1,
                validTo: type(uint32).max,
                appData: bytes32(0),
                feeAmount: 0,
                kind: Order.KIND_SELL,
                partiallyFillable: false,
                sellTokenBalance: Order.BALANCE_ERC20,
                buyTokenBalance: Order.BALANCE_ERC20
            });

            address[] memory tokens = new address[](2);
            tokens[0] = token;
            tokens[1] = dummy.token;

            uint256[] memory prices = new uint256[](2);
            prices[0] = 1 ether;
            prices[1] = amount;

            Trade.Data[] memory trades = new Trade.Data[](1);
            trades[0] = Trade.Data({
                sellTokenIndex: 0,
                buyTokenIndex: 1,
                receiver: address(0),
                sellAmount: amount,
                buyAmount: 1,
                validTo: type(uint32).max,
                appData: bytes32(0),
                feeAmount: 0,
                flags: 0x60,
                executedAmount: 0,
                signature: abi.encodePacked(address(this))
            });

            Interaction.Data[][3] memory interactions;
            uint256 buffer = IERC20(token).balanceOf(address(settlement()));
            if (balance > 0) {
                interactions[0] = new Interaction.Data[](1);
                interactions[0][0] = Interaction.Data({
                    target: token,
                    value: 0,
                    callData: abi.encodeWithSelector(IERC20.transfer.selector, dummy.pool, buffer)
                });
            }
            interactions[1] = new Interaction.Data[](2);
            interactions[1][0] = Interaction.Data({
                target: token,
                value: 0,
                callData: abi.encodeWithSelector(IERC20.approve.selector, dummy.pool, type(uint256).max)
            });
            interactions[1][1] = Interaction.Data({
                target: dummy.pool,
                value: 0,
                callData: abi.encodeWithSelector(Dummy.swapFrom.selector, token, amount)
            });

            IERC20(token).approve(address(settlement().vaultRelayer()), type(uint256).max);
            settlement().setPreSignature(order.uid(address(this)), true);
            settlement().settle(tokens, prices, trades, interactions);
        }

        // swap to token from dummy
        {
            Order.Data memory order = Order.Data({
                sellToken: dummy.token,
                buyToken: token,
                receiver: address(0),
                sellAmount: type(uint128).max,
                buyAmount: amount,
                validTo: type(uint32).max,
                appData: bytes32(0),
                feeAmount: 0,
                kind: Order.KIND_BUY,
                partiallyFillable: false,
                sellTokenBalance: Order.BALANCE_ERC20,
                buyTokenBalance: Order.BALANCE_ERC20
            });

            address[] memory tokens = new address[](2);
            tokens[0] = dummy.token;
            tokens[1] = token;

            uint256[] memory prices = new uint256[](2);
            prices[0] = amount;
            prices[1] = 1 ether;

            Trade.Data[] memory trades = new Trade.Data[](1);
            trades[0] = Trade.Data({
                sellTokenIndex: 0,
                buyTokenIndex: 1,
                receiver: address(0),
                sellAmount: type(uint128).max,
                buyAmount: amount,
                validTo: type(uint32).max,
                appData: bytes32(0),
                feeAmount: 0,
                flags: 0x61,
                executedAmount: 0,
                signature: abi.encodePacked(address(this))
            });

            Interaction.Data[][3] memory interactions;
            interactions[1] = new Interaction.Data[](1);
            interactions[1][0] = Interaction.Data({
                target: dummy.pool,
                value: 0,
                callData: abi.encodeWithSelector(Dummy.swapTo.selector, token, amount)
            });

            settlement().setPreSignature(order.uid(address(this)), true);
            settlement().settle(tokens, prices, trades, interactions);
        }

        Assertions.balanceConservation(token, balance);
        return this.execute.selector;
    }
}
