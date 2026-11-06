// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerVault} from "../src/BuyerVault.sol";

contract DeployScript {
    function run() external returns (address marketAddress, address vaultAddress) {
        uint64 gracePeriod = 86400; // 1 day default

        address deployer = msg.sender;
        address agent = deployer;
        address verifier = 0x27a3c43158AC762F57B3aBe459a98e67659738EE; // Sidd's backend verifier address
        uint256 dailyLimit = 500 * 1e8; // 500 HBAR stored in tinybars
        uint256 approvalThreshold = 50 * 1e8; // 50 HBAR stored in tinybars

        InvoiceMarket market = new InvoiceMarket(gracePeriod);
        marketAddress = address(market);

        BuyerVault vault = new BuyerVault(deployer, agent, verifier, dailyLimit, approvalThreshold);
        vaultAddress = address(vault);
    }
}
