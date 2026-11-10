# Development and troubleshooting

## Install and run

Run from the repository root with Node.js 20+:

```sh
npm ci
npm run build
npm run server
```

Open http://localhost:3000. Stop a foreground server with Ctrl+C. On Windows, `npm.cmd` avoids PowerShell execution-policy problems with `npm.ps1`.

| Command | Behavior |
| --- | --- |
| `npm ci` | Installs the committed lockfile’s dependencies. |
| `npm run build` | Builds `client/` into `dist/`. |
| `npm run server` | Starts Express and serves the existing `dist/` build on port 3000 by default. It does not build the frontend. |
| `npm start` | Installs packages if Vite is missing, builds if the built index is missing or `client/` is newer, then starts the server. Explicitly rebuild after dependency or build-configuration changes. |
| `npm run dev` | Starts the watched API server on 3000 and Vite hot reload on 5173. See the authentication limitation below. |
| `npm test` | Runs the checked-in `test/*.test.js` files with Node’s native test runner. |

Many historical `e2e:*` aliases reference scripts omitted from the public source snapshot. Check that a script exists before relying on it. There is no separate lint command configured.

### Development authentication on port 5173

`vite.config.js` currently proxies `/api` to port 3000, but the browser also uses `/auth/*` for login, registration, logout, and password changes. Those routes are not proxied. A local check found `/api/health` working on 5173 while `POST /auth/login` returned 404.

Use the built frontend on port 3000 for a complete local flow until this proxy issue is fixed. A working health check alone does not verify login. This is a documented existing issue; the public-table feature does not change Vite configuration.

## Environment configuration

The app reads process environment variables. It does not load `.env` files automatically. [.env.example](../.env.example) lists the optional integration names without credentials.

