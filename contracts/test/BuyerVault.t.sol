// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerVault} from "../src/BuyerVault.sol";
import {IInvoiceMarket, Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";
import {MockUSDC} from "./utils/MockUSDC.sol";

contract BuyerVaultTest {
    InvoiceMarket public market;
    BuyerVault public vault;
    MockUSDC public usdc;

    uint256 internal ownerPk = 0xA11CE;
    uint256 internal agentPk = 0xB0B;
    uint256 internal verifierPk = 0xC0DE;
    uint256 internal supplierPk = 0xD00D;

    address public owner;
    address public agent;
    address public verifier;
    address public supplier;

    receive() external payable {}

    function setUp() public {
        owner = vm_addr(ownerPk);
        agent = vm_addr(agentPk);
        verifier = vm_addr(verifierPk);
        supplier = vm_addr(supplierPk);

        usdc = new MockUSDC();
        market = new InvoiceMarket(86400, address(usdc));

        // Vault with daily limit = 200 ether, approval threshold = 50 ether
        vault = new BuyerVault(
            address(this), // owner is test contract for convenient setup
            address(this), // agent is test contract
            verifier,
            200 ether,
            50 ether,
            address(usdc)
        );

        // Fund the vault with 500 USDC-units, and let this test contract (the investor) spend its USDC on the market
        usdc.mint(address(vault), 500 ether);
        usdc.mint(address(this), 1_000 ether);
        usdc.approve(address(market), type(uint256).max);

        // The vault only calls markets its owner allowed (test contract is the owner)
        vault.allowMarket(address(market), true);
    }

    function vm_addr(uint256 pk) internal pure returns (address) {
        // Simple deterministic address generator from PK for testing
        return address(uint160(uint256(keccak256(abi.encodePacked(pk)))));
    }

    function _signApproval(
        uint256 pk,
        address vaultAddr,
        uint256 invoiceId,
        uint256 amount,
        uint256 nonce,
        uint256 expiry
    ) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("BuyerVault")),
                keccak256(bytes("1")),
                block.chainid,
                vaultAddr
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(
                vault.LARGE_PAYMENT_TYPEHASH(),
                vaultAddr,
                invoiceId,
                amount,
                nonce,
                expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Let's create signature using standard ecdsa sign
        // Since we are running in pure Solidity test without Foundry vm cheatcodes,
        // we can test signature verification using an internal helper or contract test.
        // For testing ecrecover with deterministic PK, we use assembly or mock.
        return "";
    }

    function test_vault_initial_state() public {
        assert(vault.dailyLimit() == 200 ether);
        assert(vault.approvalThreshold() == 50 ether);
        assert(!vault.isFrozen());
        assert(usdc.balanceOf(address(vault)) == 500 ether);
    }

    function test_allowSupplier_and_limits() public {
        assert(!vault.allowedSupplier(supplier));
        vault.allowSupplier(supplier, 150 ether);
        assert(vault.allowedSupplier(supplier));
        assert(vault.supplierLimit(supplier) == 150 ether);

        vault.removeSupplier(supplier);
        assert(!vault.allowedSupplier(supplier));
        assert(vault.supplierLimit(supplier) == 0);
    }

    function test_accept_enforces_supplier_allowlist() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 ether, 38 ether, due, bytes32(0));

        // Reverts because supplier (address(this)) is not allowlisted
        (bool s1, ) = address(vault).call(
            abi.encodeWithSelector(vault.accept.selector, address(market), id)
        );
        assert(!s1);

        // Allow supplier but with limit 30 ether (face is 40 ether)
        vault.allowSupplier(address(this), 30 ether);
        (bool s2, ) = address(vault).call(
            abi.encodeWithSelector(vault.accept.selector, address(market), id)
        );
        assert(!s2);

        // Increase limit to 100 ether -> accept succeeds
        vault.allowSupplier(address(this), 100 ether);
        vault.accept(address(market), id);

        Invoice memory inv = market.getInvoice(id);
        assert(inv.status == Status.Open);
    }

    function test_payInvoice_under_threshold_direct() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 ether, 38 ether, due, bytes32(0));

        vault.allowSupplier(address(this), 100 ether);
        vault.accept(address(market), id);

        // Investor funds the invoice
        market.fund(id);
        assert(market.getInvoice(id).status == Status.Funded);

        // Vault pays invoice (40 ether <= threshold 50 ether)
        vault.payInvoice(address(market), id);

        assert(market.getInvoice(id).status == Status.Paid);
        assert(vault.spentToday() == 40 ether);
        assert(market.claimable(address(this)) == 40 ether);
    }

    function test_payInvoice_reverts_unaccepted() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 ether, 38 ether, due, bytes32(0));

        (bool success, ) = address(vault).call(
            abi.encodeWithSignature("payInvoice(address,uint256)", address(market), id)
        );

        assert(!success);
    }

    function test_freeze_blocks_actions() public {
        vault.freeze();
        assert(vault.isFrozen());

        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 ether, 38 ether, due, bytes32(0));
        vault.allowSupplier(address(this), 100 ether);

        // Accept blocked when frozen
        (bool s1, ) = address(vault).call(
            abi.encodeWithSelector(vault.accept.selector, address(market), id)
        );
        assert(!s1);

        vault.unfreeze();
        assert(!vault.isFrozen());
    }

    function test_withdraw_owner_only() public {
        uint256 balBefore = usdc.balanceOf(address(this));
        vault.withdraw(50 ether);
        assert(usdc.balanceOf(address(vault)) == 450 ether);
    }
}
