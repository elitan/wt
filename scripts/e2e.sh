#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WT_BIN="${WT_BIN:-$ROOT_DIR/wt-dev}"
TEST_ID="wt-e2e-$$"
TEST_DIR="/tmp/$TEST_ID"
REPO_NAME="$TEST_ID-repo"

cleanup() {
  rm -rf "$TEST_DIR" ~/.wt/"$REPO_NAME" 2>/dev/null || true
}
trap cleanup EXIT

log() {
  echo "==> $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

setup_test_repo() {
  log "Setting up test repo"
  mkdir -p "$TEST_DIR/origin.git" "$TEST_DIR/$REPO_NAME"

  cd "$TEST_DIR/origin.git"
  git init --bare -q -b main

  cd "$TEST_DIR/$REPO_NAME"
  git init -q -b main
  git config user.email "test@test.com"
  git config user.name "Test"
  echo "test" > README.md
  echo '{"name":"test"}' > package.json
  echo ".env" > .gitignore
  echo "SECRET=abc123" > .env
  touch bun.lockb
  git add .
  git commit -q -m "init"
  git remote add origin "$TEST_DIR/origin.git"
  git push -q -u origin main
}

test_help() {
  log "Test --help"
  "$WT_BIN" --help | grep -q "wt - git worktree manager" || fail "--help output"
}

test_version() {
  log "Test --version"
  "$WT_BIN" --version | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$|^dev$' || fail "--version output"
}

test_list() {
  log "Test list"
  cd "$TEST_DIR/$REPO_NAME"
  "$WT_BIN" list 2>&1 | grep -q "main" || fail "list should show main"
}

test_new_worktree() {
  log "Test new worktree"
  cd "$TEST_DIR/$REPO_NAME"
  "$WT_BIN" new test-branch 2>&1 | grep -v "^cd " || true
  "$WT_BIN" list 2>&1 | grep -q "test-branch" || fail "worktree not created"
}

test_env_copied() {
  log "Test .env copied to worktree"
  WT_PATH=$(ls -d ~/.wt/"$REPO_NAME"/*test-branch 2>/dev/null) || fail "worktree dir not found"
  test -f "$WT_PATH/.env" || fail ".env not copied"
  grep -q "SECRET=abc123" "$WT_PATH/.env" || fail ".env content mismatch"
}

test_rm() {
  log "Test rm with -y"
  cd "$TEST_DIR/$REPO_NAME"
  "$WT_BIN" rm test-branch -y 2>&1 | grep -q "Removed" || fail "rm failed"
}

main() {
  log "Running e2e tests"
  log "Binary: $WT_BIN"

  test -x "$WT_BIN" || fail "Binary not found or not executable: $WT_BIN"

  setup_test_repo
  test_help
  test_version
  test_list
  test_new_worktree
  test_env_copied
  test_rm

  log "All tests passed"
}

main "$@"
