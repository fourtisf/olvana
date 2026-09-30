#!/usr/bin/env bash
# Starts anvil with chain id 1 and deploys Morpho's real contracts from source: Morpho Blue, the MetaMorpho V1.1
# factory (runtime placed at its Ethereum address 0x1897…5c24, config.ts) and a USDC stand-in at the pinned USDC
# address, and Multicall3 at its canonical address. Creates an idle USDC market, a V1.1 vault through the factory with a 150 USDC cap on that market, and mints
# 1,000 test USDC to anvil account #1. Prints the vault address.
set -e
F=${FOUNDRY_DIR:?}; BL=${BLUE_OUT:?}; MM=${MM_OUT:?}; TOK=${TOKEN_OUT:?}; RPC=http://127.0.0.1:8548
pkill -f "[a]nvil --chain-id 1 --port 8548 --silent" 2>/dev/null || true; sleep 0.5
($F/anvil --chain-id 1 --port 8548 --silent > /dev/null 2>&1 &)
for i in $(seq 1 40); do $F/cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.25; done
FACTORY=0x1897A8997241C1cD4bD0698647e4EB7213535c24; USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; ZERO=0x0000000000000000000000000000000000000000
OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; USER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
j() { python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]]['object'])" "$1" "$2"; }
send() { $F/cast send "$@" --from $OWNER --unlocked --rpc-url $RPC >/dev/null; }
create() { $F/cast send --from $OWNER --unlocked --rpc-url $RPC --json --create "$1" | python3 -c "import json,sys;print(json.load(sys.stdin)['contractAddress'])"; }
BLUE=$(create "$(j $BL/Morpho.sol/Morpho.json bytecode)$($F/cast abi-encode 'c(address)' $OWNER | cut -c3-)")
$F/cast rpc anvil_setCode $USDC "$(j $TOK/MockToken.sol/MockToken.json deployedBytecode)" --rpc-url $RPC >/dev/null
$F/cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 "$(j $TOK/Multicall3.sol/Multicall3.json deployedBytecode)" --rpc-url $RPC >/dev/null   # Multicall3 (config.ts MULTICALL3)
send $BLUE "enableIrm(address)" $ZERO
send $BLUE "enableLltv(uint256)" 0
MP="($USDC,$ZERO,$ZERO,$ZERO,0)"
send $BLUE "createMarket((address,address,address,address,uint256))" "$MP"
TMP=$(create "$(j $MM/MetaMorphoV1_1Factory.sol/MetaMorphoV1_1Factory.json bytecode)$($F/cast abi-encode 'c(address)' $BLUE | cut -c3-)")
$F/cast rpc anvil_setCode $FACTORY "$($F/cast code $TMP --rpc-url $RPC)" --rpc-url $RPC >/dev/null
SIG="createMetaMorpho(address,uint256,address,string,string,bytes32)(address)"
VAULT=$($F/cast call $FACTORY "$SIG" $OWNER 0 $USDC "Steakhouse USDC" steakUSDC 0x0000000000000000000000000000000000000000000000000000000000000001 --from $OWNER --rpc-url $RPC)
send $FACTORY "createMetaMorpho(address,uint256,address,string,string,bytes32)" $OWNER 0 $USDC "Steakhouse USDC" steakUSDC 0x0000000000000000000000000000000000000000000000000000000000000001
send $VAULT "submitCap((address,address,address,address,uint256),uint256)" "$MP" 150000000
send $VAULT "acceptCap((address,address,address,address,uint256))" "$MP"
ID=$($F/cast keccak "$($F/cast abi-encode 'f(address,address,address,address,uint256)' $USDC $ZERO $ZERO $ZERO 0)")
send $VAULT "setSupplyQueue(bytes32[])" "[$ID]"
send $USDC "mint(address,uint256)" $USER 1000000000
echo "$VAULT $BLUE"
