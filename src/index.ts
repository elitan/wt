#!/usr/bin/env bun

import {
  checkoutWorktree,
  createWorktree,
  getCurrentBranch,
  getMainRepoPath,
  getRepoInfo,
  listWorktrees,
  type RepoInfo,
  removeWorktree,
} from "./git";
import {
  checkGhCli,
  getIssueInfo,
  getPrInfo,
  isGithubUrl,
  parseGithubUrl,
  slugify,
} from "./github";
import { postCreateSetup } from "./post-create";
import { confirm, deletePicker, picker } from "./ui";
import { upgrade } from "./upgrade";
import { VERSION } from "./version";

const args = process.argv.slice(2);
const command = args[0];

function output(cmd: string, tabTitle?: string) {
  if (tabTitle) {
    console.log(`echo -ne "\\033]0;${tabTitle}\\007"; ${cmd}`);
  } else {
    console.log(cmd);
  }
}

function error(msg: string): never {
  console.error(`wt: ${msg}`);
  process.exit(1);
}

async function handleGithubUrl(repo: RepoInfo, url: string): Promise<void> {
  await checkGhCli();
  const parsed = parseGithubUrl(url);
  if (!parsed) error("invalid GitHub URL");

  const { owner, repo: repoName, number } = parsed;

  if (parsed.type === "pr") {
    const pr = await getPrInfo(owner, repoName, number);
    if (pr.state === "MERGED") {
      error(`PR #${number} was already merged`);
    }
    if (pr.state === "CLOSED") {
      error(`PR #${number} was closed without merging`);
    }
    const currentBranch = await getCurrentBranch(repo.root);
    if (currentBranch === pr.branch) {
      output(`cd "${repo.root}"`, pr.branch);
      return;
    }
    const worktrees = await listWorktrees(repo);
    const existing = worktrees.find((w) => w.branch === pr.branch);
    if (existing) {
      output(`cd "${existing.path}"`, existing.name);
      return;
    }
    const result = await checkoutWorktree(repo, `origin/${pr.branch}`);
    await postCreateSetup(result.path, result.sourceDir);
    output(`cd "${result.path}"`, pr.branch);
    return;
  }

  const issue = await getIssueInfo(owner, repoName, number);
  const branchName = `${slugify(issue.title)}-${issue.number}`;
  const result = await createWorktree(repo, branchName);
  await postCreateSetup(result.path, result.sourceDir);
  output(`cd "${result.path}"`, branchName);
}

