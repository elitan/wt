#!/bin/bash
set -e

REPO="elitan/wt"
INSTALL_DIR="${HOME}/.local/bin"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) OS="darwin" ;;
  linux) OS="linux" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64) ARCH="x64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

ASSET="wt-${OS}-${ARCH}"
echo "Downloading ${ASSET}..."

RELEASE_URL=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" | grep "browser_download_url.*${ASSET}\"" | cut -d '"' -f 4)

if [ -z "$RELEASE_URL" ]; then
  echo "Error: Could not find release for ${ASSET}"
  exit 1
fi

mkdir -p "$INSTALL_DIR"
curl -sL "$RELEASE_URL" -o "${INSTALL_DIR}/wt"
chmod +x "${INSTALL_DIR}/wt"

echo "Installed wt to ${INSTALL_DIR}/wt"

if ! echo "$PATH" | grep -q "${INSTALL_DIR}"; then
  echo ""
  echo "Add to your PATH:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo ""
echo "Run 'wt setup' to configure shell integration"
