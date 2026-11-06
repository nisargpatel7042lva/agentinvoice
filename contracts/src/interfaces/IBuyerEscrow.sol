// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct EscrowDeposit {
    address buyerVault;
    address sponsor;
    uint256 stakedAmount;
    uint256 requiredSettlements;
    uint256 successfulSettlements;
    bool isGraduated;
    uint256 slashedAmount;
}

interface IBuyerEscrow {
    event CollateralDeposited(
        address indexed buyerVault,
        address indexed sponsor,
        uint256 amount,
        uint256 requiredSettlements
    );
    event TopUp(address indexed buyerVault, uint256 addedAmount, uint256 totalAmount);
    event SettlementRecorded(address indexed buyerVault, uint256 indexed invoiceId, uint256 totalSettlements);
    event BuyerGraduated(address indexed buyerVault, address indexed sponsor);
    event CollateralSlashed(
        address indexed buyerVault,
        uint256 indexed invoiceId,
        uint256 amount,
        address indexed recipient
    );
    event StakeRefunded(address indexed buyerVault, address indexed sponsor, uint256 amount);

    function depositCollateral(address buyerVault, uint256 requiredSettlements) external payable;
    function topUpCollateral(address buyerVault) external payable;
    function recordSettlement(address buyerVault, uint256 invoiceId) external;
    function slashOnDefault(address buyerVault, uint256 invoiceId) external;
    function withdrawStake(address buyerVault) external;
    function getEscrow(address buyerVault) external view returns (EscrowDeposit memory);
}
