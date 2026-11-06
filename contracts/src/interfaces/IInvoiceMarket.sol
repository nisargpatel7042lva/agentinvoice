// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum Status {
    Pending,
    Open,
    Funded,
    Paid,
    Late,
    Defaulted
}

struct Invoice {
    uint256 id;
    address supplier;
    address buyerVault;
    uint256 faceAmount;
    uint256 price;
    uint64 dueDate;
    Status status;
    address bond;
    address holder;
    bytes32 evidenceHash;
}

interface IInvoiceMarket {
    event InvoiceCreated(
        uint256 indexed id,
        address indexed supplier,
        address indexed buyerVault,
        uint256 faceAmount,
        uint256 price,
        uint64 dueDate,
        bytes32 evidenceHash
    );
    event InvoiceAccepted(uint256 indexed id, address indexed buyerVault);
    event InvoiceFunded(uint256 indexed id, address indexed holder, uint256 faceAmount);
    event InvoicePaid(uint256 indexed id, address indexed payer, uint256 amount);
    event InvoiceLate(uint256 indexed id);
    event InvoiceDefaulted(uint256 indexed id);
    event BondIssued(uint256 indexed id, address indexed bond, address indexed holder);
    event Claimed(address indexed account, uint256 amount);

    function createInvoice(
        address buyerVault,
        uint256 faceAmount,
        uint256 price,
        uint64 dueDate,
        bytes32 evidenceHash
    ) external returns (uint256 id);

    function acceptInvoice(uint256 id) external;
    function fund(uint256 id) external payable;
    function buy(uint256 id) external payable;
    function payInvoice(uint256 id) external payable;
    function markPaid(uint256 id) external payable;
    function markLate(uint256 id) external;
    function markDefaulted(uint256 id) external;
    function claim() external;
    function getInvoice(uint256 id) external view returns (Invoice memory);
}