async function main() {
  if (command === "init") {
    printShellInit();
    return;
  }

  if (command === "setup") {
    await setupShell();
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  if (command === "upgrade") {
    await upgrade();
    return;
  }

  const repoOrNull = await getRepoInfo();
  if (!repoOrNull) {
    error("not in a git repository");
  }
  const repo = repoOrNull;

  if (command && isGithubUrl(command)) {
    await handleGithubUrl(repo, command);
    return;
  }

  if (command === "new") {
    const name = args.slice(1).join(" ");
    if (!name) error("usage: wt new <name>");
    if (isGithubUrl(name)) {
      await handleGithubUrl(repo, name);
      return;
    }
    const branchName = slugify(name);
    const result = await createWorktree(repo, branchName);
    await postCreateSetup(result.path, result.sourceDir);
    output(`cd "${result.path}"`, branchName);
    return;
  }

  if (command === "checkout") {
    const branch = args[1];
    if (!branch) error("usage: wt checkout <branch>");
    const result = await checkoutWorktree(repo, branch);
    await postCreateSetup(result.path, result.sourceDir);
    const branchName = branch.replace("origin/", "").replace("refs/heads/", "");
    output(`cd "${result.path}"`, branchName);
    return;
  }

  if (command === "rm") {
    const rmArgs = args.slice(1);
    const skipConfirm = rmArgs.includes("-y") || rmArgs.includes("--yes");
    const name = rmArgs.find((a) => a !== "-y" && a !== "--yes");
    const worktrees = await listWorktrees(repo);
    const cwd = process.cwd();

    if (name) {
      const wt = worktrees.find(
        (w) => w.name === name || w.name.includes(name),
      );
      if (!wt) error(`worktree not found: ${name}`);
      if (wt.name === "main") error("cannot delete main repo");
      if (skipConfirm || (await confirm(`Remove ${wt.name}?`))) {
        await removeWorktree(repo, wt.path);
        console.error(`Removed ${wt.name}`);
        if (cwd.startsWith(wt.path)) {
          output(`cd "${repo.root}"`, repo.name);
        }
      }
      return;
    }

    const wt = await deletePicker({
      repoName: repo.name,
      worktrees,
      currentPath: cwd,
    });

    if (wt) {
      await removeWorktree(repo, wt.path);
      console.error(`Removed ${wt.name}`);
      if (cwd.startsWith(wt.path)) {
        output(`cd "${repo.root}"`, repo.name);
      }
    }
    return;
  }

  if (command === "main") {
    const mainPath = await getMainRepoPath();
    if (mainPath) output(`cd "${mainPath}"`, repo.name);
    else error("could not find main repo");
    return;
  }

  if (command === "list") {
    const worktrees = await listWorktrees(repo);
    for (const wt of worktrees) {
      console.error(`${wt.name} (${wt.branch})`);
    }
    return;
  }

  const initialQuery = args.join(" ");
  const cwd = process.cwd();

  let worktrees = await listWorktrees(repo);

  while (true) {
    const currentWt = worktrees.find(
      (w) => cwd.startsWith(w.path) && w.name !== "main",
    );
    const result = await picker({
      repoName: repo.name,
      worktrees,
      initialQuery: initialQuery || currentWt?.name || "",
    });

    if (result.type === "select" && result.value) {
      const wt = worktrees.find((w) => w.path === result.value);
      output(`cd "${result.value}"`, wt?.name || repo.name);
      break;
    } else if (result.type === "create" && result.value) {
      const branchName = slugify(result.value);
      const wtResult = await createWorktree(repo, branchName);
      await postCreateSetup(wtResult.path, wtResult.sourceDir);
      output(`cd "${wtResult.path}"`, branchName);
      break;
    } else if (result.type === "delete" && result.value) {
      const wt = worktrees.find((w) => w.path === result.value);
      if (wt && wt.name !== "main") {
        if (await confirm(`Delete ${wt.name}?`)) {
          await removeWorktree(repo, wt.path);
          console.error(`Removed ${wt.name}`);
          if (cwd.startsWith(wt.path)) {
            output(`cd "${repo.root}"`, repo.name);
            break;
          }
          worktrees = await listWorktrees(repo);
        }
      }
    } else {
      break;
    }
  }
}

function printShellInit() {
  const script = `
wt() {
  local result cmdline
  result=$(command wt "$@")
  cmdline=$(echo "$result" | sed 's/\\x1b\\[[0-9;]*m//g' | grep -E '^(cd "|echo )' | tail -1)
  if [[ -n "$cmdline" ]]; then
    eval "$cmdline"
  elif [[ -n "$result" ]]; then
    echo "$result"
  fi
}
`.trim();
  console.log(script);
}

async function setupShell() {
  const shell = process.env.SHELL || "";
  const home = process.env.HOME || "";

  if (!home) {
    error("could not determine home directory");
  }

  let configFile: string;
  let initLine: string;

  if (shell.endsWith("zsh")) {
    configFile = `${home}/.zshrc`;
    initLine = 'eval "$(wt init)"';
  } else if (shell.endsWith("bash")) {
    configFile = `${home}/.bashrc`;
    initLine = 'eval "$(wt init)"';
  } else if (shell.endsWith("fish")) {
    configFile = `${home}/.config/fish/config.fish`;
    initLine = "wt init | source";
  } else {
    error(`unsupported shell: ${shell}`);
    return;
  }

  const file = Bun.file(configFile);
  const exists = await file.exists();
  const content = exists ? await file.text() : "";

  if (content.includes("wt init")) {
    console.log(`wt already configured in ${configFile}`);
    return;
  }

  const newContent =
    content.endsWith("\n") || !content
      ? `${content}${initLine}\n`
      : `${content}\n${initLine}\n`;

  await Bun.write(configFile, newContent);
  console.log(`Added wt to ${configFile}`);
  console.log(`Run: source ${configFile}`);
}

function printHelp() {
  console.log(`wt - git worktree manager

Usage:
  wt                    Interactive picker (fuzzy search)
  wt <query>            Search or create worktree
  wt <github-url>       Create worktree from GitHub issue/PR URL
  wt new <name>         Create new worktree from origin/main
  wt new <github-url>   Create worktree from GitHub issue/PR URL
  wt checkout <branch>  Checkout existing remote branch
  wt rm [name] [-y]     Remove worktree (-y skips confirmation)
  wt main               Go to main repo
  wt list               List all worktrees
  wt upgrade            Upgrade to latest version
  wt setup              Setup shell integration (one-time)
  wt init               Print shell function
  wt --version          Print version
`);
}

main().catch((e) => {
  console.error(`wt: ${e.message}`);
  process.exit(1);
});
