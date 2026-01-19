# Commits

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Branch: `feat/dark-mode`, `fix/login-bug`
- PR title / commit: `feat: add dark mode`, `fix: login redirect`

# Release

- Check `git log` and merged PRs since last tag to determine semver bump (major requires user confirmation), then `git tag vX.Y.Z && git push --tags`.
