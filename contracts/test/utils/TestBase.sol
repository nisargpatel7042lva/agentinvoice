// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal Foundry cheatcode interface and helpers, because the repo does not vendor forge-std.
interface Vm {
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 privateKey) external pure returns (address);
    function warp(uint256 timestamp) external;
    function prank(address who) external;
    function startPrank(address who) external;
    function stopPrank() external;
    function deal(address who, uint256 amount) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 a, uint256 b, string memory what) internal pure {
        require(a == b, what);
    }

    function assertTrue(bool c, string memory what) internal pure {
        require(c, what);
    }

    // Maps x into [min, max] (same idea as forge-std's bound, so fuzz inputs are never discarded).
    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        require(min <= max, "bound: min > max");
        if (x >= min && x <= max) return x;
        uint256 size = max - min + 1;
        if (size == 0) return x; // full uint256 range
        return min + (x % size);
    }
}
