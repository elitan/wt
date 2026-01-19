#!/usr/bin/env bun

import {
  checkoutWorktree,
  createWorktree,
  getMainRepoPath,
  getRepoInfo,
  listWorktrees,
  removeWorktree,
} from "./git";
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

  const repo = await getRepoInfo();
  if (!repo) {
    error("not in a git repository");
  }

  if (command === "new") {
    const name = args.slice(1).join("-");
    if (!name) error("usage: wt new <name>");
    const wtPath = await createWorktree(repo!, name);
    const date = new Date().toISOString().slice(0, 10);
    output(`cd "${wtPath}"`, `${date}-${name}`);
    return;
  }

  if (command === "checkout") {
    const branch = args[1];
    if (!branch) error("usage: wt checkout <branch>");
    const wtPath = await checkoutWorktree(repo!, branch);
    const branchName = branch.replace("origin/", "").replace("refs/heads/", "");
    output(`cd "${wtPath}"`, branchName);
    return;
  }

  if (command === "rm") {
    const rmArgs = args.slice(1);
    const skipConfirm = rmArgs.includes("-y") || rmArgs.includes("--yes");
    const name = rmArgs.find((a) => a !== "-y" && a !== "--yes");
    const worktrees = await listWorktrees(repo!);
    const cwd = process.cwd();

    if (name) {
      const wt = worktrees.find(
        (w) => w.name === name || w.name.includes(name),
      );
      if (!wt) error(`worktree not found: ${name}`);
      if (wt!.name === "main") error("cannot delete main repo");
      if (skipConfirm || (await confirm(`Remove ${wt!.name}?`))) {
        await removeWorktree(repo!, wt!.path);
        console.error(`Removed ${wt!.name}`);
        if (cwd.startsWith(wt!.path)) {
          output(`cd "${repo!.root}"`, repo!.name);
        }
      }
      return;
    }

    const wt = await deletePicker({
      repoName: repo!.name,
      worktrees,
      currentPath: cwd,
    });

    if (wt) {
      await removeWorktree(repo!, wt.path);
      console.error(`Removed ${wt.name}`);
      if (cwd.startsWith(wt.path)) {
        output(`cd "${repo!.root}"`, repo!.name);
      }
    }
    return;
  }

  if (command === "main") {
    const mainPath = await getMainRepoPath();
    if (mainPath) output(`cd "${mainPath}"`, repo!.name);
    else error("could not find main repo");
    return;
  }

  if (command === "list") {
    const worktrees = await listWorktrees(repo!);
    for (const wt of worktrees) {
      console.error(`${wt.name} (${wt.branch})`);
    }
    return;
  }

  const worktrees = await listWorktrees(repo!);
  const initialQuery = args.join(" ");
  const cwd = process.cwd();
  const currentWt = worktrees.find(
    (w) => cwd.startsWith(w.path) && w.name !== "main",
  );
  const result = await picker({
    repoName: repo!.name,
    worktrees,
    initialQuery: initialQuery || currentWt?.name || "",
  });

  if (result.type === "select" && result.value) {
    const wt = worktrees.find((w) => w.path === result.value);
    output(`cd "${result.value}"`, wt?.name || repo!.name);
  } else if (result.type === "create" && result.value) {
    const name = result.value.replace(/\s+/g, "-");
    const wtPath = await createWorktree(repo!, name);
    const date = new Date().toISOString().slice(0, 10);
    output(`cd "${wtPath}"`, `${date}-${name}`);
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
  wt new <name>         Create new worktree from origin/main
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
