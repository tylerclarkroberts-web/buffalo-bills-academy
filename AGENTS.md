# Repository guidance for coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the relevant feature/development documentation before changing behavior. Keep changes focused and use the existing code, UI patterns, dependencies, and test runner.

Documentation is part of the change. Update the matching guide in the same PR whenever player-visible behavior, privacy, API contracts, setup commands, environment variables, persistence, or known limitations change. Keep the README’s quick start and links accurate. For internal changes with no documentation impact, explain that in the PR instead of adding unrelated prose.

Check the final code against documented examples and verify local documentation links. Run checks appropriate to the change and report actual results, separating existing failures from new ones. The dated baseline in `docs/development.md` is context, not permission to ignore new failures or claim a passing suite.

Treat tables without a visibility field as private. Private tables use invite-link access; do not describe them as host-approved or password-protected. Preserve local data and never commit credentials, private photos, session data, or production fixtures.

This is a public source snapshot. A push or merge is not a live deployment. Repository review conventions, branch protection, and deployment authorization are separate; do not claim enforcement or deployment that was not verified.
