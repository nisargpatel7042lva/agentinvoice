// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBondIssuer {
    function issue(address holder, uint256 units) external;
}

