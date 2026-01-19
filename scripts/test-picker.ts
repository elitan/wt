#!/usr/bin/env bun
/**
 * Manual test script for picker UI
 * Run: bun scripts/test-picker.ts
 *
 * Test scenarios:
 * 1. Arrow keys / Tab / Shift+Tab navigation
 * 2. Enter to select -> action menu
 * 3. Escape in action menu -> back to search
 * 4. Tab in action menu -> switch Open/Delete
 * 5. Enter on Delete -> returns delete action
 * 6. Enter on "+ Create" -> returns create action
 */

import { picker } from "../src/ui";

const mockWorktrees = [
  {
    name: "main",
    path: "/tmp/wt-test/main",
    branch: "main",
    commit: "abc123",
    repoName: "test-repo",
    createdAt: new Date(Date.now() - 86400000 * 7),
  },
  {
    name: "feature-login",
    path: "/tmp/wt-test/login",
    branch: "feature-login",
    commit: "def456",
    repoName: "test-repo",
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    name: "feature-auth",
    path: "/tmp/wt-test/auth",
    branch: "feature-auth",
    commit: "ghi789",
    repoName: "test-repo",
    createdAt: new Date(Date.now() - 7200000),
  },
  {
    name: "bugfix-header",
    path: "/tmp/wt-test/header",
    branch: "bugfix-header",
    commit: "jkl012",
    repoName: "test-repo",
    createdAt: new Date(Date.now() - 86400000),
  },
];

console.log("=== Picker UI Test ===\n");
console.log("Test scenarios:");
console.log("1. Use Tab/Shift+Tab or arrows to navigate");
console.log("2. Press Enter to select a worktree -> action menu appears");
console.log("3. Press Escape in action menu -> back to search");
console.log("4. Use Tab to switch between Open/Delete");
console.log("5. Select Delete -> should return delete action");
console.log("6. Select + Create -> should return create action");
console.log("\n");

const result = await picker({
  repoName: "test-repo",
  worktrees: mockWorktrees,
  initialQuery: "",
});

console.log("\n=== Result ===");
console.log(JSON.stringify(result, null, 2));

if (result.type === "select") {
  console.log("✓ Selected worktree");
} else if (result.type === "delete") {
  console.log("✓ Delete action triggered");
} else if (result.type === "create") {
  console.log("✓ Create action triggered");
} else if (result.type === "cancel") {
  console.log("✓ Cancelled");
}
