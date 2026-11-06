// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerVault} from "../src/BuyerVault.sol";

contract DeployScript {
    function run() external returns (address marketAddress, address vaultAddress) {
        uint64 gracePeriod = 86400; // 1 day default

        address deployer = msg.sender;
        address agent = deployer;
        address verifier = deployer;
        uint256 dailyLimit = 500 ether;
        uint256 approvalThreshold = 50 ether;

        InvoiceMarket market = new InvoiceMarket(gracePeriod);
        marketAddress = address(market);

        BuyerVault vault = new BuyerVault(deployer, agent, verifier, dailyLimit, approvalThreshold);
        vaultAddress = address(vault);
    }
}

