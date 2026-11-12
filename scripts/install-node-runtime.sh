#!/bin/sh
# Nixpacks fallback: use the same exact runtime as .nvmrc, without a moving Nix package.
set -eu
version=26.13.1
case "$(uname -m)" in
  x86_64) arch=x64; checksum=5c063e46bab0fbc1c17cc445d7ff129cbdcd0471be6ed83b6ab864f8143bc864 ;;
  aarch64) arch=arm64; checksum=89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd ;;
  *) echo 'Unsupported Node runtime architecture' >&2; exit 1 ;;
esac
destination=${NODE_RUNTIME_PREFIX:-/opt/node}
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
archive="node-v$version-linux-$arch.tar.xz"
curl --fail --silent --show-error --location --max-time 120 \
  "https://nodejs.org/dist/v$version/$archive" -o "$temporary/$archive"
printf '%s  %s\n' "$checksum" "$temporary/$archive" | sha256sum --check
mkdir -p "$destination"
tar -xJf "$temporary/$archive" --strip-components=1 -C "$destination"
export PATH="$destination/bin:$PATH"
test "$(node --version)" = "v$version"
npm install --global --prefix "$destination" corepack@0.36.0
corepack enable --install-directory "$destination/bin"
