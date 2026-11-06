// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IInvoiceMarket, Invoice, Status} from "./interfaces/IInvoiceMarket.sol";
import {IBondIssuer} from "./interfaces/IBondIssuer.sol";

// UNITS: faceAmount, price, msg.value and claimable are in tinybars: inside the Hedera EVM msg.value and address.balance are tinybars
// (1 HBAR = 1e8), so they are compared directly. Never scale by 1e10 here; clients convert to the 18-decimal JSON-RPC wire format
// at the edge (packages/shared units.ts tinybarToWeibar). See docs/notes/contracts-review.md.
contract InvoiceMarket is IInvoiceMarket {
    error ZeroAddress();
    error InvalidFaceAmount();
    error InvalidPrice();
    error DueDateInPast();
    error DueDatePassed();
    error OnlyBuyerVault();
    error InvoiceNotPending();
    error InvoiceNotOpen();
    error InvoiceNotPayable();
    error InvoiceNotFunded();
    error InvoiceNotLate();
    error GracePeriodNotElapsed();
    error InvalidPaymentAmount();
    error TransferFailed();
    error NothingToClaim();
    error ReentrancyGuardReentrantCall();
    error OnlyOwnerOrIssuer();

    address public immutable owner;
    uint64 public immutable gracePeriod;

    address public bondIssuer;
    uint256 public nextInvoiceId = 1;

    mapping(uint256 => Invoice) private invoices;
    mapping(address => uint256) public claimable;

    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyGuardReentrantCall();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(uint64 _gracePeriod) {
        owner = msg.sender;
        gracePeriod = _gracePeriod;
    }

    function setBondIssuer(address _bondIssuer) external {
        if (msg.sender != owner) revert OnlyOwnerOrIssuer();
        bondIssuer = _bondIssuer;
    }

    function createInvoice(
        address buyerVault,
        uint256 faceAmount,
        uint256 price,
        uint64 dueDate,
        bytes32 evidenceHash
    ) external returns (uint256 id) {
        if (buyerVault == address(0)) revert ZeroAddress();
        if (faceAmount == 0) revert InvalidFaceAmount();
        if (price == 0 || price > faceAmount) revert InvalidPrice();
        if (dueDate <= block.timestamp) revert DueDateInPast();

        id = nextInvoiceId++;

        invoices[id] = Invoice({
            id: id,
            supplier: msg.sender,
            buyerVault: buyerVault,
            faceAmount: faceAmount,
            price: price,
            dueDate: dueDate,
            status: Status.Pending,
            bond: address(0),
            holder: address(0),
            evidenceHash: evidenceHash
        });

        emit InvoiceCreated(id, msg.sender, buyerVault, faceAmount, price, dueDate, evidenceHash);
    }

    function acceptInvoice(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (inv.id == 0) revert InvoiceNotPending();
        if (msg.sender != inv.buyerVault) revert OnlyBuyerVault();
        if (inv.status != Status.Pending) revert InvoiceNotPending();
        if (inv.dueDate <= block.timestamp) revert DueDatePassed();

        inv.status = Status.Open;
        emit InvoiceAccepted(id, msg.sender);
    }

    function fund(uint256 id) public payable nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Open) revert InvoiceNotOpen();
        if (block.timestamp >= inv.dueDate) revert DueDatePassed();
        if (msg.value != inv.price) revert InvalidPaymentAmount();

        inv.status = Status.Funded;
        inv.holder = msg.sender;

        // Route T1a: if on-chain bond issuer configured, issue units
        if (bondIssuer != address(0)) {
            IBondIssuer(bondIssuer).issue(msg.sender, inv.faceAmount);
        }

        // Send payment to supplier
        (bool success, ) = inv.supplier.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit InvoiceFunded(id, msg.sender, inv.faceAmount);
    }

    function buy(uint256 id) external payable {
        fund(id);
    }

    function confirmIssued(uint256 id, address bondAddress) external {
        if (msg.sender != owner && msg.sender != bondIssuer) revert OnlyOwnerOrIssuer();
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Funded && inv.status != Status.Paid) revert InvoiceNotFunded();
        inv.bond = bondAddress;
        emit BondIssued(id, bondAddress, inv.holder);
    }

    function payInvoice(uint256 id) public payable nonReentrant {
        Invoice storage inv = invoices[id];
        if (msg.sender != inv.buyerVault) revert OnlyBuyerVault();
        if (inv.status != Status.Funded && inv.status != Status.Late) revert InvoiceNotPayable();
        if (msg.value != inv.faceAmount) revert InvalidPaymentAmount();

        inv.status = Status.Paid;
        claimable[inv.holder] += msg.value;

        emit InvoicePaid(id, msg.sender, msg.value);
    }

    function markPaid(uint256 id) external payable {
        payInvoice(id);
    }

    function markLate(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Funded) revert InvoiceNotFunded();
        if (block.timestamp <= inv.dueDate) revert DueDatePassed();

        inv.status = Status.Late;
        emit InvoiceLate(id);
    }

    function markDefaulted(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Late) revert InvoiceNotLate();
        if (block.timestamp <= inv.dueDate + gracePeriod) revert GracePeriodNotElapsed();

        inv.status = Status.Defaulted;
        emit InvoiceDefaulted(id);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Claimed(msg.sender, amount);
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }
}

