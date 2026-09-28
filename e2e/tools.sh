#!/usr/bin/env bash
# Pinned tools for the e2e tests, downloaded once into e2e/.tools (ignored by git).
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)/.tools"
mkdir -p "$T"
if [ ! -x "$T/foundry/anvil" ]; then
  mkdir -p "$T/foundry"
  curl -sSL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz | tar -xz -C "$T/foundry"
fi
for v in 0.8.19 0.8.26 0.8.28; do
  [ -x "$T/solc-$v" ] || { curl -sSL -o "$T/solc-$v" "https://github.com/ethereum/solidity/releases/download/v$v/solc-static-linux"; chmod +x "$T/solc-$v"; }
done
clone() {   # clone <url> <dir> <commit> [submodule paths…]
  local url=$1 dir=$T/$2 commit=$3; shift 3
  [ -d "$dir" ] && return 0
  git clone -q "$url" "$dir" && git -C "$dir" checkout -q "$commit"
  if [ $# -gt 0 ]; then git -C "$dir" submodule update -q --init --depth 1 "$@"; fi
}
clone https://github.com/morpho-org/vault-v2.git vault-v2 9ee4dbdcc9b261eef60768e3997e328224b68395
clone https://github.com/morpho-org/metamorpho-v1.1.git metamorpho-v1.1 3b17547ee464d00370d1e5e7cd997c3cdb8b0fb7 lib/morpho-blue lib/openzeppelin-contracts
