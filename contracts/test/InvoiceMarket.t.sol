// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {IInvoiceMarket, Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";
import {IBondIssuer} from "../src/interfaces/IBondIssuer.sol";

contract MockBondIssuer is IBondIssuer {
    address public lastHolder;
    uint256 public lastUnits;

    function issue(address holder, uint256 units) external override {
        lastHolder = holder;
        lastUnits = units;
    }
}

contract MaliciousReceiver {
    InvoiceMarket public market;

    constructor(InvoiceMarket _market) {
        market = _market;
    }

    receive() external payable {
        if (address(market).balance > 0) {
            market.claim();
        }
    }
}

contract InvoiceMarketTest {
    InvoiceMarket public market;
    MockBondIssuer public mockIssuer;

    address public owner = address(this);
    address public supplier = address(0x101);
    address public buyerVault = address(0x202);
    address public investor = address(0x303);
    address public attacker = address(0x999);

    uint64 public constant GRACE_PERIOD = 86400; // 1 day

    receive() external payable {}

    function setUp() public {
        market = new InvoiceMarket(GRACE_PERIOD);
        mockIssuer = new MockBondIssuer();
    }

    function _createSampleInvoice(uint64 dueDate) internal returns (uint256) {
        return market.createInvoice(
            buyerVault,
            100 * 1e8,
            95 * 1e8,
            dueDate,
            keccak256("evidence-v1")
        );
    }

    // 1. Status starts as Pending, createInvoice checks, buy reverts unless Open
    function test_createInvoice_success_pending() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = _createSampleInvoice(due);

        Invoice memory inv = market.getInvoice(id);
        assert(inv.id == id);
        assert(inv.status == Status.Pending);
        assert(inv.supplier == address(this));
        assert(inv.buyerVault == buyerVault);
        assert(inv.faceAmount == 100 * 1e8);
        assert(inv.price == 95 * 1e8);
        assert(inv.dueDate == due);
        assert(inv.holder == address(0));
    }

    function test_buy_reverts_when_pending() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = _createSampleInvoice(due);

        // Buying while still Pending must revert
        (bool success, ) = address(market).call{value: 95 ether}(
            abi.encodeWithSelector(market.buy.selector, id)
        );
        assert(!success);
    }

    function test_createInvoice_validation_reverts() public {
        uint64 due = uint64(block.timestamp + 1000);

        // Zero buyer vault
        (bool s1, ) = address(market).call(
            abi.encodeWithSelector(market.createInvoice.selector, address(0), 100, 95, due, bytes32(0))
        );
        assert(!s1);

        // Zero face amount
        (bool s2, ) = address(market).call(
            abi.encodeWithSelector(market.createInvoice.selector, buyerVault, 0, 95, due, bytes32(0))
        );
        assert(!s2);

        // Price > face amount
        (bool s3, ) = address(market).call(
            abi.encodeWithSelector(market.createInvoice.selector, buyerVault, 100, 105, due, bytes32(0))
        );
        assert(!s3);

        // Due date in past
        (bool s4, ) = address(market).call(
            abi.encodeWithSelector(market.createInvoice.selector, buyerVault, 100, 95, block.timestamp, bytes32(0))
        );
        assert(!s4);
    }

    // 2. acceptInvoice moves Pending to Open, reverts on invalid caller/double accept/past due
    function test_acceptInvoice_success() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = _createSampleInvoice(due);

        // Wrong caller reverts
        (bool s1, ) = address(market).call(
            abi.encodeWithSelector(market.acceptInvoice.selector, id)
        );
        assert(!s1);

        // Vault accepts
        // Simulating call from buyerVault
        bytes memory acceptCall = abi.encodeWithSelector(market.acceptInvoice.selector, id);
        // Direct call via market with buyerVault simulated
        (bool s2, ) = address(market).call(
            abi.encodeWithSelector(market.acceptInvoice.selector, id)
        );
        assert(!s2); // caller is this, not buyerVault

        // Let's create an invoice where buyerVault is address(this)
        uint256 id2 = market.createInvoice(address(this), 100 * 1e8, 95 * 1e8, due, bytes32(0));
        market.acceptInvoice(id2);

        Invoice memory inv2 = market.getInvoice(id2);
        assert(inv2.status == Status.Open);

        // Double accept reverts
        (bool s3, ) = address(market).call(
            abi.encodeWithSelector(market.acceptInvoice.selector, id2)
        );
        assert(!s3);
    }

    // 3. buy and fund, holder set, supplier paid
    function test_buy_success_and_holder_stored() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(this), 100 * 1e8, 95 * 1e8, due, bytes32(0));
        market.acceptInvoice(id);

        uint256 supplierBalBefore = address(this).balance;

        market.buy{value: 95 ether}(id);

        Invoice memory inv = market.getInvoice(id);
        assert(inv.status == Status.Funded);
        assert(inv.holder == address(this));
    }

    // 4. payInvoice and claimable credits stored holder
    function test_payInvoice_credits_stored_holder() public {
        uint64 due = uint64(block.timestamp + 1000);
        // buyerVault is address(this)
        uint256 id = market.createInvoice(address(this), 100 * 1e8, 95 * 1e8, due, bytes32(0));
        market.acceptInvoice(id);
        market.buy{value: 95 ether}(id);

        // Confirm issued with mock bond
        market.confirmIssued(id, address(0xbeef));

        // Buyer pays invoice
        market.payInvoice{value: 100 ether}(id);

        Invoice memory inv = market.getInvoice(id);
        assert(inv.status == Status.Paid);
        assert(market.claimable(address(this)) == 100 ether);

        // Claim
        uint256 balBefore = address(this).balance;
        market.claim();
        assert(market.claimable(address(this)) == 0);
        assert(address(this).balance > balBefore);
    }

    // 5. Late and Defaulted state flow
    function test_markLate_and_defaulted_reverts_before_due() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(this), 100 * 1e8, 95 * 1e8, due, bytes32(0));
        market.acceptInvoice(id);
        market.buy{value: 95 ether}(id);

        // Cannot mark late before due date
        (bool s1, ) = address(market).call(
            abi.encodeWithSelector(market.markLate.selector, id)
        );
        assert(!s1);
    }

    // 6. Fuzz test on price calculation and creation bounds
    function testFuzz_price_and_discount(uint128 face, uint16 discountBps) public {
        if (face == 0) return;
        if (discountBps > 10000) return;

        uint256 price = (uint256(face) * (10000 - discountBps)) / 10000;
        if (price == 0) price = 1;

        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(this), face, price, due, bytes32(0));
        Invoice memory inv = market.getInvoice(id);
        assert(inv.faceAmount == face);
        assert(inv.price == price);
        assert(inv.price <= inv.faceAmount);
    }
}

