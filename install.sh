#!/bin/bash
set -e

INSTALL_DIR="${HOME}/.wt-cli"
BIN_DIR="${HOME}/.local/bin"

echo "Installing wt..."

if ! command -v bun &> /dev/null; then
  echo "Error: bun is required. Install it first: https://bun.sh"
  exit 1
fi

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

echo "Downloading..."
curl -sL https://github.com/elitan/wt/archive/refs/heads/main.tar.gz | tar -xz -C "$INSTALL_DIR" --strip-components=1

cd "$INSTALL_DIR"
bun install --frozen-lockfile

cat > "$BIN_DIR/wt" << 'EOF'
#!/bin/bash
bun "$HOME/.wt-cli/src/index.ts" "$@"
EOF
chmod +x "$BIN_DIR/wt"

echo ""
echo "Installed! Add to your shell config:"
echo ""
echo '  # ~/.zshrc or ~/.bashrc'
echo '  export PATH="$HOME/.local/bin:$PATH"'
echo '  eval "$(wt init)"'
echo ""
