// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import { Caller } from "./libraries/Caller.sol";
import { SafeERC20 } from "./libraries/SafeERC20.sol";

/// @dev A phony ERC20 implementation, that replaces the bytecode of an existing
/// on-chain contract and allows minting to arbitrary addresses. This can be
/// used to fund an account when one with a known balance can't be found.
contract PhonyERC20 {
    using Caller for address;
    using SafeERC20 for bytes;

    /// @dev A seed to offset all storage operations to make sure that we don't
    /// accidentally touch any of the implementation's slots. Derived from:
    /// ```
    /// keccak("hakuna matata")
    /// ```
    uint256 constant private SEED =
        0x2dc49bd971a218a45c433d8da1ecae9b9e80fb7d8335e0369a90da5010750286;

    /// @dev Address where the original code for the token implementation is
    /// expected to be.
    address constant private IMPLEMENTATION = address(0x10000);

    fallback() external payable {
        _fallback();
    }

    receive() external payable {
        _fallback();
    }

    function balanceOf(address owner) external returns (uint256) {
        uint256 implementationBalance = _implementationBalanceOf(owner);
        uint256 internalBalance = _balancesSlot()[owner];

        return implementationBalance + internalBalance;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        uint256 realAmount = _transferInternal(msg.sender, to, value);

        if (realAmount > 0) {
            IMPLEMENTATION.doDelegatecall(abi.encodeCall(this.transfer, (to, realAmount)))
                .check("PhonyERC20: transfer failed");
        }

        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 realAmount = _transferInternal(from, to, value);

        if (realAmount > 0) {
            IMPLEMENTATION.doDelegatecall(abi.encodeCall(this.transferFrom, (from, to, realAmount)))
                .check("PhonyERC20: transferFrom failed");
        }

        return true;
    }

    function mint(address receiver, uint256 amount) external returns (bool) {
        _balancesSlot()[receiver] += amount;
        return true;
    }

    function _fallback() private {
        bytes memory rdata = IMPLEMENTATION.doDelegatecall(msg.data);
        assembly { return(add(rdata, 32), mload(rdata)) }
    }

    function _balancesSlot() private pure returns (
        mapping(address => uint256) storage slot
    ) {
        uint256 offset = SEED + 1;
        assembly { slot.slot := offset }
    }

    function _implementationBalanceOf(address owner) private returns (uint256) {
        return abi.decode(
            IMPLEMENTATION.doDelegatecall(abi.encodeCall(this.balanceOf, (owner))),
            (uint256)
        );
    }

    function _transferInternal(
        address from,
        address to,
        uint256 value
    ) private returns (
        uint256 realAmount
    ) {
        uint256 implementationBalance = _implementationBalanceOf(from);
        uint256 internalAmount = implementationBalance < value
            ? value - implementationBalance
            : 0;

        if (internalAmount > 0) {
            mapping(address => uint256) storage balances = _balancesSlot();
            balances[from] -= internalAmount;
            balances[to] += internalAmount;
        }

        realAmount = value - internalAmount;
    }
}
