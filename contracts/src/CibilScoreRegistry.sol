// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICibilScoreRegistry} from "./interfaces/ICibilScoreRegistry.sol";

contract CibilScoreRegistry is ICibilScoreRegistry {
    error Unauthorized();
    error InvalidScore();
    error ZeroAddress();

    address public owner;
    mapping(address => bool) public authorizedAttesters;
    mapping(address => ScoreRecord) private scores;

    event AttesterUpdated(address indexed attester, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAttester() {
        if (msg.sender != owner && !authorizedAttesters[msg.sender]) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedAttesters[msg.sender] = true;
    }

    function setAttester(address attester, bool authorized) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        authorizedAttesters[attester] = authorized;
        emit AttesterUpdated(attester, authorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function attestScore(
        address party,
        PartyRole role,
        uint16 score,
        CibilTier tier,
        uint64 totalInvoices,
        uint64 settledInvoices,
        uint64 defaultedInvoices,
        bytes32 evidenceHash
    ) external override onlyAttester {
        if (party == address(0)) revert ZeroAddress();
        if (score > 900) revert InvalidScore();
        if (score > 0 && score < 300) revert InvalidScore();

        scores[party] = ScoreRecord({
            score: score,
            tier: tier,
            totalInvoices: totalInvoices,
            settledInvoices: settledInvoices,
            defaultedInvoices: defaultedInvoices,
            lastUpdatedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash
        });

        emit ScoreAttested(
            party,
            role,
            score,
            tier,
            totalInvoices,
            settledInvoices,
            defaultedInvoices,
            evidenceHash
        );
    }

    function getScore(address party) external view override returns (ScoreRecord memory) {
        return scores[party];
    }

    function isInvestmentGrade(address supplier, address buyer) external view override returns (bool) {
        ScoreRecord memory s = scores[supplier];
        ScoreRecord memory b = scores[buyer];

        bool sOk = (s.tier == CibilTier.Excellent || s.tier == CibilTier.Good || (s.tier == CibilTier.New && s.defaultedInvoices == 0));
        bool bOk = (b.tier == CibilTier.Excellent || b.tier == CibilTier.Good || (b.tier == CibilTier.New && b.defaultedInvoices == 0));
        return sOk && bOk && s.defaultedInvoices == 0 && b.defaultedInvoices == 0;
    }
}

