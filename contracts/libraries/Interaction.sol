// SPDX-License-Identifier: MIT
pragma solidity =0.8.16;

library Interaction {
    struct Data {
        address target;
        uint256 value;
        bytes callData;
    }
}