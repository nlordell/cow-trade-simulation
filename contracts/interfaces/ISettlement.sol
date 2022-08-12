// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.16;

import { Interaction } from "../libraries/Interaction.sol";
import { Trade } from "../libraries/Trade.sol";

function settlement() pure returns (ISettlement) {
    return ISettlement(0x9008D19f58AAbD9eD0D60971565AA8510560ab41);
}

interface ISettlement {
    function domainSeparator() external view returns (bytes32);
    function authenticator() external view returns (address);
    function vaultRelayer() external view returns (address);
    function setPreSignature(bytes calldata orderUid, bool signed) external;
    function settle(
        address[] calldata tokens,
        uint256[] calldata clearingPrices,
        Trade.Data[] calldata trades,
        Interaction.Data[][3] calldata interactions
    ) external;
}
