# Contributing

## Make a focused change

Start from current `main` on a feature branch. Keep changes, tests, and documentation together in a pull request. Preserve existing conventions and dependencies; include all affected callers when changing behavior or an API contract.

```sh
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Use a clean working tree before switching branches. If you have write access, push your feature branch to this repository; otherwise push to a fork and open a pull request against this repository’s `main`.

## Validate and document the result

Run the relevant checks from [Development and troubleshooting](docs/development.md). Include the exact commands and results in the PR. Separate new failures from an established baseline, and explain what was not checked. Never imply that local checks are required GitHub checks unless repository settings enforce them.

Keep documentation in the same PR as the behavior it describes:

| Change | Documentation to review |
| --- | --- |
| Player-facing behavior or privacy | README summary and the matching feature guide, such as [Public tables](docs/public-tables.md). |
| HTTP request/response or error behavior | The feature guide’s API examples and compatibility notes. |
| Commands, environment, dependencies, or persistence | [Development and troubleshooting](docs/development.md), plus README quick-start instructions if affected. |
| A known limitation is fixed or a baseline changes | Remove or update the stale limitation and record current validation. |
| A new documentation page | Add a link from the README or the relevant existing guide. |

For internal changes that do not affect documented behavior, explain “No documentation update needed” and why in the PR. Do not add unrelated documentation just to check a box. Verify examples and relative links against the final code.

The [PR template](.github/pull_request_template.md) prompts authors to record documentation and checks, and [AGENTS.md](AGENTS.md) gives coding agents the same expectation. These are review conventions, not automatic enforcement: a reviewer still needs to check that the documentation matches the change. Branch protection and required CI checks are configured separately by repository maintainers.

## Open and merge a pull request

Describe the problem, resulting behavior, compatibility impact, and validation. Use a draft PR while work is incomplete; mark it ready after the change and documentation can be reviewed. Keep follow-up fixes on the same branch so the PR shows the final result.

Have the change reviewed before merging. If review identifies a new failure or privacy/data-loss concern, address it and rerun the affected checks. Include known validation limits in the final PR description. After merging, update the local checkout with `git pull --ff-only` from `main`.

Do not commit `data/`, `.env` files, credentials, private photos, database copies, or production fixtures. Retain license notices. The public snapshot does not include production deployment configuration; merging a PR does not deploy the live site. Coordinate a live release separately with the maintainer.
