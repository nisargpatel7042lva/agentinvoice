// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICibilScoreRegistry {
    enum PartyRole { Supplier, Buyer }
    enum CibilTier { New, Poor, Fair, Good, Excellent }

    struct ScoreRecord {
        uint16 score; // 300 to 900 (0 for unrated/new)
        CibilTier tier;
        uint64 totalInvoices;
        uint64 settledInvoices;
        uint64 defaultedInvoices;
        uint64 lastUpdatedAt;
        bytes32 evidenceHash;
    }

    event ScoreAttested(
        address indexed party,
        PartyRole indexed role,
        uint16 score,
        CibilTier tier,
        uint64 totalInvoices,
        uint64 settledInvoices,
        uint64 defaultedInvoices,
        bytes32 evidenceHash
    );

    function attestScore(
        address party,
        PartyRole role,
        uint16 score,
        CibilTier tier,
        uint64 totalInvoices,
        uint64 settledInvoices,
        uint64 defaultedInvoices,
        bytes32 evidenceHash
    ) external;

    function getScore(address party) external view returns (ScoreRecord memory);
    function isInvestmentGrade(address supplier, address buyer) external view returns (bool);
}

