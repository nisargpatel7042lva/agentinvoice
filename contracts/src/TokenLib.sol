// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, IHRC719} from "./interfaces/IERC20.sol";

/// Safe token transfers (tokens may return nothing or false instead of reverting) and HTS self-association.
library TokenLib {
    error TokenTransferFailed();

    function safeTransfer(address token, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
    }

    function safeApprove(address token, address spender, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(IERC20.approve.selector, spender, amount));
    }

    /// Associates the calling contract with an HTS token so it can hold it. Returns false where that does not apply
    /// (a plain ERC-20 on a local chain), and never reverts: association is a Hedera-only precondition, not a business rule.
    function associateSelf(address token) internal returns (bool ok) {
        (ok, ) = token.call(abi.encodeWithSelector(IHRC719.associate.selector));
    }

    function _call(address token, bytes memory data) private {
        if (token.code.length == 0 && !_isHtsLongZero(token)) revert TokenTransferFailed();
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    // HTS token addresses (0x000…0000<id>) can report empty code to EXTCODESIZE on some Hedera versions.
    function _isHtsLongZero(address token) private pure returns (bool) {
        return uint160(token) < 2 ** 64;
    }
}
