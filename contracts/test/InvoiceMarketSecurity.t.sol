// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsdcTestBase, ITokenHook} from "./utils/MockUSDC.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";
import {IBondIssuer} from "../src/interfaces/IBondIssuer.sol";
import {TokenLib as TokenLibErrors} from "../src/TokenLib.sol";

// State machine edges, exact token payments, reentrancy, hostile receivers and conservation of money.
// Every payment is the USDC token (6 decimals); amounts are USDC base units.
contract InvoiceMarketSecurityTest is UsdcTestBase {
    InvoiceMarket internal market;

    address internal owner = address(this);
    address internal supplier = address(0xD00D);
    address internal buyerVault = address(0xBA11);
    address internal investor = address(0x1AAE);

    function setUp() public {
        vm.warp(1_800_000_000);
        market = new InvoiceMarket(1 days, address(usdc));
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
        _give(holder, price, address(market));
        vm.prank(holder);
        market.fund(id);
    }

    function _pay(uint256 id, uint256 face) internal {
        _give(buyerVault, face, address(market));
        vm.prank(buyerVault);
        market.payInvoice(id);
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
        _give(investor, 95, address(market));
        vm.prank(investor);
        vm.expectRevert(InvoiceMarket.InvoiceNotOpen.selector);
        market.fund(id);
    }

    // ---------- funding ----------

    function test_fund_pays_the_supplier_the_price_and_records_the_holder() public {
        uint256 id = _open(100e8, 95e8);
        _give(investor, 95e8, address(market));
        vm.prank(investor);
        market.fund(id);

        Invoice memory inv = market.getInvoice(id);
        assertEq(uint256(inv.status), uint256(Status.Funded), "funded");
        assertTrue(inv.holder == investor, "holder recorded");
        assertEq(usdc.balanceOf(supplier), 95e8, "supplier got the price");
        assertEq(usdc.balanceOf(address(market)), 0, "the market holds nothing yet");
    }

    function testFuzz_fund_moves_exactly_the_price_or_nothing(uint96 priceIn, uint96 balanceIn, uint96 allowanceIn) public {
        uint256 price = bound(priceIn, 1, 1e24);
        uint256 balance = bound(balanceIn, 0, 2e24);
        uint256 allowance = bound(allowanceIn, 0, 2e24);
        uint256 id = _open(price + 1e6, price);
        usdc.mint(investor, balance);
        vm.prank(investor);
        usdc.approve(address(market), allowance);

        bool enough = balance >= price && allowance >= price;
        vm.prank(investor);
        if (!enough) vm.expectRevert(TokenLibErrors.TokenTransferFailed.selector);
        market.fund(id);

        if (enough) {
            assertEq(usdc.balanceOf(supplier), price, "supplier got exactly the price");
            assertEq(usdc.balanceOf(investor), balance - price, "investor paid exactly the price");
        } else {
            assertEq(uint256(market.getInvoice(id).status), uint256(Status.Open), "still open");
            assertEq(usdc.balanceOf(supplier), 0, "supplier unpaid");
            assertEq(usdc.balanceOf(investor), balance, "investor kept everything");
        }
    }

    function test_funding_twice_and_after_the_due_date_reverts() public {
        uint256 id = _funded(100, 95, investor);
        _give(address(0x2), 95, address(market));
        vm.prank(address(0x2));
        vm.expectRevert(InvoiceMarket.InvoiceNotOpen.selector);
        market.fund(id);

        uint256 late = _open(100, 95);
        vm.warp(block.timestamp + 8 days);
        _give(investor, 95, address(market));
        vm.prank(investor);
        vm.expectRevert(InvoiceMarket.DueDatePassed.selector);
        market.fund(late);
    }

    function test_buy_is_the_same_as_fund() public {
        uint256 id = _open(100, 95);
        _give(investor, 95, address(market));
        vm.prank(investor);
        market.buy(id);
        assertTrue(market.getInvoice(id).holder == investor, "buy funds the invoice");
    }

    // ---------- repayment ----------

    function test_only_the_buyer_vault_repays_and_it_pays_exactly_the_face() public {
        uint256 id = _funded(100, 95, investor);

        _give(supplier, 100, address(market));
        vm.prank(supplier);
        vm.expectRevert(InvoiceMarket.OnlyBuyerVault.selector);
        market.payInvoice(id);

        // A vault without enough USDC cannot repay, and nothing changes.
        _give(buyerVault, 99, address(market));
        vm.prank(buyerVault);
        vm.expectRevert(TokenLibErrors.TokenTransferFailed.selector);
        market.payInvoice(id);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Funded), "still funded");
        assertEq(market.claimable(investor), 0, "nothing credited");

        usdc.mint(buyerVault, 101);
        vm.prank(buyerVault);
        market.payInvoice(id);
        assertEq(usdc.balanceOf(buyerVault), 100, "vault paid exactly the face amount (200 - 100)");
        assertEq(usdc.balanceOf(address(market)), 100, "market holds the repayment");
        assertEq(market.claimable(investor), 100, "holder credited the face amount");
    }

    function test_double_repayment_reverts_and_markPaid_is_the_same_function() public {
        uint256 id = _funded(100, 95, investor);
        _give(buyerVault, 200, address(market));
        vm.prank(buyerVault);
        market.markPaid(id);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Paid), "paid");

        vm.prank(buyerVault);
        vm.expectRevert(InvoiceMarket.InvoiceNotPayable.selector);
        market.payInvoice(id);
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
        _give(buyerVault, 100, address(market));
        vm.prank(buyerVault);
        vm.expectRevert(InvoiceMarket.InvoiceNotPayable.selector);
        market.payInvoice(dead);
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
        assertEq(usdc.balanceOf(investor), 100e8, "holder received the face amount");
        assertEq(usdc.balanceOf(address(market)), 0, "market emptied");

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
        uint256 id = _open(100e6, 95e6);
        _give(address(holder), 95e6, address(market));
        holder.fundInvoice(id);
        _pay(id, 100e6);

        usdc.setCallsBack(address(holder), true); // the token calls the holder on receipt; it tries to claim again
        holder.claimNow();
        assertEq(usdc.balanceOf(address(holder)), 100e6, "paid exactly once");
        assertTrue(holder.reentryBlocked(), "the nested claim was refused");
        assertTrue(!holder.reentrySucceeded(), "the nested claim did not succeed");
        assertEq(usdc.balanceOf(address(market)), 0, "market emptied");
    }

    function test_a_supplier_without_usdc_association_blocks_only_its_own_funding() public {
        address bad = address(0xBADD);
        usdc.setNotAssociated(bad, true); // on Hedera an account must associate USDC before it can receive it
        vm.prank(bad);
        uint256 id = market.createInvoice(buyerVault, 100, 95, uint64(block.timestamp + 7 days), bytes32(uint256(5)));
        vm.prank(buyerVault);
        market.acceptInvoice(id);

        _give(investor, 95, address(market));
        vm.prank(investor);
        vm.expectRevert(TokenLibErrors.TokenTransferFailed.selector);
        market.fund(id);

        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Open), "invoice unchanged");
        assertEq(usdc.balanceOf(investor), 95, "the investor keeps their money");
        assertEq(usdc.balanceOf(address(market)), 0, "nothing stuck in the market");

        // Other invoices are unaffected.
        uint256 ok = _open(100, 95);
        _give(investor, 95, address(market));
        vm.prank(investor);
        market.fund(ok);
        assertEq(usdc.balanceOf(supplier), 95, "a normal supplier is still paid");
    }

    function test_a_supplier_cannot_reenter_fund_to_steal() public {
        ReentrantSupplier evil = new ReentrantSupplier(market);
        vm.prank(address(evil));
        uint256 id = market.createInvoice(buyerVault, 100, 95, uint64(block.timestamp + 7 days), bytes32(uint256(6)));
        vm.prank(buyerVault);
        market.acceptInvoice(id);
        evil.setTarget(id);
        usdc.setCallsBack(address(evil), true);

        _give(investor, 190, address(market));
        vm.prank(investor);
        market.fund(id);

        assertEq(usdc.balanceOf(address(evil)), 95, "supplier received the price once");
        assertEq(usdc.balanceOf(investor), 95, "the investor paid once");
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
        _give(investor, 95, address(market));
        vm.prank(investor);
        vm.expectRevert(bytes("issuer down"));
        market.fund(id);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Open), "still open");

        market.setBondIssuer(address(0)); // owner can switch the hook off
        vm.prank(investor);
        market.fund(id);
    }

    function test_confirmIssued_is_restricted_and_needs_a_funded_invoice() public {
        uint256 id = _open(100, 95);
        vm.expectRevert(InvoiceMarket.InvoiceNotFunded.selector);
        market.confirmIssued(id, address(0xB0AD));

        _give(investor, 95, address(market));
        vm.prank(investor);
        market.fund(id);

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
        assertEq(usdc.balanceOf(supplier), price, "supplier got the price");
        _pay(id, face);
        vm.prank(investor);
        market.claim();

        assertEq(usdc.balanceOf(investor), face, "holder got the face amount");
        assertEq(usdc.balanceOf(address(market)), 0, "the market keeps nothing");
    }
}

contract ReentrantHolder is ITokenHook {
    InvoiceMarket internal immutable market;
    bool public reentryBlocked;
    bool public reentrySucceeded;

    constructor(InvoiceMarket m) {
        market = m;
    }

    function fundInvoice(uint256 id) external {
        market.fund(id);
    }

    function claimNow() external {
        market.claim();
    }

    function onTokenReceived() external {
        try market.claim() {
            reentrySucceeded = true;
        } catch {
            reentryBlocked = true;
        }
    }
}

contract ReentrantSupplier is ITokenHook {
    InvoiceMarket internal immutable market;
    uint256 internal target;
    bool public reentryBlocked;

    constructor(InvoiceMarket m) {
        market = m;
    }

    function setTarget(uint256 id) external {
        target = id;
    }

    function onTokenReceived() external {
        try market.fund(target) {} catch {
            reentryBlocked = true;
        }
    }
}

contract RevertingIssuer is IBondIssuer {
    function issue(address, uint256) external pure override {
        revert("issuer down");
    }
}
