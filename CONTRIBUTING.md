# Contributing

Keep this a fun, usable place for friends. [AGENTS.md](AGENTS.md) describes the humor and UI direction.

## Make a focused change

Start from current `main` on a feature branch with a clean working tree. Keep unrelated work out of the PR; use a separate worktree if needed. Reuse existing patterns and dependencies, and include affected callers and tests.

```sh
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Push to this repository if you have access, otherwise to a fork. Open a PR explaining the problem, the resulting behavior and any compatibility or privacy impact. Have it reviewed before merging.

## Check what changed

Use the relevant commands in [Development](docs/development.md). Exercise UI changes on desktop and a narrow/short phone layout; check invalid input and existing saves for API or storage changes. Record actual commands, results and untested areas in the PR. Separate existing failures from new failures; an old baseline does not excuse a regression.

## Keep docs useful and small

Update an existing note when setup, privacy, saved data or a non-obvious contract changes. Fix stale instructions and broken links. Ordinary UI tweaks do not need a new guide, a click-by-click tour or duplicate README prose. Add a document only for information someone needs that the UI, code or tests cannot reasonably provide. Keep test-run details and change history in the PR. If no docs need changing, that is fine.

Preserve local data. Never commit `data/`, `.env` files, credentials, private photos, database copies or production fixtures; retain license notices. These review conventions do not establish GitHub branch protection or required checks. Merging this public snapshot does not deploy the live site; coordinate releases separately with the maintainer.
