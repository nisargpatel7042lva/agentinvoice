# ENSv2 on Sepolia: notes (task 1.8)

Source: ENS docs read once on 2026-11-06 by a web-fetch subagent. Pages: docs.ens.domains/ensv2/{permissioned-registry, permissioned-resolver, enhanced-access-control, tutorial-contract-developers, verifiable-factory, subnames, eth-registrar} and /learn/deployments. Anything NOT FOUND or UNVERIFIED must be checked against the contract ABIs before use. The ENS mentor still has to confirm the current Sepolia addresses.

## How it works

- **Permissioned Registry:** each name is an ERC1155Singleton token with one owner. All permissions go through Enhanced Access Control (EAC). An entry holds `expiry` (uint64, absolute timestamp), `resolver`, `subregistry`, `eacVersionId`, `tokenVersionId`. Status: AVAILABLE, RESERVED, REGISTERED.
- **Permissioned Resolver:** one resolver instance per account (UUPS proxy made by the Verifiable Factory). Roles are per resolver instance, not per name: a role holder writes the covered records on every name the instance serves. Setters take a DNS-encoded name (`toHex(packetToBytes(normalize("a.b.eth")))`).
- **EAC:** a resource is a name or `ROOT_RESOURCE` (0x0, applies everywhere). `grantRoles`/`revokeRoles` reject ROOT_RESOURCE; use `grantRootRoles`/`revokeRootRoles`. The caller needs the admin role (`role << 128`) for each role it grants. Admin roles on a name can only be granted at registration.

## Roles (exact names)

- Registry: `ROLE_REGISTRAR` (1<<0), `ROLE_REGISTER_RESERVED` (1<<4), `ROLE_SET_PARENT` (1<<8), `ROLE_UNREGISTER` (1<<12), `ROLE_RENEW` (1<<16), `ROLE_SET_SUBREGISTRY` (1<<20), `ROLE_SET_RESOLVER` (1<<24), `ROLE_CAN_TRANSFER_ADMIN` ((1<<28)<<128, admin only), `ROLE_SET_URI` (1<<36), `ROLE_UPGRADE` (1<<124).
- Resolver: `ROLE_SET_ADDRESS` (1<<0), `ROLE_SET_TEXT` (1<<4), `ROLE_SET_CONTENTHASH` (1<<8), `ROLE_SET_ABI` (1<<12), `ROLE_SET_INTERFACE` (1<<16), `ROLE_SET_NAME` (1<<20), `ROLE_SET_DATA` (1<<24), `ROLE_LINK` (1<<28), `ROLE_CAN_NAME` (1<<120), `ROLE_UPGRADE` (1<<124).
- Per-key scoping on the resolver: `grantSetterRoles(setter, account)` where `setter` is the calldata of e.g. `setText`. Revoke with `revokeRoles(resource, roleBitmap, account)` where resource = `keccak256(bytes(key))` for string keys. Generic `grantRoles` is disabled on the resolver (`EACCannotGrantRoles`). This is the mechanism for "publisher may write only paid, late, status".

## Expiry and revocation

- Expired when `block.timestamp >= expiry`. `ownerOf` returns address(0) when expired.
- `register(label, owner, registry, resolver, roleBitmap, expiry)`; `renew(anyId, newExpiry)` cannot reduce expiry; `unregister(anyId)` sets expiry to now (needs `ROLE_UNREGISTER`).
- Revocation of a permission: `revokeRoles(anyId, roleBitmap, account)`. Revoking a role and its admin permanently locks it.
- Views: `getState(anyId)`, `getStatus`, `getExpiry`, `findOwner(label)`, `hasRoles(anyId, roleBitmap, account)`, `roles(anyId, account)`.

## Creating a subname for the buyer agent (docs path)

1. `VerifiableFactory.deployProxy(implementation, salt, data)` with implementation `UserRegistryImpl`, `salt = keccak256(abi.encode(keccak256("UserRegistry"), namehash(parent), 0))`, `data = initialize([{account, roleBitmap}])`. Read `ProxyDeployed` for the proxy address.
2. On the registry holding the parent: `setSubregistry(anyId, userRegistryProxy)` (needs `ROLE_SET_SUBREGISTRY`, which the parent owner has).
3. Register the subname in the UserRegistry: `register(label, owner, registry, resolver, roleBitmap, expiry)`. The expiry is the credit line.
4. Set records through the permissioned resolver: `setAddress(bytes name, uint256 coinType, bytes addr)` (ETH coin type 60), `setText(bytes name, string key, string value)`.
5. Reads: viem `getEnsAddress({ name })`, `getEnsText({ name, key })`. Name owner does not automatically get resolver write rights.

NOT FOUND in the docs: a Sepolia step list for registering a parent `.eth` name, and which payment token the Sepolia ETHRegistrar accepts. Generic flow: `isAvailable`, `getRegisterPrice`, ERC20 `approve`, `makeCommitment`, `commit`, wait 60 s, `register`. Sepolia has MockUSDC and MockDAI, but the docs do not say to use them. Full Solidity types for many functions are also NOT FOUND: read the ABIs (contracts-v2 commit 07e55a056f5b6a9c90119f501bdd05714e67dddd) before writing calls.

## Sepolia ENSv2 addresses (source: https://docs.ens.domains/learn/deployments#sepolia-ensv2)

| Contract | Address |
|---|---|
| RootRegistry | 0xb458d6a3a77919449d03e7a6903c26827c1ec43f |
| ETHRegistry | 0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4 |
| ETHRegistrar | 0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3 |
| VerifiableFactory | 0xda70306c98e97ece36f997a21368e53298572991 |
| PermissionedResolverImpl | 0x115eb53f0c60696633855f90b138178fb40b2b2c |
| UserRegistryImpl | 0x9bd8a88719068d09ecee662f36c0e3856708366a |
| UniversalResolverV2 | 0x24e1d8e068620b647ca097f961a61055f4f42d72 |
| StandardRentPriceOracle | 0x8196665d4ca7488b6474a9ec8e7d2719fb42263a |
| MockUSDC | 0x240b0316df57887dbbe58b586508b19e633a14aa |
| MockDAI | 0xf6fac8a58a0be13b9197f27c41b73162fe32572b |

The docs do not say whether `UniversalResolverV2` or `UpgradableUniversalResolverProxy` (0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe) is the entry point. Use viem's resolution and do not hardcode a Universal Resolver. ENS app: https://sepolia.app.ens.domains. Explorer: https://sepolia.explorer.ens.domains.

## Client libraries

Only `viem` is named (`viem/ens`: `normalize`, `packetToBytes`; `getEnsText`, `getEnsAddress`). No ENSv2-specific viem helper is documented (NOT FOUND).

## Fallback

If the registry APIs block us after two attempts: plain text records on a standard Sepolia name, and say so in the README.
