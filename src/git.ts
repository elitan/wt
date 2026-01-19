import { homedir } from "node:os";
import { basename, join } from "node:path";
import { $ } from "bun";

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
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const fullName = `${date}-${name}`;
  const wtPath = join(repo.wtDir, fullName);
  const branchName = fullName;

  await $`mkdir -p ${repo.wtDir}`;

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

  await $`git -C ${repo.root} worktree add -b ${branchName} ${wtPath} ${baseBranch}`;
  return wtPath;
}

export async function checkoutWorktree(
  repo: RepoInfo,
  remoteBranch: string,
): Promise<string> {
  const branchName = remoteBranch
    .replace("origin/", "")
    .replace("refs/heads/", "");
  const wtPath = join(repo.wtDir, branchName);

  await $`mkdir -p ${repo.wtDir}`;
  await $`git -C ${repo.root} fetch origin ${branchName}`.quiet();
  await $`git -C ${repo.root} worktree add ${wtPath} ${remoteBranch}`;
  return wtPath;
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
