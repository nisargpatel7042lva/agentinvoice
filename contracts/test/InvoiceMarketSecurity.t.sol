// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";
import {IBondIssuer} from "../src/interfaces/IBondIssuer.sol";

// State machine edges, exact-value payments, reentrancy, hostile receivers and conservation of money.
// Amounts use tinybar scale (1 HBAR = 1e8), the unit the contracts use inside the Hedera EVM.
contract InvoiceMarketSecurityTest is TestBase {
    InvoiceMarket internal market;

    address internal owner = address(this);
    address internal supplier = address(0xD00D);
    address internal buyerVault = address(0xBA11);
    address internal investor = address(0x1AAE);

    function setUp() public {
        vm.warp(1_800_000_000);
        market = new InvoiceMarket(1 days);
    }

    function _create(uint256 face, uint256 price) internal returns (uint256 id) {
        vm.prank(supplier);
        id = market.createInvoice(buyerVault, face, price, uint64(block.timestamp + 7 days), keccak256("evidence"));
    }

    function _open(uint256 face, uint256 price) internal returns (uint256 id) {
        id = _create(face, price);
        vm.prank(buyerVault);
        market.acceptInvoice(id);
    }

    function _funded(uint256 face, uint256 price, address holder) internal returns (uint256 id) {
        id = _open(face, price);
        vm.deal(holder, price);
        vm.prank(holder);
        market.fund{value: price}(id);
    }

    function _pay(uint256 id, uint256 face) internal {
        vm.deal(buyerVault, face);
        vm.prank(buyerVault);
        market.payInvoice{value: face}(id);
    }

    // ---------- creating and accepting ----------

    function test_createInvoice_rejects_bad_terms() public {
        uint64 due = uint64(block.timestamp + 1 days);
        vm.startPrank(supplier);
        vm.expectRevert(InvoiceMarket.ZeroAddress.selector);
        market.createInvoice(address(0), 10, 9, due, bytes32(0));
        vm.expectRevert(InvoiceMarket.InvalidFaceAmount.selector);
        market.createInvoice(buyerVault, 0, 0, due, bytes32(0));
        vm.expectRevert(InvoiceMarket.InvalidPrice.selector);
        market.createInvoice(buyerVault, 10, 0, due, bytes32(0));
        vm.expectRevert(InvoiceMarket.InvalidPrice.selector);
        market.createInvoice(buyerVault, 10, 11, due, bytes32(0));
        vm.expectRevert(InvoiceMarket.DueDateInPast.selector);
        market.createInvoice(buyerVault, 10, 9, uint64(block.timestamp), bytes32(0));
        vm.stopPrank();
    }

    function test_only_the_buyer_vault_accepts_and_only_once() public {
        uint256 id = _create(100, 95);
        vm.prank(supplier);
        vm.expectRevert(InvoiceMarket.OnlyBuyerVault.selector);
        market.acceptInvoice(id);

        vm.prank(buyerVault);
        market.acceptInvoice(id);
        vm.prank(buyerVault);
        vm.expectRevert(InvoiceMarket.InvoiceNotPending.selector);
        market.acceptInvoice(id);
    }

    function test_a_pending_invoice_cannot_be_funded() public {
        uint256 id = _create(100, 95);
        vm.deal(investor, 95);
        vm.prank(investor);
        vm.expectRevert(InvoiceMarket.InvoiceNotOpen.selector);
        market.fund{value: 95}(id);
    }

    // ---------- funding ----------

    function test_fund_pays_the_supplier_the_price_and_records_the_holder() public {
        uint256 id = _open(100e8, 95e8);
        vm.deal(investor, 95e8);
        vm.prank(investor);
        market.fund{value: 95e8}(id);

        Invoice memory inv = market.getInvoice(id);
        assertEq(uint256(inv.status), uint256(Status.Funded), "funded");
        assertTrue(inv.holder == investor, "holder recorded");
        assertEq(supplier.balance, 95e8, "supplier got the price");
        assertEq(address(market).balance, 0, "the market holds nothing yet");
    }

    function testFuzz_fund_needs_exactly_the_price(uint96 priceIn, uint96 sentIn) public {
        uint256 price = bound(priceIn, 1, 1e24);
        uint256 sent = bound(sentIn, 0, 2e24);
        uint256 id = _open(price + 1e8, price);
        vm.deal(investor, sent);

        vm.prank(investor);
        if (sent != price) vm.expectRevert(InvoiceMarket.InvalidPaymentAmount.selector);
        market.fund{value: sent}(id);

        if (sent == price) {
            assertEq(supplier.balance, price, "supplier paid");
        } else {
            assertEq(uint256(market.getInvoice(id).status), uint256(Status.Open), "still open after a wrong payment");
            assertEq(supplier.balance, 0, "supplier unpaid");
        }
    }

    function test_funding_twice_and_after_the_due_date_reverts() public {
        uint256 id = _funded(100, 95, investor);
        vm.deal(address(0x2), 95);
        vm.prank(address(0x2));
        vm.expectRevert(InvoiceMarket.InvoiceNotOpen.selector);
        market.fund{value: 95}(id);

        uint256 late = _open(100, 95);
        vm.warp(block.timestamp + 8 days);
        vm.deal(investor, 95);
        vm.prank(investor);
        vm.expectRevert(InvoiceMarket.DueDatePassed.selector);
        market.fund{value: 95}(late);
    }

    function test_buy_is_the_same_as_fund() public {
        uint256 id = _open(100, 95);
        vm.deal(investor, 95);
        vm.prank(investor);
        market.buy{value: 95}(id);
        assertTrue(market.getInvoice(id).holder == investor, "buy funds the invoice");
    }

    // ---------- repayment ----------

    function test_only_the_buyer_vault_repays_and_only_the_exact_face() public {
        uint256 id = _funded(100, 95, investor);

        vm.deal(supplier, 100);
        vm.prank(supplier);
        vm.expectRevert(InvoiceMarket.OnlyBuyerVault.selector);
        market.payInvoice{value: 100}(id);

        vm.deal(buyerVault, 200);
        vm.startPrank(buyerVault);
        vm.expectRevert(InvoiceMarket.InvalidPaymentAmount.selector);
        market.payInvoice{value: 99}(id);
        vm.expectRevert(InvoiceMarket.InvalidPaymentAmount.selector);
        market.payInvoice{value: 101}(id);
        vm.stopPrank();
    }

    function test_double_repayment_reverts_and_markPaid_is_the_same_function() public {
        uint256 id = _funded(100, 95, investor);
        vm.deal(buyerVault, 200);
        vm.prank(buyerVault);
        market.markPaid{value: 100}(id);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Paid), "paid");

        vm.prank(buyerVault);
        vm.expectRevert(InvoiceMarket.InvoiceNotPayable.selector);
        market.payInvoice{value: 100}(id);
    }

    function test_a_late_invoice_can_still_be_repaid_but_a_defaulted_one_cannot() public {
        uint256 late = _funded(100, 95, investor);
        vm.warp(block.timestamp + 7 days + 1);
        market.markLate(late);
        _pay(late, 100);
        assertEq(uint256(market.getInvoice(late).status), uint256(Status.Paid), "late invoice repaid");

        uint256 dead = _funded(100, 95, investor);
        vm.warp(block.timestamp + 7 days + 1);
        market.markLate(dead);
        vm.warp(block.timestamp + 1 days + 1);
        market.markDefaulted(dead);
        vm.deal(buyerVault, 100);
        vm.prank(buyerVault);
        vm.expectRevert(InvoiceMarket.InvoiceNotPayable.selector);
        market.payInvoice{value: 100}(dead);
    }

    function test_markLate_and_markDefaulted_timing() public {
        uint256 id = _funded(100, 95, investor);
        vm.expectRevert(InvoiceMarket.DueDatePassed.selector);
        market.markLate(id); // not due yet

        vm.warp(block.timestamp + 7 days + 1);
        vm.expectRevert(InvoiceMarket.InvoiceNotLate.selector);
        market.markDefaulted(id); // not late yet
        market.markLate(id);
        vm.expectRevert(InvoiceMarket.InvoiceNotFunded.selector);
        market.markLate(id); // already late

        vm.expectRevert(InvoiceMarket.GracePeriodNotElapsed.selector);
        market.markDefaulted(id);
        vm.warp(block.timestamp + 1 days + 1);
        market.markDefaulted(id);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Defaulted), "defaulted");
    }

    // ---------- claiming and hostile receivers ----------

    function test_claim_pays_the_holder_once() public {
        uint256 id = _funded(100e8, 95e8, investor);
        _pay(id, 100e8);

        vm.prank(investor);
        market.claim();
        assertEq(investor.balance, 100e8, "holder received the face amount");
        assertEq(address(market).balance, 0, "market emptied");

        vm.prank(investor);
        vm.expectRevert(InvoiceMarket.NothingToClaim.selector);
        market.claim();

        vm.prank(supplier);
        vm.expectRevert(InvoiceMarket.NothingToClaim.selector);
        market.claim();
    }

    function test_repayment_goes_to_the_holder_stored_at_funding_time() public {
        uint256 id = _funded(100, 95, investor);
        _pay(id, 100);
        assertEq(market.claimable(investor), 100, "credited to the stored holder");
        assertEq(market.claimable(supplier), 0, "not to anyone else");
    }

    function test_claim_cannot_be_reentered() public {
        ReentrantHolder holder = new ReentrantHolder(market);
        uint256 id = _open(100e8, 95e8);
        vm.deal(address(holder), 95e8);
        holder.fundInvoice(id, 95e8);
        _pay(id, 100e8);

        holder.claimNow();
        assertEq(address(holder).balance, 100e8, "paid exactly once");
        assertTrue(holder.reentryBlocked(), "the nested claim was refused");
        assertTrue(!holder.reentrySucceeded(), "the nested claim did not succeed");
        assertEq(address(market).balance, 0, "market emptied");
    }

    function test_a_supplier_that_rejects_payment_blocks_only_its_own_funding() public {
        RejectingSupplier bad = new RejectingSupplier();
        vm.prank(address(bad));
        uint256 id = market.createInvoice(buyerVault, 100, 95, uint64(block.timestamp + 7 days), bytes32(uint256(5)));
        vm.prank(buyerVault);
        market.acceptInvoice(id);

        vm.deal(investor, 95);
        vm.prank(investor);
        vm.expectRevert(InvoiceMarket.TransferFailed.selector);
        market.fund{value: 95}(id);

        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Open), "invoice unchanged");
        assertEq(investor.balance, 95, "the investor keeps their money");
        assertEq(address(market).balance, 0, "nothing stuck in the market");
    }

    function test_a_supplier_cannot_reenter_fund_to_steal() public {
        ReentrantSupplier evil = new ReentrantSupplier(market);
        vm.prank(address(evil));
        uint256 id = market.createInvoice(buyerVault, 100, 95, uint64(block.timestamp + 7 days), bytes32(uint256(6)));
        vm.prank(buyerVault);
        market.acceptInvoice(id);
        evil.setTarget(id);

        vm.deal(investor, 95);
        vm.prank(investor);
        market.fund{value: 95}(id);

        assertEq(address(evil).balance, 95, "supplier received the price once");
        assertTrue(evil.reentryBlocked(), "the nested fund was refused");
    }

    // ---------- bond issuer hook and admin ----------

    function test_a_reverting_bond_issuer_blocks_funding_and_only_the_owner_sets_it() public {
        RevertingIssuer issuer = new RevertingIssuer();
        vm.prank(supplier);
        vm.expectRevert(InvoiceMarket.OnlyOwnerOrIssuer.selector);
        market.setBondIssuer(address(issuer));

        market.setBondIssuer(address(issuer));
        uint256 id = _open(100, 95);
        vm.deal(investor, 95);
        vm.prank(investor);
        vm.expectRevert(bytes("issuer down"));
        market.fund{value: 95}(id);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Open), "still open");

        market.setBondIssuer(address(0)); // owner can switch the hook off
        vm.prank(investor);
        market.fund{value: 95}(id);
    }

    function test_confirmIssued_is_restricted_and_needs_a_funded_invoice() public {
        uint256 id = _open(100, 95);
        vm.expectRevert(InvoiceMarket.InvoiceNotFunded.selector);
        market.confirmIssued(id, address(0xB0AD));

        vm.deal(investor, 95);
        vm.prank(investor);
        market.fund{value: 95}(id);

        vm.prank(supplier);
        vm.expectRevert(InvoiceMarket.OnlyOwnerOrIssuer.selector);
        market.confirmIssued(id, address(0xB0AD));

        market.confirmIssued(id, address(0xB0AD));
        assertTrue(market.getInvoice(id).bond == address(0xB0AD), "bond recorded");
    }

    // ---------- conservation of money ----------

    function testFuzz_a_full_cycle_pays_each_party_exactly(uint96 faceIn, uint16 discountBpsIn) public {
        uint256 face = bound(faceIn, 10, 1e24);
        uint256 discountBps = bound(discountBpsIn, 0, 9999);
        uint256 price = face * (10000 - discountBps) / 10000;
        if (price == 0) price = 1;

        uint256 id = _funded(face, price, investor);
        assertEq(supplier.balance, price, "supplier got the price");
        _pay(id, face);
        vm.prank(investor);
        market.claim();

        assertEq(investor.balance, face, "holder got the face amount");
        assertEq(address(market).balance, 0, "the market keeps nothing");
    }
}

contract ReentrantHolder {
    InvoiceMarket internal immutable market;
    bool public reentryBlocked;
    bool public reentrySucceeded;

    constructor(InvoiceMarket m) {
        market = m;
    }

    function fundInvoice(uint256 id, uint256 price) external {
        market.fund{value: price}(id);
    }

    function claimNow() external {
        market.claim();
    }

    receive() external payable {
        try market.claim() {
            reentrySucceeded = true;
        } catch {
            reentryBlocked = true;
        }
    }
}

contract ReentrantSupplier {
    InvoiceMarket internal immutable market;
    uint256 internal target;
    bool public reentryBlocked;

    constructor(InvoiceMarket m) {
        market = m;
    }

    function setTarget(uint256 id) external {
        target = id;
    }

    receive() external payable {
        try market.fund{value: 0}(target) {} catch {
            reentryBlocked = true;
        }
    }
}

contract RejectingSupplier {
    receive() external payable {
        revert("no thanks");
    }
}

contract RevertingIssuer is IBondIssuer {
    function issue(address, uint256) external pure override {
        revert("issuer down");
    }
}
