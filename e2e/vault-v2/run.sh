#!/usr/bin/env bash
# Vault V2 e2e: compiles morpho-org/vault-v2 (VaultV2Factory + VaultV2) and the USDG stand-in, starts a local chain
# with chain id 4663 (factory + token at their Robinhood Chain addresses) and drives the site's deposit / withdraw flow.
set -euo pipefail
cd "$(dirname "$0")"
../tools.sh
T=../.tools B=.build
if [ ! -f $B/out/VaultV2Factory.sol/VaultV2Factory.json ]; then
  rm -rf $B && mkdir -p $B/src
  cp -r $T/vault-v2/src/* $B/src/ && rm -rf $B/src/imports $B/src/adapters $B/src/periphery
  cp ../MockToken.sol $B/src/
  printf '[profile.default]\nsrc="src"\nout="out"\nvia_ir=true\noptimizer=true\noptimizer_runs=200\nbytecode_hash="none"\nevm_version="cancun"\n' > $B/foundry.toml
  (cd $B && ../$T/foundry/forge build --offline --use ../$T/solc-0.8.28 >/dev/null)
fi
if [ ! -f $B/out/MockGate.sol/MockGate.json ]; then
  cp ../MockGate.sol $B/src/ && (cd $B && ../$T/foundry/forge build --offline --use ../$T/solc-0.8.28 >/dev/null 2>&1)
fi
export FOUNDRY_DIR="$(cd $T/foundry && pwd)" BUILD_DIR="$PWD/$B"
node deposit-withdraw.test.cjs
