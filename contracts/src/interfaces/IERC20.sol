// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// The ERC-20 subset we use. On Hedera every HTS fungible token (USDC 0.0.5449 here) answers these calls at its long-zero
// EVM address (HIP-218 / HIP-376), so the contracts treat USDC like any ERC-20.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

// HIP-719: an account (contract or wallet) associates itself with an HTS token by calling associate() on the token's address.
// On a local EVM there is no such function; callers treat a failed call as "not needed".
interface IHRC719 {
    function associate() external returns (uint256 responseCode);
}
