// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.16;

import { IERC20 } from "../interfaces/IERC20.sol";
import { settlement } from "../interfaces/ISettlement.sol";

library Assertions {
    function settlementBalance(address token) private view returns (uint256) {
        return IERC20(token).balanceOf(address(settlement()));
    }

    function thisBalance(address token) private view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function transferredIntoSettlement(address token, uint256 amount) internal view {
        require(settlementBalance(token) == amount, "partial transfer in");
    }

    function swappedFromSettlement(address token, uint256 amount) internal view {
        require(thisBalance(token) == amount, "partial swap from");
    }

    function swappedToSettlement(address token, uint256 amount) internal view {
        require(settlementBalance(token) == amount, "partial swap to");
    }

    function balanceConservation(address token, uint256 balance) internal view {
        require(thisBalance(token) == balance, "balance not conserved");
    }
}
