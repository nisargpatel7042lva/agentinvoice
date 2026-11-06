// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuyerEscrow, EscrowDeposit} from "./interfaces/IBuyerEscrow.sol";
import {IInvoiceMarket, Invoice, Status} from "./interfaces/IInvoiceMarket.sol";

/**
 * @title BuyerEscrow
 * @notice Staked collateral escrow for new buyers to bootstrap credit / trust on AgentInvoice.
 * @dev New buyer agents stake collateral here. Once they settle the required number of invoices
 *      (e.g., 2-3 on-time settlements), they graduate, and the sponsor can withdraw the stake.
 *      If an invoice defaults, the staked collateral is slashed to compensate the investor.
 *
 * UNITS: All monetary amounts (stakedAmount, slashedAmount, msg.value) are in native currency tinybars.
 */
contract BuyerEscrow is IBuyerEscrow {
    error ZeroAddress();
    error ZeroAmount();
    error AlreadyStaked();
    error NoDepositFound();
    error NotSponsor();
    error NotGraduated();
    error NothingToWithdraw();
    error TransferFailed();
    error InvoiceMismatch();
    error InvoiceNotPaid();
    error InvoiceNotDefaulted();
    error AlreadyProcessed();
    error ReentrancyGuardReentrantCall();

    IInvoiceMarket public immutable market;
    uint256 public constant DEFAULT_REQUIRED_SETTLEMENTS = 2;

    mapping(address => EscrowDeposit) private deposits;
    mapping(address => mapping(uint256 => bool)) public processedSettlements;
    mapping(address => mapping(uint256 => bool)) public processedDefaults;

    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyGuardReentrantCall();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _market) {
        if (_market == address(0)) revert ZeroAddress();
        market = IInvoiceMarket(_market);
    }

    /**
     * @notice Deposit initial collateral for a buyer vault to bootstrap their credit.
     * @param buyerVault The buyer's vault address.
     * @param requiredSettlements How many successful invoice payments are needed to graduate (default: 2).
     */
    function depositCollateral(address buyerVault, uint256 requiredSettlements) external payable nonReentrant {
        if (buyerVault == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        EscrowDeposit storage dep = deposits[buyerVault];
        if (dep.stakedAmount > 0) revert AlreadyStaked();

        uint256 targetSettlements = requiredSettlements == 0 ? DEFAULT_REQUIRED_SETTLEMENTS : requiredSettlements;

        deposits[buyerVault] = EscrowDeposit({
            buyerVault: buyerVault,
            sponsor: msg.sender,
            stakedAmount: msg.value,
            requiredSettlements: targetSettlements,
            successfulSettlements: 0,
            isGraduated: false,
            slashedAmount: 0
        });

        emit CollateralDeposited(buyerVault, msg.sender, msg.value, targetSettlements);
    }

    /**
     * @notice Add more collateral to an existing escrow deposit.
     * @param buyerVault The buyer's vault address.
     */
    function topUpCollateral(address buyerVault) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        EscrowDeposit storage dep = deposits[buyerVault];
        if (dep.sponsor == address(0)) revert NoDepositFound();

        dep.stakedAmount += msg.value;
        emit TopUp(buyerVault, msg.value, dep.stakedAmount);
    }

    /**
     * @notice Verifies an invoice was paid on-time and increments the buyer's successful settlement count.
     * @dev Anyone can call this as it verifies the state on InvoiceMarket.
     * @param buyerVault The buyer's vault address.
     * @param invoiceId The settled invoice ID.
     */
    function recordSettlement(address buyerVault, uint256 invoiceId) external nonReentrant {
        EscrowDeposit storage dep = deposits[buyerVault];
        if (dep.sponsor == address(0)) revert NoDepositFound();
        if (processedSettlements[buyerVault][invoiceId]) revert AlreadyProcessed();

        Invoice memory inv = market.getInvoice(invoiceId);
        if (inv.buyerVault != buyerVault) revert InvoiceMismatch();
        if (inv.status != Status.Paid) revert InvoiceNotPaid();

        processedSettlements[buyerVault][invoiceId] = true;
        dep.successfulSettlements += 1;

        emit SettlementRecorded(buyerVault, invoiceId, dep.successfulSettlements);

        if (dep.successfulSettlements >= dep.requiredSettlements && !dep.isGraduated) {
            dep.isGraduated = true;
            emit BuyerGraduated(buyerVault, dep.sponsor);
        }
    }

    /**
     * @notice Slashes staked collateral if a buyer defaulted on an invoice, sending funds to the investor (holder).
     * @param buyerVault The buyer's vault address.
     * @param invoiceId The defaulted invoice ID.
     */
    function slashOnDefault(address buyerVault, uint256 invoiceId) external nonReentrant {
        EscrowDeposit storage dep = deposits[buyerVault];
        if (dep.sponsor == address(0)) revert NoDepositFound();
        if (processedDefaults[buyerVault][invoiceId]) revert AlreadyProcessed();
        if (dep.stakedAmount == 0) revert NothingToWithdraw();

        Invoice memory inv = market.getInvoice(invoiceId);
        if (inv.buyerVault != buyerVault) revert InvoiceMismatch();
        if (inv.status != Status.Defaulted) revert InvoiceNotDefaulted();

        processedDefaults[buyerVault][invoiceId] = true;

        // Slash up to face amount or all remaining staked collateral
        uint256 slashAmount = dep.stakedAmount < inv.faceAmount ? dep.stakedAmount : inv.faceAmount;
        dep.stakedAmount -= slashAmount;
        dep.slashedAmount += slashAmount;

        address recipient = inv.holder;
        if (recipient == address(0)) {
            recipient = dep.sponsor; // fallback if no holder
        }

        (bool success, ) = recipient.call{value: slashAmount}("");
        if (!success) revert TransferFailed();

        emit CollateralSlashed(buyerVault, invoiceId, slashAmount, recipient);
    }

    /**
     * @notice Withdraw remaining staked collateral once the buyer has graduated.
     * @param buyerVault The buyer vault to withdraw for.
     */
    function withdrawStake(address buyerVault) external nonReentrant {
        EscrowDeposit storage dep = deposits[buyerVault];
        if (dep.sponsor == address(0)) revert NoDepositFound();
        if (msg.sender != dep.sponsor) revert NotSponsor();
        if (!dep.isGraduated) revert NotGraduated();
        if (dep.stakedAmount == 0) revert NothingToWithdraw();

        uint256 refundAmount = dep.stakedAmount;
        dep.stakedAmount = 0;

        (bool success, ) = dep.sponsor.call{value: refundAmount}("");
        if (!success) revert TransferFailed();

        emit StakeRefunded(buyerVault, dep.sponsor, refundAmount);
    }

    /**
     * @notice View the current escrow deposit details for a buyer vault.
     */
    function getEscrow(address buyerVault) external view returns (EscrowDeposit memory) {
        return deposits[buyerVault];
    }
}
