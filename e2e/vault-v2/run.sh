#!/usr/bin/env bash
# End-to-end test of the site's deposit / withdraw flow against Morpho's real Vault V2 code.
#
# 1. Fetches pinned tools into .tools/ (Foundry, solc 0.8.28, morpho-org/vault-v2 source) if missing.
# 2. Compiles VaultV2Factory + VaultV2 + a USDG stand-in (MockToken.sol).
# 3. Starts a local anvil chain with chain id 4663, puts the factory and the token at their Robinhood Chain
#    mainnet addresses (config.ts), creates a vault through the factory and mints test USDG.
# 4. Opens docs/olvana-prototype.html in Chromium with a test wallet that forwards to that chain, and drives
#    deposit, rejection + retry, partial withdraw, MAX withdraw, a USDT-style token and a lookalike vault.
# No mainnet funds or RPCs are involved.
set -euo pipefail
cd "$(dirname "$0")"
T=.tools; B=.build
VAULT_V2_COMMIT=9ee4dbdcc9b261eef60768e3997e328224b68395
mkdir -p $T $B/src
if [ ! -x $T/foundry/anvil ]; then
  mkdir -p $T/foundry
  curl -sSL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz | tar -xz -C $T/foundry
fi
[ -x $T/solc-0.8.28 ] || { curl -sSL -o $T/solc-0.8.28 https://github.com/ethereum/solidity/releases/download/v0.8.28/solc-static-linux; chmod +x $T/solc-0.8.28; }
if [ ! -d $T/vault-v2 ]; then
  git clone -q https://github.com/morpho-org/vault-v2.git $T/vault-v2
  git -C $T/vault-v2 checkout -q $VAULT_V2_COMMIT
fi
if [ ! -f $B/out/VaultV2Factory.sol/VaultV2Factory.json ]; then
  cp -r $T/vault-v2/src/* $B/src/ && rm -rf $B/src/imports $B/src/adapters $B/src/periphery
  cp MockToken.sol $B/src/
  printf '[profile.default]\nsrc="src"\nout="out"\nvia_ir=true\noptimizer=true\noptimizer_runs=200\nbytecode_hash="none"\nevm_version="cancun"\n' > $B/foundry.toml
  (cd $B && ../$T/foundry/forge build --offline --use ../$T/solc-0.8.28 >/dev/null)
fi
export FOUNDRY_DIR="$PWD/$T/foundry" BUILD_DIR="$PWD/$B"
node deposit-withdraw.test.cjs
