// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuyerVault} from "./interfaces/IBuyerVault.sol";
import {IInvoiceMarket, Invoice, Status} from "./interfaces/IInvoiceMarket.sol";

contract BuyerVault is IBuyerVault {
    error Unauthorized();
    error VaultFrozen();
    error InsufficientBalance();
    error DailyLimitExceeded();
    error SupplierNotAllowed();
    error SupplierLimitExceeded();
    error InvoiceNotForThisVault();
    error InvoiceNotAccepted();
    error InvalidApproval();
    error ApprovalExpired();
    error NonceAlreadyUsed();
    error InvalidAmount();
    error ZeroAddress();
    error TransferFailed();

    bytes32 private immutable DOMAIN_SEPARATOR;
    bytes32 public constant LARGE_PAYMENT_TYPEHASH =
        keccak256("LargePayment(address vault,uint256 invoiceId,uint256 amount,uint256 nonce,uint256 expiry)");

    address public immutable owner;
    address public immutable agent;
    address public immutable verifier;

    uint256 public override dailyLimit;
    uint256 public override approvalThreshold;
    bool public override isFrozen;

    uint256 private currentDayBucket;
    uint256 private currentDaySpend;

    mapping(address => bool) public override allowedSupplier;
    mapping(address => uint256) public override supplierLimit;
    mapping(address => mapping(uint256 => bool)) public acceptedInvoices;
    mapping(uint256 => bool) public usedNonces;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert Unauthorized();
        _;
    }

    modifier whenNotFrozen() {
        if (isFrozen) revert VaultFrozen();
        _;
    }

    constructor(
        address _owner,
        address _agent,
        address _verifier,
        uint256 _dailyLimit,
        uint256 _approvalThreshold
    ) {
        if (_owner == address(0) || _agent == address(0) || _verifier == address(0)) revert ZeroAddress();
        owner = _owner;
        agent = _agent;
        verifier = _verifier;
        dailyLimit = _dailyLimit;
        approvalThreshold = _approvalThreshold;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("BuyerVault")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable override {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external override onlyOwner {
        if (address(this).balance < amount) revert InsufficientBalance();
        (bool success, ) = owner.call{value: amount}("");
        if (!success) revert TransferFailed();
        emit Withdrawn(owner, amount);
    }

    function freeze() external override onlyOwner {
        isFrozen = true;
        emit Frozen();
    }

    function unfreeze() external override onlyOwner {
        isFrozen = false;
        emit Unfrozen();
    }

    function setLimits(uint256 _dailyLimit, uint256 _approvalThreshold) external override onlyOwner {
        dailyLimit = _dailyLimit;
        approvalThreshold = _approvalThreshold;
        emit LimitsChanged(_dailyLimit, _approvalThreshold);
    }

    function allowSupplier(address supplier, uint256 limit) external override onlyOwner {
        if (supplier == address(0)) revert ZeroAddress();
        allowedSupplier[supplier] = true;
        supplierLimit[supplier] = limit;
        emit SupplierAllowed(supplier, limit);
    }

    function removeSupplier(address supplier) external override onlyOwner {
        allowedSupplier[supplier] = false;
        supplierLimit[supplier] = 0;
        emit SupplierRemoved(supplier);
    }

    function accept(address market, uint256 id) external override onlyAgent whenNotFrozen {
        Invoice memory inv = IInvoiceMarket(market).getInvoice(id);
        if (inv.buyerVault != address(this)) revert InvoiceNotForThisVault();
        if (!allowedSupplier[inv.supplier]) revert SupplierNotAllowed();
        if (inv.faceAmount > supplierLimit[inv.supplier]) revert SupplierLimitExceeded();

        acceptedInvoices[market][id] = true;
        IInvoiceMarket(market).acceptInvoice(id);

        emit Accepted(market, id);
    }

    function payInvoice(
        address market,
        uint256 id,
        bytes memory approval
    ) public override onlyAgent whenNotFrozen {
        if (!acceptedInvoices[market][id]) revert InvoiceNotAccepted();

        Invoice memory inv = IInvoiceMarket(market).getInvoice(id);
        uint256 amount = inv.faceAmount;

        if (address(this).balance < amount) revert InsufficientBalance();

        uint256 today = block.timestamp / 1 days;
        uint256 newSpend = (today == currentDayBucket) ? currentDaySpend + amount : amount;
        if (newSpend > dailyLimit) revert DailyLimitExceeded();

        if (amount > approvalThreshold) {
            _verifyApproval(id, amount, approval);
        }

        currentDayBucket = today;
        currentDaySpend = newSpend;

        IInvoiceMarket(market).payInvoice{value: amount}(id);

        emit Paid(market, id, amount);
    }

    function payInvoice(address market, uint256 id) external override {
        payInvoice(market, id, "");
    }

    function _verifyApproval(
        uint256 id,
        uint256 amount,
        bytes memory approval
    ) internal {

        if (approval.length == 0) revert InvalidApproval();
        (uint256 nonce, uint256 expiry, bytes memory sig) = abi.decode(approval, (uint256, uint256, bytes));
        if (block.timestamp > expiry) revert ApprovalExpired();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        if (sig.length != 65) revert InvalidApproval();

        bytes32 structHash = keccak256(
            abi.encode(LARGE_PAYMENT_TYPEHASH, address(this), id, amount, nonce, expiry)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != verifier) revert InvalidApproval();

        usedNonces[nonce] = true;
        emit ApprovalUsed(nonce, verifier);
    }


    function spentToday() external view override returns (uint256) {
        if (block.timestamp / 1 days == currentDayBucket) {
            return currentDaySpend;
        }
        return 0;
    }
}
