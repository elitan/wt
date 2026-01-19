# wt

Git worktree manager for feature branches. Create isolated workspaces without the mess.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/elitan/wt/main/install.sh | bash
wt setup  # adds shell integration to ~/.zshrc or ~/.bashrc
source ~/.zshrc  # or restart your terminal
```

## Usage

```bash
wt                    # Interactive picker (fuzzy search)
wt <query>            # Search or create worktree
wt <github-url>       # Create worktree from GitHub issue/PR URL
wt new <name>         # Create worktree from origin/main
wt new <github-url>   # Create worktree from GitHub issue/PR URL
wt checkout <branch>  # Checkout existing remote branch
wt rm [name] [-y]     # Remove worktree (-y skips confirmation)
wt main               # Go to main repo
wt list               # List all worktrees
wt upgrade            # Upgrade to latest version
wt setup              # Setup shell integration
wt init               # Print shell function
wt --version          # Print version
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
bun run build
./wt-dev --help
```
