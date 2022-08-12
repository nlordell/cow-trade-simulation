// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.16;

import { IERC20 } from "./interfaces/IERC20.sol";
import { Assertions } from "./libraries/Assertions.sol";

contract Dummy is IERC20 {
    // Dummy Token
    function balanceOf(address) external pure returns (uint256) {
        return type(uint256).max;
    }
    function approve(address, uint256) external pure returns (bool) {
        return true;
    }
    function transfer(address, uint256) external pure returns (bool) {
        return true;
    }
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }

    // Dummy Pool
    function swapFrom(address token, uint256 amount) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            address randomAddress = address(uint160(uint256(blockhash(block.number - 1))));
            IERC20(token).transfer(randomAddress, balance);
        }

        Assertions.transferredIntoSettlement(token, amount);
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        Assertions.swappedFromSettlement(token, amount);
    }
    function swapTo(address token, uint256 amount) external {
        IERC20(token).transfer(msg.sender, amount);
        Assertions.swappedToSettlement(token, amount);
    }

    // Dummy Authentication
    function isSolver(address) external pure returns (bool) {
        return true;
    }
}
