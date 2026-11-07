// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBuyerVault {
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event Frozen();
    event Unfrozen();
    event LimitsChanged(uint256 dailyLimit, uint256 approvalThreshold);
    event SupplierAllowed(address indexed supplier, uint256 limit);
    event SupplierRemoved(address indexed supplier);
    event Accepted(address indexed market, uint256 indexed id);
    event ApprovalUsed(uint256 indexed nonce, address indexed verifier);
    event Paid(address indexed market, uint256 indexed id, uint256 amount);

    function deposit(uint256 amount) external;
    function balance() external view returns (uint256);
    function token() external view returns (address);
    function withdraw(uint256 amount) external;
    function freeze() external;
    function unfreeze() external;
    function setLimits(uint256 _dailyLimit, uint256 _approvalThreshold) external;
    function allowSupplier(address supplier, uint256 limit) external;
    function removeSupplier(address supplier) external;
    function allowMarket(address market, bool allowed) external; // owner only: the InvoiceMarket contracts this vault may call
    function allowedMarket(address market) external view returns (bool);

    function accept(address market, uint256 id) external;
    function payInvoice(address market, uint256 id, bytes calldata approval) external;
    function payInvoice(address market, uint256 id) external;

    function allowedSupplier(address supplier) external view returns (bool);
    function supplierLimit(address supplier) external view returns (uint256);
    function dailyLimit() external view returns (uint256);
    function approvalThreshold() external view returns (uint256);
    function spentToday() external view returns (uint256);
    function isFrozen() external view returns (bool);
}

