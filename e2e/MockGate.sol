// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// Test-only Vault V2 gate (IGate.sol): an allowlist the e2e test edits. Used as both receiveSharesGate and
/// sendAssetsGate of a "gated" vault, like curator-restricted vaults on mainnet.
contract MockGate {
    mapping(address => bool) public allowed;
    function set(address a, bool ok) external { allowed[a] = ok; }
    function canReceiveShares(address a) external view returns (bool) { return allowed[a]; }
    function canSendAssets(address a) external view returns (bool) { return allowed[a]; }
}
