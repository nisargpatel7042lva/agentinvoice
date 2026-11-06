// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerVault} from "../src/BuyerVault.sol";
import {Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";

// The approval path (EIP-712 LargePayment signed by the verifier), the daily limit, the market allowlist and the access rules.
// Amounts use tinybar scale (1 HBAR = 1e8), the unit the contracts use inside the Hedera EVM.
contract BuyerVaultApprovalTest is TestBase {
    InvoiceMarket internal market;
    BuyerVault internal vault;

    uint256 internal constant VERIFIER_PK = 0xC0DE;
    uint256 internal constant OTHER_PK = 0xBAD;
    uint256 internal constant DAILY = 200e8;
    uint256 internal constant THRESHOLD = 50e8;
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    address internal owner = address(0x0A11CE);
    address internal agent = address(0xB0B);
    address internal supplier = address(0xD00D);
    address internal investor = address(0x1AAE);
    address internal verifier;

    function setUp() public {
        verifier = vm.addr(VERIFIER_PK);
        vm.warp(1_800_000_000);
        market = new InvoiceMarket(1 days);
        vault = new BuyerVault(owner, agent, verifier, DAILY, THRESHOLD);
        vm.deal(address(vault), 1000e8);
        vm.startPrank(owner);
        vault.allowSupplier(supplier, 500e8);
        vault.allowMarket(address(market), true);
        vm.stopPrank();
    }

    // ---------- helpers ----------

    function _price(uint256 face) internal pure returns (uint256) {
        return face - face / 20; // 5% discount
    }

    function _openFunded(uint256 face) internal returns (uint256 id) {
        vm.prank(supplier);
        id = market.createInvoice(address(vault), face, _price(face), uint64(block.timestamp + 7 days), keccak256(abi.encode(face, block.timestamp)));
        vm.prank(agent);
        vault.accept(address(market), id);
        vm.deal(investor, _price(face));
        vm.prank(investor);
        market.fund{value: _price(face)}(id);
    }

    function _digest(uint256 id, uint256 amount, uint256 nonce, uint256 expiry) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("BuyerVault")),
                keccak256(bytes("1")),
                block.chainid,
                address(vault)
            )
        );
        bytes32 structHash = keccak256(abi.encode(vault.LARGE_PAYMENT_TYPEHASH(), address(vault), id, amount, nonce, expiry));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sig(uint256 pk, uint256 id, uint256 amount, uint256 nonce, uint256 expiry) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        return vm.sign(pk, _digest(id, amount, nonce, expiry));
    }

    // abi.encode(nonce, expiry, signature), the format BuyerVault.payInvoice expects
    function _approval(uint256 pk, uint256 id, uint256 amount, uint256 nonce, uint256 expiry) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = _sig(pk, id, amount, nonce, expiry);
        return abi.encode(nonce, expiry, abi.encodePacked(r, s, v));
    }

    function _pay(uint256 id, bytes memory approval) internal {
        vm.prank(agent);
        vault.payInvoice(address(market), id, approval);
    }

    // ---------- approval path ----------

    function test_above_threshold_pays_with_a_valid_approval() public {
        uint256 face = THRESHOLD + 10e8;
        uint256 id = _openFunded(face);
        uint256 balanceBefore = address(vault).balance;

        _pay(id, _approval(VERIFIER_PK, id, face, 1, block.timestamp + 600));

        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Paid), "invoice paid");
        assertEq(address(vault).balance, balanceBefore - face, "vault paid exactly the face amount");
        assertEq(market.claimable(investor), face, "holder can claim the face amount");
        assertTrue(vault.usedNonces(1), "nonce consumed");
        assertEq(vault.spentToday(), face, "counts toward the daily limit");
    }

    function test_threshold_boundary_equal_needs_no_approval_one_more_does() public {
        uint256 atThreshold = _openFunded(THRESHOLD);
        _pay(atThreshold, "");
        assertEq(uint256(market.getInvoice(atThreshold).status), uint256(Status.Paid), "paid without approval at the threshold");

        uint256 above = _openFunded(THRESHOLD + 1);
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(above, "");
    }

    function test_wrong_signer_is_rejected() public {
        uint256 face = THRESHOLD + 1e8;
        uint256 id = _openFunded(face);
        bytes memory approval = _approval(OTHER_PK, id, face, 1, block.timestamp + 600);
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(id, approval);
    }

    function test_expired_approval_is_rejected_but_the_expiry_second_is_valid() public {
        uint256 face = THRESHOLD + 1e8;
        uint256 id = _openFunded(face);
        uint256 expiry = block.timestamp + 600;
        bytes memory approval = _approval(VERIFIER_PK, id, face, 1, expiry);

        vm.warp(expiry + 1);
        vm.expectRevert(BuyerVault.ApprovalExpired.selector);
        _pay(id, approval);

        vm.warp(expiry); // block.timestamp == expiry is still valid
        _pay(id, approval);
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Paid), "paid on the expiry second");
    }

    function test_a_nonce_works_once_even_for_another_invoice() public {
        uint256 faceA = THRESHOLD + 1e8;
        uint256 faceB = THRESHOLD + 2e8;
        uint256 idA = _openFunded(faceA);
        uint256 idB = _openFunded(faceB);
        _pay(idA, _approval(VERIFIER_PK, idA, faceA, 7, block.timestamp + 600));

        bytes memory reused = _approval(VERIFIER_PK, idB, faceB, 7, block.timestamp + 600); // valid signature, used nonce
        vm.expectRevert(BuyerVault.NonceAlreadyUsed.selector);
        _pay(idB, reused);
    }

    function test_an_approval_is_bound_to_its_invoice_and_amount() public {
        uint256 face = THRESHOLD + 1e8;
        uint256 idA = _openFunded(face);
        uint256 idB = _openFunded(face);

        bytes memory forA = _approval(VERIFIER_PK, idA, face, 1, block.timestamp + 600);
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(idB, forA); // signed for invoice A, used on B

        bytes memory wrongAmount = _approval(VERIFIER_PK, idB, face - 1, 2, block.timestamp + 600);
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(idB, wrongAmount); // signed for a different amount
    }

    function test_an_approval_never_lifts_the_daily_limit() public {
        uint256 face = DAILY + 10e8; // above the daily limit, within the supplier limit
        uint256 id = _openFunded(face);
        bytes memory approval = _approval(VERIFIER_PK, id, face, 1, block.timestamp + 600);
        vm.expectRevert(BuyerVault.DailyLimitExceeded.selector);
        _pay(id, approval);
    }

    function test_daily_limit_accumulates_and_resets_the_next_day() public {
        for (uint256 i = 0; i < 4; i++) {
            _pay(_openFunded(THRESHOLD), ""); // 4 x 50 = 200 = the limit
        }
        assertEq(vault.spentToday(), DAILY, "limit reached");

        uint256 fifth = _openFunded(THRESHOLD);
        vm.expectRevert(BuyerVault.DailyLimitExceeded.selector);
        _pay(fifth, "");

        vm.warp(block.timestamp + 1 days);
        assertEq(vault.spentToday(), 0, "a new day starts at zero");
        _pay(fifth, "");
    }

    function test_malleable_signatures_are_rejected() public {
        uint256 face = THRESHOLD + 1e8;
        uint256 id = _openFunded(face);
        uint256 expiry = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _sig(VERIFIER_PK, id, face, 1, expiry);

        // the same signature with the "high s" twin: recovers to the same signer, so it must be refused explicitly
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(id, abi.encode(uint256(1), expiry, abi.encodePacked(r, highS, flippedV)));

        // an invalid recovery id
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(id, abi.encode(uint256(1), expiry, abi.encodePacked(r, s, uint8(29))));

        // the original still works
        _pay(id, abi.encode(uint256(1), expiry, abi.encodePacked(r, s, v)));
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Paid), "original signature accepted");
    }

    function test_a_signature_of_the_wrong_length_is_rejected() public {
        uint256 id = _openFunded(THRESHOLD + 1e8);
        vm.expectRevert(BuyerVault.InvalidApproval.selector);
        _pay(id, abi.encode(uint256(1), block.timestamp + 600, hex"deadbeef"));
    }

    // ---------- access control and freezing ----------

    function test_only_the_agent_pays_and_a_frozen_vault_pays_nobody() public {
        uint256 id = _openFunded(THRESHOLD);

        vm.prank(supplier);
        vm.expectRevert(BuyerVault.Unauthorized.selector);
        vault.payInvoice(address(market), id, "");

        vm.prank(owner);
        vault.freeze();
        vm.expectRevert(BuyerVault.VaultFrozen.selector);
        _pay(id, "");

        vm.prank(owner);
        vault.unfreeze();
        _pay(id, "");
        assertEq(uint256(market.getInvoice(id).status), uint256(Status.Paid), "paid after unfreeze");
    }

    function test_only_the_owner_sets_limits_suppliers_markets_and_withdraws() public {
        vm.startPrank(agent);
        vm.expectRevert(BuyerVault.Unauthorized.selector);
        vault.setLimits(1, 1);
        vm.expectRevert(BuyerVault.Unauthorized.selector);
        vault.allowSupplier(address(1), 1);
        vm.expectRevert(BuyerVault.Unauthorized.selector);
        vault.allowMarket(address(1), true);
        vm.expectRevert(BuyerVault.Unauthorized.selector);
        vault.withdraw(1);
        vm.stopPrank();

        vm.prank(owner);
        vm.expectRevert(BuyerVault.ZeroAddress.selector);
        vault.allowMarket(address(0), true);
    }

    function test_withdraw_sends_exactly_the_amount_to_the_owner() public {
        uint256 before_ = owner.balance;
        vm.prank(owner);
        vault.withdraw(10e8);
        assertEq(owner.balance, before_ + 10e8, "owner received");
        assertEq(address(vault).balance, 990e8, "vault balance reduced");
    }

    // ---------- the market allowlist ----------

    function test_a_market_the_owner_did_not_allow_is_never_called() public {
        InvoiceMarket other = new InvoiceMarket(1 days);
        vm.prank(supplier);
        uint256 id = other.createInvoice(address(vault), 10e8, 9e8, uint64(block.timestamp + 1 days), bytes32(uint256(1)));
        vm.prank(agent);
        vm.expectRevert(BuyerVault.MarketNotAllowed.selector);
        vault.accept(address(other), id);
    }

    function test_disallowing_a_market_blocks_payment_of_invoices_already_accepted() public {
        uint256 id = _openFunded(THRESHOLD);
        vm.prank(owner);
        vault.allowMarket(address(market), false);
        vm.expectRevert(BuyerVault.MarketNotAllowed.selector);
        _pay(id, "");
    }

    function test_a_fake_market_cannot_drain_the_vault() public {
        FakeMarket fake = new FakeMarket(supplier, 100e8);
        uint256 balanceBefore = address(vault).balance;

        vm.prank(agent);
        vm.expectRevert(BuyerVault.MarketNotAllowed.selector);
        vault.accept(address(fake), 1);

        assertEq(address(vault).balance, balanceBefore, "nothing left the vault");
        assertEq(address(fake).balance, 0, "the fake market received nothing");
    }
}

// A market that lies: reports an allowlisted supplier and a large invoice, and keeps whatever it is paid.
contract FakeMarket {
    address internal immutable supplier;
    uint256 internal immutable face;

    constructor(address _supplier, uint256 _face) {
        supplier = _supplier;
        face = _face;
    }

    function getInvoice(uint256 id) external view returns (Invoice memory inv) {
        inv.id = id;
        inv.supplier = supplier;
        inv.buyerVault = msg.sender;
        inv.faceAmount = face;
        inv.price = face;
        inv.status = Status.Open;
    }

    function acceptInvoice(uint256) external {}

    function payInvoice(uint256) external payable {}
}
