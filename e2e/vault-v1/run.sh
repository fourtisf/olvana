#!/usr/bin/env bash
# Vault V1 e2e: compiles Morpho Blue (0.8.19) and MetaMorpho v1.1 (0.8.26) from morpho-org/metamorpho-v1.1 and its
# pinned morpho-blue submodule, starts a local chain with chain id 1 (V1.1 factory + USDC stand-in at their Ethereum
# addresses) and drives the site's deposit / withdraw flow, including a vault at its cap.
set -euo pipefail
cd "$(dirname "$0")"
../tools.sh
T=../.tools B=.build
MM=$T/metamorpho-v1.1
cfg() { printf '[profile.default]\nsrc="src"\nout="out"\nlibs=["lib"]\nvia_ir=true\noptimizer=true\noptimizer_runs=%s\nbytecode_hash="none"\nevm_version="%s"\n' "$1" "$2"; }
if [ ! -f $B/mm/out/MetaMorphoV1_1Factory.sol/MetaMorphoV1_1Factory.json ]; then
  rm -rf $B && mkdir -p $B/mm $B/blue $B/token/src
  cp -r $MM/src $B/mm/src && rm -rf $B/mm/src/mocks && ln -s "$(cd $MM/lib && pwd)" $B/mm/lib && cfg 200 cancun > $B/mm/foundry.toml
  cp -r $MM/lib/morpho-blue/src $B/blue/src && rm -rf $B/blue/src/mocks && cfg 999999 paris > $B/blue/foundry.toml
  cp ../MockToken.sol $B/token/src/ && cfg 200 cancun > $B/token/foundry.toml
  S=$(cd $T && pwd)
  (cd $B/mm && $S/foundry/forge build --offline --use $S/solc-0.8.26 >/dev/null)
  (cd $B/blue && $S/foundry/forge build --offline --use $S/solc-0.8.19 >/dev/null)
  (cd $B/token && $S/foundry/forge build --offline --use $S/solc-0.8.26 >/dev/null 2>&1)
fi
if [ ! -f $B/token/out/Multicall3.sol/Multicall3.json ]; then
  cp ../Multicall3.sol $B/token/src/
  S=$(cd $T && pwd); (cd $B/token && $S/foundry/forge build --offline --use $S/solc-0.8.26 >/dev/null 2>&1)
fi
export FOUNDRY_DIR="$(cd $T/foundry && pwd)" BLUE_OUT="$PWD/$B/blue/out" MM_OUT="$PWD/$B/mm/out" TOKEN_OUT="$PWD/$B/token/out"
node deposit-withdraw.test.cjs
