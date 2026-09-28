#!/usr/bin/env bash
# Starts anvil (chain id 4663) with the real VaultV2Factory and a USDG stand-in at their mainnet addresses,
# creates a vault through the factory, mints 1,000 test USDG to anvil account #1, and prints the vault address.
set -e
F=${FOUNDRY_DIR:?}; OUT=${BUILD_DIR:?}/out; RPC=http://127.0.0.1:8547
pkill -f "[a]nvil --chain-id 4663 --port 8547 --silent" 2>/dev/null || true; sleep 0.5
($F/anvil --chain-id 4663 --port 8547 --silent > /dev/null 2>&1 &)
for i in $(seq 1 40); do $F/cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.25; done
FACTORY=0x0FBad98595b0186dA120E41f77C102beb49f803c; USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; USER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
code() { python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['deployedBytecode']['object'])" "$1"; }
$F/cast rpc anvil_setCode $FACTORY "$(code $OUT/VaultV2Factory.sol/VaultV2Factory.json)" --rpc-url $RPC >/dev/null
$F/cast rpc anvil_setCode $USDG "$(code $OUT/MockToken.sol/MockToken.json)" --rpc-url $RPC >/dev/null
SALT=0x0000000000000000000000000000000000000000000000000000000000000001
$F/cast send $FACTORY "createVaultV2(address,address,bytes32)" $OWNER $USDG $SALT --from $OWNER --unlocked --rpc-url $RPC >/dev/null
$F/cast call $FACTORY "vaultV2(address,address,bytes32)(address)" $OWNER $USDG $SALT --rpc-url $RPC
$F/cast send $USDG "mint(address,uint256)" $USER 1000000000 --from $OWNER --unlocked --rpc-url $RPC >/dev/null
