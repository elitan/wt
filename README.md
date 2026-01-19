# wt

Git worktree manager for feature branches. Create isolated workspaces without the mess.

## Install

Requires [bun](https://bun.sh).

```bash
curl -fsSL https://raw.githubusercontent.com/elitan/wt/main/install.sh | bash
```

Then add to `~/.zshrc` or `~/.bashrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
eval "$(wt init)"
```

## Usage

```bash
wt                    # Interactive picker (fuzzy search)
wt <query>            # Search or create worktree
wt new <name>         # Create worktree from origin/main
wt checkout <branch>  # Checkout existing remote branch
wt rm [name]          # Remove worktree
wt main               # Go to main repo
wt list               # List all worktrees
```

## How it works

Worktrees are stored in `~/.wt/<repo-name>/`:

```
~/.wt/
  my-project/
    2025-01-19-new-feature/
    2025-01-19-fix-bug/
  other-repo/
    2025-01-18-experiment/
```

Each worktree is a full git worktree branched from `origin/main`.

## Example

```bash
cd ~/code/my-project

# create new worktree for a feature
wt new auth-refactor
# creates ~/.wt/my-project/2025-01-19-auth-refactor
# cd's into it automatically

# work on your feature...

# go back to main repo
wt main

# later, find your worktree
wt auth
# fuzzy matches "2025-01-19-auth-refactor"

# clean up when done
wt rm auth-refactor
```

## Development

```bash
git clone https://github.com/elitan/wt
cd wt
bun install
bun link

# test locally
eval "$(bun src/index.ts init)"
```
