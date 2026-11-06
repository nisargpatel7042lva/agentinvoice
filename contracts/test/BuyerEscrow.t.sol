// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerEscrow} from "../src/BuyerEscrow.sol";
import {EscrowDeposit} from "../src/interfaces/IBuyerEscrow.sol";
import {IInvoiceMarket, Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";

contract MockInvestor {
    receive() external payable {}
}

interface Vm {
    function warp(uint256) external;
}

contract BuyerEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    InvoiceMarket public market;
    BuyerEscrow public escrow;

    address public owner = address(this);
    address public sponsor = address(this);
    address public buyerVault = address(this); // test contract acts as buyer vault for easy accept/pay
    MockInvestor public investor;

    uint64 public constant GRACE_PERIOD = 86400; // 1 day

    receive() external payable {}

    function setUp() public {
        market = new InvoiceMarket(GRACE_PERIOD);
        escrow = new BuyerEscrow(address(market));
        investor = new MockInvestor();
    }

    function _createAndFundInvoice(uint256 faceAmount, uint256 price, uint64 dueDate) internal returns (uint256) {
        uint256 id = market.createInvoice(
            buyerVault,
            faceAmount,
            price,
            dueDate,
            keccak256("evidence-sample")
        );
        // Buyer accepts
        market.acceptInvoice(id);
        // Investor funds
        (bool success, ) = address(market).call{value: price}(
            abi.encodeWithSelector(market.fund.selector, id)
        );
        require(success, "funding failed");
        return id;
    }

    function test_depositCollateral_success() public {
        escrow.depositCollateral{value: 50 ether}(buyerVault, 2);

        EscrowDeposit memory dep = escrow.getEscrow(buyerVault);
        assert(dep.buyerVault == buyerVault);
        assert(dep.sponsor == sponsor);
        assert(dep.stakedAmount == 50 ether);
        assert(dep.requiredSettlements == 2);
        assert(dep.successfulSettlements == 0);
        assert(!dep.isGraduated);
    }

    function test_depositCollateral_validations() public {
        // Zero amount reverts
        (bool s1, ) = address(escrow).call(
            abi.encodeWithSelector(escrow.depositCollateral.selector, buyerVault, 2)
        );
        assert(!s1);

        // Zero address reverts
        (bool s2, ) = address(escrow).call{value: 10 ether}(
            abi.encodeWithSelector(escrow.depositCollateral.selector, address(0), 2)
        );
        assert(!s2);
    }

    function test_graduation_after_two_settlements() public {
        escrow.depositCollateral{value: 50 ether}(buyerVault, 2);

        uint64 due1 = uint64(block.timestamp + 500);
        uint256 id1 = _createAndFundInvoice(10 ether, 9 ether, due1);

        // Pay invoice 1
        market.payInvoice{value: 10 ether}(id1);

        // Record settlement 1
        escrow.recordSettlement(buyerVault, id1);
        EscrowDeposit memory dep1 = escrow.getEscrow(buyerVault);
        assert(dep1.successfulSettlements == 1);
        assert(!dep1.isGraduated);

        // Invoice 2
        uint64 due2 = uint64(block.timestamp + 600);
        uint256 id2 = _createAndFundInvoice(15 ether, 14 ether, due2);
        market.payInvoice{value: 15 ether}(id2);

        // Record settlement 2 -> should graduate!
        escrow.recordSettlement(buyerVault, id2);
        EscrowDeposit memory dep2 = escrow.getEscrow(buyerVault);
        assert(dep2.successfulSettlements == 2);
        assert(dep2.isGraduated);
    }

    function test_double_record_reverts() public {
        escrow.depositCollateral{value: 50 ether}(buyerVault, 2);

        uint64 due = uint64(block.timestamp + 500);
        uint256 id = _createAndFundInvoice(10 ether, 9 ether, due);
        market.payInvoice{value: 10 ether}(id);

        escrow.recordSettlement(buyerVault, id);

        // Second attempt must revert
        (bool success, ) = address(escrow).call(
            abi.encodeWithSelector(escrow.recordSettlement.selector, buyerVault, id)
        );
        assert(!success);
    }

    function test_withdraw_stake_after_graduation() public {
        escrow.depositCollateral{value: 30 ether}(buyerVault, 1);

        uint64 due = uint64(block.timestamp + 500);
        uint256 id = _createAndFundInvoice(10 ether, 9 ether, due);
        market.payInvoice{value: 10 ether}(id);

        escrow.recordSettlement(buyerVault, id);

        EscrowDeposit memory dep = escrow.getEscrow(buyerVault);
        assert(dep.isGraduated);

        uint256 balBefore = address(this).balance;
        escrow.withdrawStake(buyerVault);
        uint256 balAfter = address(this).balance;

        assert(balAfter - balBefore == 30 ether);
        assert(escrow.getEscrow(buyerVault).stakedAmount == 0);
    }

    function test_withdraw_reverts_before_graduation() public {
        escrow.depositCollateral{value: 30 ether}(buyerVault, 2);

        // Attempt to withdraw immediately must revert
        (bool success, ) = address(escrow).call(
            abi.encodeWithSelector(escrow.withdrawStake.selector, buyerVault)
        );
        assert(!success);
    }

    function test_topUpCollateral_success() public {
        escrow.depositCollateral{value: 20 ether}(buyerVault, 2);
        escrow.topUpCollateral{value: 15 ether}(buyerVault);

        EscrowDeposit memory dep = escrow.getEscrow(buyerVault);
        assert(dep.stakedAmount == 35 ether);
    }

    function test_slashOnDefault_pays_investor() public {
        escrow.depositCollateral{value: 50 ether}(buyerVault, 2);

        uint64 due = uint64(block.timestamp + 500);
        uint256 id = _createAndFundInvoice(20 ether, 18 ether, due);

        // Advance time past due date
        vm.warp(due + 1);
        market.markLate(id);

        // Advance time past grace period
        vm.warp(due + 1 + GRACE_PERIOD + 1);
        market.markDefaulted(id);

        Invoice memory inv = market.getInvoice(id);
        assert(inv.status == Status.Defaulted);

        uint256 investorBalBefore = address(this).balance;
        escrow.slashOnDefault(buyerVault, id);
        uint256 investorBalAfter = address(this).balance;

        // Since test contract funded it, test contract is inv.holder
        assert(investorBalAfter - investorBalBefore == 20 ether);

        EscrowDeposit memory dep = escrow.getEscrow(buyerVault);
        assert(dep.stakedAmount == 30 ether);
        assert(dep.slashedAmount == 20 ether);
    }
}
