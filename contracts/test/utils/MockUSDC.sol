// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";

interface ITokenHook {
    function onTokenReceived() external;
}

/// Test stand-in for SaucerSwap testnet USDC (HTS 0.0.5449, 6 decimals) with the two Hedera behaviours that matter:
/// - an account that has not associated the token cannot receive it (setNotAssociated), like HTS;
/// - associate() exists (HIP-719) and clears that flag for the caller.
/// callsBack lets a test make the token call the recipient on receipt, to prove the contracts resist reentrancy anyway.
contract MockUSDC {
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public notAssociated;
    mapping(address => bool) public callsBack;
    uint256 public associateCalls;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setNotAssociated(address account, bool value) external {
        notAssociated[account] = value;
    }

    function setCallsBack(address account, bool value) external {
        callsBack[account] = value;
    }

    function associate() external returns (uint256) {
        associateCalls++;
        notAssociated[msg.sender] = false;
        return 22; // HTS SUCCESS
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "SPENDER_DOES_NOT_HAVE_ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(!notAssociated[to], "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT");
        require(balanceOf[from] >= amount, "INSUFFICIENT_TOKEN_BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        if (callsBack[to]) ITokenHook(to).onTokenReceived();
    }
}

/// TestBase plus a USDC token and a helper that funds an account and approves a spender for it.
abstract contract UsdcTestBase is TestBase {
    MockUSDC internal usdc = new MockUSDC();

    function _give(address who, uint256 amount, address spender) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(spender, type(uint256).max);
    }
}
