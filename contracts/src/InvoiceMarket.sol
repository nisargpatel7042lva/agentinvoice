// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IInvoiceMarket, Invoice, Status} from "./interfaces/IInvoiceMarket.sol";
import {IBondIssuer} from "./interfaces/IBondIssuer.sol";
import {TokenLib} from "./TokenLib.sol";

// SETTLEMENT TOKEN: every payment moves the USDC token (SaucerSwap testnet USDC 0.0.5449, 6 decimals), never HBAR.
// faceAmount, price and claimable are USDC base units. Investors approve this contract for `price`, then fund();
// the buyer's vault approves `faceAmount`, then payInvoice(); the holder then claim()s USDC.
contract InvoiceMarket is IInvoiceMarket {
    using TokenLib for address;

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
    /// The settlement token (USDC).
    address public immutable override token;

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

    constructor(uint64 _gracePeriod, address _token) {
        if (_token == address(0)) revert ZeroAddress();
        owner = msg.sender;
        gracePeriod = _gracePeriod;
        token = _token;
        // On Hedera the market must be associated with USDC to hold repayments until they are claimed.
        _token.associateSelf();
    }

    /// Re-try the HTS association (anyone may call; harmless if already associated).
    function associateToken() external {
        token.associateSelf();
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

    function fund(uint256 id) public nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Open) revert InvoiceNotOpen();
        if (block.timestamp >= inv.dueDate) revert DueDatePassed();

        inv.status = Status.Funded;
        inv.holder = msg.sender;

        // Route T1a: if on-chain bond issuer configured, issue units
        if (bondIssuer != address(0)) {
            IBondIssuer(bondIssuer).issue(msg.sender, inv.faceAmount);
        }

        // The investor pays the supplier directly in USDC (needs an allowance of `price` for this contract).
        token.safeTransferFrom(msg.sender, inv.supplier, inv.price);

        emit InvoiceFunded(id, msg.sender, inv.faceAmount);
    }

    function buy(uint256 id) external {
        fund(id);
    }

    function confirmIssued(uint256 id, address bondAddress) external {
        if (msg.sender != owner && msg.sender != bondIssuer) revert OnlyOwnerOrIssuer();
        Invoice storage inv = invoices[id];
        if (inv.status != Status.Funded && inv.status != Status.Paid) revert InvoiceNotFunded();
        inv.bond = bondAddress;
        emit BondIssued(id, bondAddress, inv.holder);
    }

    function payInvoice(uint256 id) public nonReentrant {
        Invoice storage inv = invoices[id];
        if (msg.sender != inv.buyerVault) revert OnlyBuyerVault();
        if (inv.status != Status.Funded && inv.status != Status.Late) revert InvoiceNotPayable();

        inv.status = Status.Paid;
        claimable[inv.holder] += inv.faceAmount;

        // The vault repays the full face amount in USDC (it approves this contract first).
        token.safeTransferFrom(msg.sender, address(this), inv.faceAmount);

        emit InvoicePaid(id, msg.sender, inv.faceAmount);
    }

    function markPaid(uint256 id) external {
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
        token.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }
}

