#!/usr/bin/env bun

import {
  getRepoInfo,
  listWorktrees,
  createWorktree,
  checkoutWorktree,
  removeWorktree,
  isInsideWorktree,
  getMainRepoPath,
} from "./git";
import { picker, confirm } from "./ui";

const args = process.argv.slice(2);
const command = args[0];

function output(cmd: string) {
  console.log(cmd);
}

function error(msg: string) {
  console.error(`wt: ${msg}`);
  process.exit(1);
}

async function main() {
  if (command === "init") {
    printShellInit();
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
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
    output(`cd "${wtPath}"`);
    return;
  }

  if (command === "checkout") {
    const branch = args[1];
    if (!branch) error("usage: wt checkout <branch>");
    const wtPath = await checkoutWorktree(repo!, branch);
    output(`cd "${wtPath}"`);
    return;
  }

  if (command === "rm") {
    const name = args[1];
    const worktrees = await listWorktrees(repo!);

    if (name) {
      const wt = worktrees.find((w) => w.name === name || w.name.includes(name));
      if (!wt) error(`worktree not found: ${name}`);
      if (await confirm(`Remove ${wt!.name}?`)) {
        await removeWorktree(repo!, wt!.path);
        console.error(`Removed ${wt!.name}`);
      }
      return;
    }

    const { inWorktree } = await isInsideWorktree();
    if (inWorktree) {
      const cwd = process.cwd();
      const wt = worktrees.find((w) => cwd.startsWith(w.path));
      if (wt && (await confirm(`Remove current worktree ${wt.name}?`))) {
        const mainPath = await getMainRepoPath();
        await removeWorktree(repo!, wt.path);
        console.error(`Removed ${wt.name}`);
        if (mainPath) output(`cd "${mainPath}"`);
      }
      return;
    }

    error("usage: wt rm [name] (or run inside a worktree)");
  }

  if (command === "main") {
    const mainPath = await getMainRepoPath();
    if (mainPath) output(`cd "${mainPath}"`);
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
  const result = await picker({
    repoName: repo!.name,
    worktrees,
    initialQuery,
  });

  if (result.type === "select" && result.value) {
    output(`cd "${result.value}"`);
  } else if (result.type === "create" && result.value) {
    const wtPath = await createWorktree(repo!, result.value.replace(/\s+/g, "-"));
    output(`cd "${wtPath}"`);
  }
}

function printShellInit() {
  const script = `
wt() {
  local result
  result=$(command bun "${import.meta.dir}/index.ts" "$@")
  if [[ "$result" == cd\\ * ]]; then
    eval "$result"
  elif [[ -n "$result" ]]; then
    echo "$result"
  fi
}
`.trim();
  console.log(script);
}

function printHelp() {
  console.log(`wt - git worktree manager

Usage:
  wt                    Interactive picker (fuzzy search)
  wt <query>            Search or create worktree
  wt new <name>         Create new worktree from origin/main
  wt checkout <branch>  Checkout existing remote branch
  wt rm [name]          Remove worktree (current if inside one)
  wt main               Go to main repo
  wt list               List all worktrees
  wt init               Print shell integration

Setup:
  eval "$(wt init)"     Add to .zshrc or .bashrc
`);
}

main().catch((e) => {
  console.error(`wt: ${e.message}`);
  process.exit(1);
});
