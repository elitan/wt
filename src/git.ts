import { homedir } from "node:os";
import { basename, join } from "node:path";
import { $ } from "bun";
import { spinner } from "./ui";

const WT_BASE = join(homedir(), ".wt");

export interface Worktree {
  path: string;
  name: string;
  branch: string;
  commit: string;
  repoName: string;
  createdAt?: Date;
}

export interface RepoInfo {
  root: string;
  name: string;
  wtDir: string;
}

export interface WorktreeResult {
  path: string;
  sourceDir: string;
}

export async function getRepoInfo(): Promise<RepoInfo | null> {
  try {
    const { inWorktree, mainRepo } = await isInsideWorktree();
    const root =
      inWorktree && mainRepo
        ? mainRepo
        : (await $`git rev-parse --show-toplevel`.text()).trim();
    const name = basename(root);
    const wtDir = join(WT_BASE, name);
    return { root, name, wtDir };
  } catch {
    return null;
  }
}

export async function isInsideWorktree(): Promise<{
  inWorktree: boolean;
  mainRepo?: string;
}> {
  try {
    const gitDir = (await $`git rev-parse --git-dir`.text()).trim();
    if (gitDir.includes(".git/worktrees")) {
      const mainGitDir = (
        await $`git rev-parse --git-common-dir`.text()
      ).trim();
      const mainRepo = join(mainGitDir, "..");
      return { inWorktree: true, mainRepo };
    }
    return { inWorktree: false };
  } catch {
    return { inWorktree: false };
  }
}

export async function listWorktrees(repo: RepoInfo): Promise<Worktree[]> {
  try {
    const output =
      await $`git -C ${repo.root} worktree list --porcelain`.text();
    const worktrees: Worktree[] = [];
    const blocks = output.trim().split("\n\n");

    for (const block of blocks) {
      const lines = block.split("\n");
      let path = "";
      let branch = "";
      let commit = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) path = line.slice(9);
        else if (line.startsWith("branch "))
          branch = line.slice(7).replace("refs/heads/", "");
        else if (line.startsWith("HEAD ")) commit = line.slice(5, 12);
        else if (line === "detached") branch = "(detached)";
      }

      if (path === repo.root) {
        worktrees.push({
          path,
          name: "main",
          branch,
          commit,
          repoName: repo.name,
          createdAt: undefined,
        });
      } else if (path?.startsWith(repo.wtDir)) {
        const name = basename(path);
        let createdAt: Date | undefined;
        try {
          const dirStat = await $`stat -f %B ${path}`.text();
          createdAt = new Date(parseInt(dirStat.trim(), 10) * 1000);
        } catch {}

        worktrees.push({
          path,
          name,
          branch,
          commit,
          repoName: repo.name,
          createdAt,
        });
      }
    }

    return worktrees.sort((a, b) => {
      if (a.name === "main") return -1;
      if (b.name === "main") return 1;
      if (a.createdAt && b.createdAt)
        return b.createdAt.getTime() - a.createdAt.getTime();
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function createWorktree(
  repo: RepoInfo,
  name: string,
): Promise<WorktreeResult> {
  const wtPath = join(repo.wtDir, name);

  await $`mkdir -p ${repo.wtDir}`;
  await $`git -C ${repo.root} worktree prune`.quiet();

  const s = spinner("Fetching origin...");
  try {
    await $`git -C ${repo.root} fetch origin main`.quiet();
  } catch {
    try {
      await $`git -C ${repo.root} fetch origin master`.quiet();
    } catch {}
  }

  let baseBranch = "origin/main";
  try {
    await $`git -C ${repo.root} rev-parse origin/main`.quiet();
  } catch {
    baseBranch = "origin/master";
  }

  s.update("Creating worktree...");
  await $`git -C ${repo.root} worktree add -b ${name} ${wtPath} ${baseBranch}`.quiet();
  s.stop();
  return { path: wtPath, sourceDir: repo.root };
}

export async function checkoutWorktree(
  repo: RepoInfo,
  remoteBranch: string,
): Promise<WorktreeResult> {
  const branchName = remoteBranch
    .replace("origin/", "")
    .replace("refs/heads/", "");
  const dirName = branchName.replace(/\//g, "-");
  const wtPath = join(repo.wtDir, dirName);

  if (await Bun.file(join(wtPath, ".git")).exists()) {
    return { path: wtPath, sourceDir: repo.root };
  }

  await $`mkdir -p ${repo.wtDir}`;
  await $`git -C ${repo.root} worktree prune`.quiet();
  const s = spinner("Fetching branch...");
  await $`git -C ${repo.root} fetch origin ${branchName}`.quiet();
  s.update("Creating worktree...");
  await $`git -C ${repo.root} worktree add ${wtPath} ${remoteBranch}`.quiet();
  s.stop();
  return { path: wtPath, sourceDir: repo.root };
}

export async function removeWorktree(
  repo: RepoInfo,
  wtPath: string,
): Promise<void> {
  await $`git -C ${repo.root} worktree remove ${wtPath} --force`;
}

export async function getMainRepoPath(): Promise<string | null> {
  const { inWorktree, mainRepo } = await isInsideWorktree();
  if (inWorktree && mainRepo) return mainRepo;

  const repo = await getRepoInfo();
  return repo?.root ?? null;
}

export async function getCurrentBranch(
  repoPath: string,
): Promise<string | null> {
  try {
    const branch = (
      await $`git -C ${repoPath} rev-parse --abbrev-ref HEAD`.text()
    ).trim();
    return branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}

function hasControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function validateBranchName(name: string): string | null {
  if (!name) return "branch name cannot be empty";
  if (name.startsWith(".")) return "branch name cannot start with '.'";
  if (name.startsWith("-")) return "branch name cannot start with '-'";
  if (name.endsWith("/")) return "branch name cannot end with '/'";
  if (name.endsWith(".lock")) return "branch name cannot end with '.lock'";
  if (name.includes("..")) return "branch name cannot contain '..'";
  if (name.includes("@{")) return "branch name cannot contain '@{'";
  if (/[\s~^:?*[\]\\]/.test(name)) {
    return "branch name contains invalid characters";
  }
  if (hasControlChars(name)) {
    return "branch name cannot contain control characters";
  }
  return null;
}
