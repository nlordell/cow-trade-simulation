// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.16;

library Interaction {
    struct Data {
        address target;
        uint256 value;
        bytes callData;
    }
}