| Variable | Purpose / default |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `DATA_DIR` | Local data directory; defaults to repository `data/`. |
| `STATIC_DIR` | Built frontend directory; defaults to repository `dist/`. |
| `PUBLIC_URL` | Public origin used for canonical redirects and OAuth URLs. Leave unset for ordinary local testing. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` | Enable optional Google login when all three are configured. Supply your own random session secret and configure the public callback URL. |
| `SLACK_BOT_TOKEN` | Enables optional Slack integration; leave unset when testing without Slack. |
| `DEV_LOGIN` | `1` enables development sign-in and test hooks. Leave unset outside local testing. |
| `ALLOW_GUEST` | `0` disables guest-player creation. Username accounts do not require Google setup. |
| `CONQUESTK_URL`, `CONQUESTK_SERVICE_TOKEN` | Optional ConquestK service origin and dedicated integration credential; see [ConquestK integration](conquest-integration.md). |
| `CONQUESTK_BETTING_ENABLED`, `CONQUESTK_PILOT_PLAYER_IDS` | New-bet rollout switch (default disabled) and optional Academy player allowlist. Existing-bet recovery stays enabled. |

For a local alternate port in PowerShell:

```powershell
$env:PORT = '3001'
npm.cmd run server
```

Unset inherited integration credentials for isolated local testing. Never commit credentials, personal photos, session data, or production game state. The [.gitignore](../.gitignore) excludes local data, environment files, dependencies, and builds.

## Code map

| Area | Entry points |
| --- | --- |
| React startup and routing | `client/src/main.jsx`, `App.jsx`, `Shell.jsx` |
| Lobby and table creation | `client/src/Home.jsx` |
| Browser HTTP/session helpers | `client/src/api.js` |
| Selfie framing, segmentation worker and correction | `client/src/avatar/AvatarMaker.jsx`, `head-segmenter.worker.js`, `CutoutEditor.jsx`, `head-mask.js`; see [Selfie avatars](selfie-avatars.md). |
| Poker screen | `client/src/TablePage.jsx`, `client/src/table/`; see [Playing at a poker table](table-play.md). |
| Express startup, routes, feature wiring | `server/index.js`, `server/app.js` |
| Poker orchestration and timers | `server/service.js` |
| Poker rules, cards, evaluation, pots | `server/engine/` |
| Blackjack | `server/blackjack/`, `client/src/bj/` |
| Other games | Matching slots, mines, barn, store, and avatar modules under `server/` and `client/src/` |
| Shared play-money bankroll | `server/accounts.js` |
| Accounts and sessions | `server/auth.js`, `server/passwords.js` |
| Persistence | `server/store.js` |
| ConquestK account links and Risk bets | `server/conquest.js`, `client/src/Conquest.jsx`, `test/conquest.test.js` |

The frontend uses browser-history routing. Poker table updates use Server-Sent Events to trigger a refetch of each player’s view; the public lobby instead polls every 15 seconds. The pure poker engine accepts injected time/randomness for deterministic tests.

## Selfie avatar checks

The selfie feature uses the existing build and server commands. The pinned model is in `client/public/avatar-model/`; Vite emits the matching MediaPipe module loader and WASM binary from the lockfile's package. Serve all of them from the application origin. No API key, external image service or new server setting is required.

Run the focused checks and build:

```sh
node --test test/avatar-mask.test.js test/selfie-framing.test.js test/cutout-brush.test.js test/head-segmenter.test.js test/avatar-upload.test.js test/facegate.test.js
npm run build
```

These checks cover framing bounds, shared head masks, semantic labels, transparent holes and boundaries, preservation of masked face detail, brush behavior and avatar routing. They do not prove model accuracy or camera behavior on physical devices. Add the avatar upload/API tests to this command when extending the persistence boundary.

| Browser check | Verify |
| --- | --- |
| Desktop, narrow phone and short landscape | Framing outline matches the cutout; status, brushes and action buttons remain reachable. |
| Camera and upload | Camera permission failure has an upload fallback; sources stay local; repositioning and zoom are usable. |
| Automatic removal | Worker, model, loader and WASM load only after choosing Remove background, using same-origin requests. Record the actual inference outcome, not just a model download. |
| Manual fallback | Cancel a loading attempt with Use manual cutout; exercise download failure, unavailable Worker/OffscreenCanvas/SIMD and timeout. The editor must explain that background still needs manual erasing. |
| Corrections and preview | Keep/Erase, brush size, reset, removed-area toggle and keyboard controls work; Edit cutout retains edits; Adjust framing reuses the photo. Both previews use the edited mask. |
| Save, cancel and leave | Save sends only the finished PNG; failed save allows retry; successful save, cancel/retake and page exit clear editing canvases and stop pending workers. Existing saved avatars stay unchanged. |
| Network privacy | Inspect request destinations and upload bodies throughout load, inference and save. Confirm that original photo pixels, masks and metrics are not sent to another origin. |

Use synthetic or explicitly authorized test photos; do not commit personal images or session data. Include actual test totals, desktop/mobile evidence, fallback results and untested devices in the PR. Preserve model notices and verify its SHA-256 when replacing assets. [Selfie avatars](selfie-avatars.md) records the pinned version, model hash, privacy behavior and player controls.

## Local persistence

`server/store.js` loads state into process memory and writes JSON files, including `players.json`, per-table files under `tables/`, and additional feature/session documents. Avatars also live under the data directory. Writes use a temporary file followed by a rename.

Keep the data directory to preserve local state. Stop the server before manually inspecting or changing saved state, and keep a copy before intentional maintenance. Atomic file replacement does not provide a transaction spanning multiple files, and separate server processes do not share an in-memory store. Do not assume this design supports multiple concurrent replicas against one data directory.

## Validation and known baseline

Build the frontend and run tests appropriate to the change. For public-table discovery and account deletion:

```sh
node --test test/public-tables.test.js test/delete-account.test.js
```

For UI changes, check both desktop and mobile, including a short/narrow viewport, loading and empty states, and the primary interaction. For the poker and blackjack tables, also check a large window (2560×1440 and 3840×2160 at 100% scaling). Above the 1080p felt size, poker seats, cards and table labels grow with the felt (`tableScale` in `client/src/ui.jsx`). The top bar, footer, poker header, side panel and action bar, and the whole blackjack card, step up by window size (`--ui` at the end of `client/src/styles.css`). At 1080p and below nothing changes; the multi-table view keeps its normal chrome size. For API or persistence changes, exercise the actual HTTP boundary, invalid input, and existing saved records where relevant.

For host settings, `node --test test/host-settings.test.js test/v42.test.js test/game.test.js` covers the new update path alongside existing auto-check and poker rules. See [Host options and room history](table-options-and-history.md) for the host controls and lobby filter checks.

During verification of host options and room filters on November 8, 2026, using Node 24.19.0/npm 11.17.0 on Windows:

- `npm run build` passed.
- Public-table and account-deletion tests: 6 passed.
- Host-settings, existing speed-option, and poker-engine tests: 30 passed.
- Full suite: 194 tests, 189 passed, 5 failed.
- Four Doom tests failed before their assertions because their URL-to-path conversion produced `C:\C:\...` paths on Windows.
- The Slack stale-alert test failed its existing assertion and also failed in isolation.

These are recorded observations, not permanent expected failures. Report the current result on every relevant PR, investigate new failures, and update this section when the baseline changes. Do not describe the full suite as passing while failures remain.

The public source snapshot does not contain the live deployment setup. Building, pushing, or merging here does not deploy the production site. See [Contributing](../CONTRIBUTING.md) for the review and documentation workflow.

During verification of selfie cutouts on November 9, 2026, the focused avatar checks passed all 20 tests and the frontend build passed. The full suite ran 251 tests: 247 passed and four Doom tests failed with the existing Windows URL-to-path issue. The previously failing Slack stale-alert test passed in that run; this change does not fix or establish the reliability of that unrelated test.

### UI and UX verification — November 9, 2026

The table-creation, personal-turn summaries, navigation, avatar-entry and display-name changes were checked locally on Windows:

| Check | Result |
| --- | --- |
| `node --test test/table-turn-summary.test.js test/game.test.js test/v42.test.js test/afk.test.js test/public-tables.test.js test/host-settings.test.js` | 53 passed, 0 failed. |
| `node --test test/username.test.js test/avatar-upload.test.js test/facegate.test.js` | 8 passed, 0 failed. |
| `npm run build` | Passed; existing duplicate `data-test` attribute warnings in `client/src/bj/BlackjackPage.jsx` remain. |
| `npm test` | 272 tests: 267 passed, 5 failed. |

Four full-suite failures were the existing Doom Windows URL-to-path issue (`C:\C:\...`). The fifth was a Slack test whose setup hit Windows `EPERM` while renaming `players.json`; its isolated rerun passed 1/1. An earlier full run also hit the fight integration test's random-seed assumption. That failure was reproduced separately with unchanged fight code using fight seed `1` and bot configuration `{ reaction: 1, seed: 5 }`; the fight tests passed in the final full run. These observations do not establish that either intermittent failure is fixed, and the full suite is not passing.

Browser checks used 320×640, 390×844, 844×390, 1366×768, 2560×1440 and 3840×2160 viewports, plus the 1099/1100px navigation breakpoint. They covered:

- Continuous Friends/bot forms, draft retention across layout changes, public/private/bot request settings, and one submission after a delayed double-click.
- Personal-row pagination, long names, countdowns and changing actors; full-row scrolling on short screens; initial-load and refresh failures with Retry.
- Avatar entry from profile/account, generated avatars, Back to profile, and read-only other-player profiles.
- Rename validation, server failure, pending controls, Cancel/Escape and programmatic focus restoration.
- Games destinations while signed in/out, Enter/Space opening, Tab traversal and focus-exit dismissal, Escape with trigger focus restoration, navigation/outside-click dismissal, and closing at the desktop breakpoint. The 320px header also fits a large bankroll, with the full amount kept accessible.

Physical devices, camera capture, background-removal accuracy and production deployment were not checked in this UI pass. The daily faun encounter and dealer chatter were left unchanged.

Personal-table actor/position data remains a 15-second polling snapshot, with additional refreshes on focus/visibility return. The one-second countdown is calculated locally from the last response and does not make the actor or queue live. See [Host options and room history](table-options-and-history.md) and [Profile and account](profile-and-account.md) for the resulting behavior and recovery paths.

### Profile Account and Settings layout

Profile **Account** contains the single username editor, password controls, Google-link status and account deletion. **Settings** contains table preferences and Slack alerts. Each pane owns its vertical scroll area, while its cards use their content height. The layout rules are scoped to these two profile panes, preserving other profile tabs, game screens, endpoints and stored preferences. See [Profile and account](profile-and-account.md#sign-in-and-preferences).

For this layout, check both tabs on a 320px-wide phone, short landscape and desktop. Reach every form and action by scrolling and keyboard, expand the deletion confirmation without submitting it, and check configured and unavailable Slack states. Confirm that the username editor appears only in Account and that existing save, error and pending states remain usable. Record results separately from the earlier UI batch above.

Follow-up verification (2026-11-09): `node --test test/username.test.js test/delete-account.test.js` passed all 6 tests using a workspace-local temporary directory; `npm run build` passed with the existing blackjack duplicate-attribute warnings. Browser checks at 320×640, 390×844, 844×390 and 1366×768 confirmed one scroll owner per pane, natural-height cards, no horizontal page overflow and keyboard access to the bottom controls. The unavailable and configured Slack views were checked using an isolated local stub; no Slack messages were sent. The OAuth return still opens Account, the deletion confirmation can be expanded and cancelled, and Table replay persists across reload. No passwords, Google links or live accounts were changed. The full suite was not repeated for this layout-only follow-up; the earlier integration results remain above.

### Phone table play — November 9, 2026

The phone table menu, the bet and raise sizing panel, larger phone avatars and the display-name/handle link were checked locally on Windows (Node 24, built frontend on a local port with a temporary data directory and development sign-in). See [Playing at a poker table](table-play.md) and [Profile and account](profile-and-account.md#display-name-and-username-handle).

| Check | Result |
| --- | --- |
| `node --test test/betsize.test.js test/chipspot.test.js test/username.test.js` | 13 passed, 0 failed. |
| `npm run build` | Passed; the existing blackjack duplicate-attribute warnings remain. |
| `npm test` | 282 tests: 277 passed, 5 failed. |

The five failures are the four Doom tests with the existing Windows URL-to-path issue and the Slack auto-link retry test. The Slack test also failed alone, and failed the same way with `server/service.js` restored to the previous commit, so it is not caused by this change. The full suite is not passing.

Browser checks used an emulated 375×812 phone, 844×390 and 667×340 landscape, and a 1024×768 desktop window, on a six-seat bot table and a nine-seat table with long names:

- Header: the title no longer shares its row with icon buttons; Menu rows, the stakes/visibility footer, outside-tap dismissal and the wide-screen inline buttons.
- Sizing panel: presets, single taps and press-and-hold on each step button, slider stops across the range (20 to 5,000 at 5/10 blinds), and the confirm label. Row widths fit 375px without wrapping.
- Felt: avatar size 55px at six seats and 37px at nine (39px and 29px before), dropping to 44px at six seats while the sizing panel is open. A script compared the on-page rectangles of every seat, name plate, tag, bet chip, the board and the pot: no overlaps and nothing off screen at six seats (panel closed and open) or, by eye, at nine seats before the flop.
- Desktop Players panel at 1024px: names show about nine characters with an ellipsis instead of one letter; the buy-in column is hidden at that width.
- Names: handle and display-name changes through `PATCH /api/me` and the Account card, with the seat and Players row read back from the table.

Not checked: physical phones, real touch input (hold-to-repeat and the numeric keypad were exercised with synthetic pointer events only), iOS Safari, a table with gag or Smoke Shop items in the menu, the showdown-replay and Invite rows, the multi-table view, and 1440p/4K windows. The landscape measurements were taken while the action bar's entry animation was paused by the hidden preview pane, so the final resting position there was calculated, not observed. Production deployment was not part of this work.
