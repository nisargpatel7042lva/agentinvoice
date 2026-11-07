// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerVault} from "../src/BuyerVault.sol";

contract DeployScript {
    /// SaucerSwap-listed Hedera testnet USDC (HTS 0.0.5449, 6 decimals) at its long-zero EVM address.
    address public constant USDC = address(0x0000000000000000000000000000000000001549);

    function run() external returns (address marketAddress, address vaultAddress) {
        uint64 gracePeriod = 86400; // 1 day default

        address deployer = msg.sender;
        address agent = deployer;
        address verifier = deployer;
        uint256 dailyLimit = 500e6; // 500 USDC
        uint256 approvalThreshold = 50e6; // 50 USDC

        InvoiceMarket market = new InvoiceMarket(gracePeriod, USDC);
        marketAddress = address(market);

        BuyerVault vault = new BuyerVault(deployer, agent, verifier, dailyLimit, approvalThreshold, USDC);
        vaultAddress = address(vault);
    }
}
