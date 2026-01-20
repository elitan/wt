import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
  checkoutWorktree,
  createWorktree,
  getCurrentBranch,
  getRepoInfo,
  listWorktrees,
  type RepoInfo,
  removeWorktree,
} from "./git";

const TEST_DIR = join(tmpdir(), `wt-e2e-${Date.now()}`);
const BARE_DIR = join(TEST_DIR, "bare-repo.git");
const REPO_DIR = join(TEST_DIR, "test-repo");

let REAL_REPO_DIR: string;

async function setupTestRepo() {
  await $`mkdir -p ${TEST_DIR}`;

  await $`git init --bare ${BARE_DIR}`;

  await $`git clone ${BARE_DIR} ${REPO_DIR}`;
  await $`git -C ${REPO_DIR} config user.email "test@test.com"`;
  await $`git -C ${REPO_DIR} config user.name "Test"`;

  await $`touch ${join(REPO_DIR, "file.txt")}`;
  await $`git -C ${REPO_DIR} add .`;
  await $`git -C ${REPO_DIR} commit -m "initial"`;
  await $`git -C ${REPO_DIR} push -u origin main`;

  await $`git -C ${REPO_DIR} checkout -b feat/test-branch`;
  await $`touch ${join(REPO_DIR, "feature.txt")}`;
  await $`git -C ${REPO_DIR} add .`;
  await $`git -C ${REPO_DIR} commit -m "feature"`;
  await $`git -C ${REPO_DIR} push -u origin feat/test-branch`;

  await $`git -C ${REPO_DIR} checkout -b feat/prune-test`;
  await $`touch ${join(REPO_DIR, "prune.txt")}`;
  await $`git -C ${REPO_DIR} add .`;
  await $`git -C ${REPO_DIR} commit -m "prune test"`;
  await $`git -C ${REPO_DIR} push -u origin feat/prune-test`;

  await $`git -C ${REPO_DIR} checkout main`;

  REAL_REPO_DIR = await realpath(REPO_DIR);
}

describe("e2e", () => {
  let repo: RepoInfo;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    await setupTestRepo();
    process.chdir(REAL_REPO_DIR);
    repo = (await getRepoInfo())!;
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await $`rm -rf ${TEST_DIR}`.quiet();
  });

  test("getRepoInfo returns correct info", async () => {
    expect(repo).not.toBeNull();
    expect(repo.root).toBe(REAL_REPO_DIR);
    expect(repo.name).toBe("test-repo");
  });

  test("getCurrentBranch returns current branch", async () => {
    const branch = await getCurrentBranch(REAL_REPO_DIR);
    expect(branch).toBe("main");
  });

  test("createWorktree creates new worktree", async () => {
    const result = await createWorktree(repo, "new-feature");
    expect(result.path).toBe(join(repo.wtDir, "new-feature"));
    expect(await Bun.file(join(result.path, ".git")).exists()).toBe(true);
  });

  test("listWorktrees includes created worktree", async () => {
    const worktrees = await listWorktrees(repo);
    const names = worktrees.map((w) => w.name);
    expect(names).toContain("main");
    expect(names).toContain("new-feature");
  });

  test("checkoutWorktree sanitizes slashes in branch names", async () => {
    const result = await checkoutWorktree(repo, "origin/feat/test-branch");
    expect(result.path).toBe(join(repo.wtDir, "feat-test-branch"));
    expect(await Bun.file(join(result.path, ".git")).exists()).toBe(true);
  });

  test("checkoutWorktree reuses existing worktree", async () => {
    const result1 = await checkoutWorktree(repo, "origin/feat/test-branch");
    const result2 = await checkoutWorktree(repo, "origin/feat/test-branch");
    expect(result1.path).toBe(result2.path);
  });

  test("removeWorktree removes worktree", async () => {
    const worktreesBefore = await listWorktrees(repo);
    const wt = worktreesBefore.find((w) => w.name === "new-feature");
    expect(wt).not.toBeUndefined();

    await removeWorktree(repo, wt!.path);

    const worktreesAfter = await listWorktrees(repo);
    const names = worktreesAfter.map((w) => w.name);
    expect(names).not.toContain("new-feature");
  });

  test("prune handles manually deleted worktrees", async () => {
    const result = await checkoutWorktree(repo, "origin/feat/prune-test");
    await $`rm -rf ${result.path}`;
    const result2 = await checkoutWorktree(repo, "origin/feat/prune-test");
    expect(result2.path).toBe(result.path);
    expect(await Bun.file(join(result2.path, ".git")).exists()).toBe(true);
  });
});
