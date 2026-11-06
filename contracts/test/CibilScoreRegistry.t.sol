// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CibilScoreRegistry} from "../src/CibilScoreRegistry.sol";
import {ICibilScoreRegistry} from "../src/interfaces/ICibilScoreRegistry.sol";

contract CibilScoreRegistryTest {
    CibilScoreRegistry public registry;

    address public supplier = address(0x1111);
    address public buyer = address(0x2222);
    address public attester = address(0x3333);

    function setUp() public {
        registry = new CibilScoreRegistry();
        registry.setAttester(attester, true);
    }

    function test_initial_unrated() public view {
        ICibilScoreRegistry.ScoreRecord memory rec = registry.getScore(supplier);
        assert(rec.score == 0);
        assert(rec.tier == ICibilScoreRegistry.CibilTier.New);
    }

    function test_attest_score_success() public {
        bytes32 hash = keccak256("evidence-123");
        registry.attestScore(
            supplier,
            ICibilScoreRegistry.PartyRole.Supplier,
            780,
            ICibilScoreRegistry.CibilTier.Excellent,
            12,
            12,
            0,
            hash
        );

        ICibilScoreRegistry.ScoreRecord memory rec = registry.getScore(supplier);
        assert(rec.score == 780);
        assert(rec.tier == ICibilScoreRegistry.CibilTier.Excellent);
        assert(rec.totalInvoices == 12);
        assert(rec.settledInvoices == 12);
        assert(rec.defaultedInvoices == 0);
        assert(rec.evidenceHash == hash);
    }

    function test_investment_grade_check() public {
        registry.attestScore(
            supplier,
            ICibilScoreRegistry.PartyRole.Supplier,
            800,
            ICibilScoreRegistry.CibilTier.Excellent,
            10,
            10,
            0,
            bytes32(0)
        );

        registry.attestScore(
            buyer,
            ICibilScoreRegistry.PartyRole.Buyer,
            750,
            ICibilScoreRegistry.CibilTier.Excellent,
            5,
            5,
            0,
            bytes32(0)
        );

        assert(registry.isInvestmentGrade(supplier, buyer) == true);
    }

    function test_investment_grade_rejects_default() public {
        registry.attestScore(
            supplier,
            ICibilScoreRegistry.PartyRole.Supplier,
            800,
            ICibilScoreRegistry.CibilTier.Excellent,
            10,
            10,
            0,
            bytes32(0)
        );

        registry.attestScore(
            buyer,
            ICibilScoreRegistry.PartyRole.Buyer,
            500,
            ICibilScoreRegistry.CibilTier.Poor,
            5,
            4,
            1, // 1 default!
            bytes32(0)
        );

        assert(registry.isInvestmentGrade(supplier, buyer) == false);
    }
}

