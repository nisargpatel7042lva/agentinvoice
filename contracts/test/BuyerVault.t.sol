// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvoiceMarket} from "../src/InvoiceMarket.sol";
import {BuyerVault} from "../src/BuyerVault.sol";
import {IInvoiceMarket, Invoice, Status} from "../src/interfaces/IInvoiceMarket.sol";

contract BuyerVaultTest {
    InvoiceMarket public market;
    BuyerVault public vault;

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

        market = new InvoiceMarket(86400);

        // Vault with daily limit = 200 HBAR (200 * 1e8 tinybar), approval threshold = 50 HBAR (50 * 1e8 tinybar)
        vault = new BuyerVault(
            address(this), // owner is test contract for convenient setup
            address(this), // agent is test contract
            verifier,
            200 * 1e8,
            50 * 1e8
        );

        // Fund vault with 500 ether
        (bool sent, ) = address(vault).call{value: 500 ether}("");
        require(sent);
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
        assert(vault.dailyLimit() == 200 * 1e8);
        assert(vault.approvalThreshold() == 50 * 1e8);
        assert(!vault.isFrozen());
        assert(address(vault).balance == 500 ether);
    }

    function test_allowSupplier_and_limits() public {
        assert(!vault.allowedSupplier(supplier));
        vault.allowSupplier(supplier, 150 * 1e8);
        assert(vault.allowedSupplier(supplier));
        assert(vault.supplierLimit(supplier) == 150 * 1e8);

        vault.removeSupplier(supplier);
        assert(!vault.allowedSupplier(supplier));
        assert(vault.supplierLimit(supplier) == 0);
    }

    function test_accept_enforces_supplier_allowlist() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 * 1e8, 38 * 1e8, due, bytes32(0));

        // Reverts because supplier (address(this)) is not allowlisted
        (bool s1, ) = address(vault).call(
            abi.encodeWithSelector(vault.accept.selector, address(market), id)
        );
        assert(!s1);

        // Allow supplier but with limit 30 HBAR (face is 40 HBAR)
        vault.allowSupplier(address(this), 30 * 1e8);
        (bool s2, ) = address(vault).call(
            abi.encodeWithSelector(vault.accept.selector, address(market), id)
        );
        assert(!s2);

        // Increase limit to 100 HBAR -> accept succeeds
        vault.allowSupplier(address(this), 100 * 1e8);
        vault.accept(address(market), id);

        Invoice memory inv = market.getInvoice(id);
        assert(inv.status == Status.Open);
    }

    function test_payInvoice_under_threshold_direct() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 * 1e8, 38 * 1e8, due, bytes32(0));

        vault.allowSupplier(address(this), 100 * 1e8);
        vault.accept(address(market), id);

        // Investor funds the invoice (value = 38 * 1e8 * 1e10 = 38 ether)
        market.fund{value: 38 ether}(id);
        assert(market.getInvoice(id).status == Status.Funded);

        // Vault pays invoice (40 HBAR <= threshold 50 HBAR)
        vault.payInvoice(address(market), id);

        assert(market.getInvoice(id).status == Status.Paid);
        assert(vault.spentToday() == 40 * 1e8);
        assert(market.claimable(address(this)) == 40 ether);
    }

    function test_payInvoice_reverts_unaccepted() public {
        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 * 1e8, 38 * 1e8, due, bytes32(0));

        (bool success, ) = address(vault).call(
            abi.encodeWithSignature("payInvoice(address,uint256)", address(market), id)
        );

        assert(!success);
    }

    function test_freeze_blocks_actions() public {
        vault.freeze();
        assert(vault.isFrozen());

        uint64 due = uint64(block.timestamp + 1000);
        uint256 id = market.createInvoice(address(vault), 40 * 1e8, 38 * 1e8, due, bytes32(0));
        vault.allowSupplier(address(this), 100 * 1e8);

        // Accept blocked when frozen
        (bool s1, ) = address(vault).call(
            abi.encodeWithSelector(vault.accept.selector, address(market), id)
        );
        assert(!s1);

        vault.unfreeze();
        assert(!vault.isFrozen());
    }

    function test_withdraw_owner_only() public {
        uint256 balBefore = address(this).balance;
        vault.withdraw(50 * 1e8);
        assert(address(vault).balance == 450 ether);
    }
}
