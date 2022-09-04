// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

library Caller {
    function doCall(address self, bytes memory cdata) internal returns (bytes memory rdata) {
        bool success;
        (success, rdata) = self.call(cdata);
        if (!success) {
            assembly { revert(add(rdata, 32), mload(rdata)) }
        }
    }

    function doMeteredCallNoReturn(address self, bytes memory cdata) internal returns (uint256 gasUsed) {
        gasUsed = gasleft();
        assembly {
            if iszero(call(gas(), self, 0, add(cdata, 32), mload(cdata), 0, 0)) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
        gasUsed -= gasleft();
    }

    function doDelegatecall(address self, bytes memory cdata) internal returns (bytes memory rdata) {
        bool success;
        (success, rdata) = self.delegatecall(cdata);
        if (!success) {
            assembly { revert(add(rdata, 32), mload(rdata)) }
        }
    }
}
