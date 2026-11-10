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
| Bug combat and progression | `server/barn.js`, `server/engine/bug-combat.js`, `server/engine/bout.js`, `client/src/barn/`; see [Bug combat](bug-combat.md). |
| Personal rooms | `server/rooms.js`, `server/catalog/room.js`, `client/src/room/`; see [Personal rooms](personal-rooms.md). |
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

Personal-room metadata is stored in `rooms.json` (schema version 1): arrangement revision, theme, owned-item placements, shelf identities/mounts/styles/sizes, wall-display mounts, floor/rug/wardrobe finishes and furniture positions per player. Older records without shelf/wall-display/finish/furniture fields retain the original two small shelves, two upper back-wall displays, finishes and furniture positions; explicit empty shelf lists remain empty. Shelf `sizeId` is optional (`standard` or `wide`); omitted sizes in older client writes preserve an existing size, and large-shelf extra slots use the existing placements list. The optional `wallDisplays` layout field preserves current mounts when omitted and validates both display IDs, approved distinct mounts and clearance from shelves, furniture and the resident when supplied. It does not duplicate balances, inventory or pet clocks. Previously stored sharing flags are ignored: rooms and exact financial balances are visible to signed-in visitors. Room writes persist before replacing their in-memory state; layout revisions reject conflicting edits. Deleting an account removes its room record. See [Personal rooms](personal-rooms.md#api-and-persistence) for the contract and limits.

Keep the data directory to preserve local state. Stop the server before manually inspecting or changing saved state, and keep a copy before intentional maintenance. Atomic file replacement does not provide a transaction spanning multiple files, and separate server processes do not share an in-memory store. Do not assume this design supports multiple concurrent replicas against one data directory.

## Validation and known baseline

Build the frontend and run tests appropriate to the change. For public-table discovery and account deletion:

```sh
node --test test/public-tables.test.js test/delete-account.test.js
```

For UI changes, check both desktop and mobile, including a short/narrow viewport, loading and empty states, and the primary interaction. For the poker and blackjack tables, also check a large window (2560×1440 and 3840×2160 at 100% scaling). Above the 1080p felt size, poker seats, cards and table labels grow with the felt (`tableScale` in `client/src/ui.jsx`). The top bar, footer, poker header, side panel and action bar, and the whole blackjack card, step up by window size (`--ui` at the end of `client/src/styles.css`). At 1080p and below nothing changes; the multi-table view keeps its normal chrome size. For API or persistence changes, exercise the actual HTTP boundary, invalid input, and existing saved records where relevant.

For host settings, `node --test test/host-settings.test.js test/v42.test.js test/game.test.js` covers the new update path alongside existing auto-check and poker rules. See [Host options and room history](table-options-and-history.md) for the host controls and lobby filter checks.

For personal rooms, run `node --test test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js test/room-wagon.test.js`, then the build and full suite. The focused tests exercise permissions/projection, ownership, furniture/style persistence, furniture placement rules and dragging, layout draft actions and bounded camera/wealth geometry. They do not prove browser GPU rendering, physical-phone performance or live deployment. Verify the actual room at desktop, 390px, 320px and short landscape, plus shelf gestures/button alternatives, non-WebGL controls and owner/second-account visitor paths; see [Personal rooms](personal-rooms.md#verification-and-limits).

On Windows, restricted execution can produce `EPERM` during atomic renames in the system temporary directory. Retry with `TEMP` and `TMP` set to a writable temporary directory inside the workspace, or use the approved unrestricted test context when needed. Keep the temporary test directory outside committed files. An environment failure does not establish a source regression or a passing test run; record the actual rerun result.

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

### Personal-room verification — November 9, 2026

The personal-room branch was rebased onto `7fb185e` before final validation. All 43 focused room domain/API/scene/draft tests passed using `node --test --test-concurrency=1 test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js`. These cover authorization, visitor projection, exact wealth, revisions and failed writes, legacy defaults, shelf/style validation and persistence, draft actions, bounded geometry, hold/release cancellation and full-turn hidden-wall picking. `npm run build` passed, retaining two existing duplicate `data-test` attribute warnings in `BlackjackPage.jsx`.

The final sequential full-suite retry, `node --test --test-concurrency=1 'test/*.test.js'`, ran 325 tests: 319 passed and six failed. Four failures were the existing Doom Windows URL-to-path errors; one was the previously observed Slack stale-alert assertion. The sixth was the unchanged randomized Fawn odds test, whose cash count was 242 against a limit below 240; rerunning `node --test --test-concurrency=1 test/fawn.test.js` passed all five tests. All room tests passed in the full-suite retry. This is not a passing full suite.

The first final full run had 314 passes and 11 failures, including six failures associated with intermittent Windows atomic-rename `EPERM` errors. Retrying with `TEMP` and `TMP` set to the shorter writable `C:\Projects\buffalo-bills-academy\.scratch\room-final-test-temp` directory eliminated those rename errors. Both runs and the isolated retry are separate observations; no unrelated game rules or test assertions were changed to obtain these results.

Browser checks used synthetic local accounts/data. Desktop, 390px, 320px and 844×390 layouts were checked, with no horizontal overflow in the narrow/short views. Checks covered oddity clicks and contextual desk/yard placement; legacy two-shelf defaults; adding/styling/filling all four shelf identities; moving a filled shelf with a desktop hold-and-drag or location buttons; removal, cancel restoration, save/reload and returned inventory; floor/rug/wardrobe finishes; immediate pet/clothing changes during a layout draft; preview returning to the draft; navigation protection; exact owner balances and second-account visitor separation; money hover/focus/Escape; zoom/reset and full-turn wall cutaways. After deliberate WebGL context loss, view buttons disabled while furniture/style controls remained usable; reloading restored 3D.

The final rebased build also passed browser checks for the account/profile room entry points, preserved upstream avatar/account controls, unsaved navigation, and refreshing selected Pet/Wardrobe panels after care or clothing changes in another tab. A sequencing self-check covered stale reads after mutations, panel changes and unmount; accessory-fit saves invalidate older panel reads too. All 48 local documentation links (including seven heading anchors) resolved, and the personal-room guide's JSON example passed through the actual room-save contract. See [Personal rooms](personal-rooms.md#verification-and-limits) for supported behavior and persistence details.

Physical-phone gestures/performance and iOS Safari remain unverified. The resident outfit is approximate; wardrobe details use the existing exact avatar rendering. Arbitrary furniture placement and pointer camera gestures are not implemented. These are local checks, not a production deployment.

The November 9 room/yard refinement keeps the original plain dark backdrop and painted rear-window view, with a wider side yard, matching fence/path, open glazed doorway and detailed covered wagon. The room and yard each have 75% more floor area, with unchanged furniture sizes and adjusted mounts, click targets and camera framing. All 48 focused room checks passed, including measured floor areas, furniture dimensions, shelf clearance/dragging, doorway/glazing behavior, full-turn camera framing, actual wagon bounds/openings, model picking and the empty-yard fallback. The build passed with the same two existing blackjack warnings. Browser checks at 1280×800 and 320×740 confirmed the larger layout, direct wagon/desk/shelf/cash selection, shelf movement and cancel, rotation/zoom/reset, and narrow-screen framing without horizontal overflow. All 48 local documentation links still resolved. This is a visual/client-only change with no API or persistence changes; the full suite was not repeated, and the preceding 325-test observation remains the latest full-suite result. Physical-phone performance and Safari remain unverified.

### Movable room furniture — November 10, 2026

Owners can move, turn and (for the desk and wardrobe) put away room furniture within server-checked floor-plan rules; positions are an optional `furniture` field in the existing room record. All 52 focused room checks passed with `node --test --test-concurrency=1 test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js test/room-wagon.test.js`, including save validation, fallback for bad stored positions, draft moves/turns/storage, hold-drag previews and view-relative arrows. `npm run build` passed. All 87 local documentation links resolved and the guide's JSON example saved through the real room contract.

A browser check against an isolated local server and a development account at 1280×800 and 320×740 covered the move arrows (including after turning the view), a refused turn against the wall, putting the wardrobe away and back, saving, and reloading the saved arrangement, with no horizontal overflow. Dragging was exercised with scripted pointer events and a stubbed pointer capture, not a real held mouse or finger. A sequential full-suite run after the change, `node --test --test-concurrency=1 "test/*.test.js"`, ran 334 tests: 329 passed and five failed. Four were the existing Doom Windows URL-to-path errors and one was the previously observed Slack stale-alert assertion; all room tests passed. This is not a passing full suite. A second-account visit, physical phones and Safari were not rechecked for this change.

A follow-up the same day makes the resident stand at the centre of the rug wherever it is moved, with the keep-clear spot following it. The focused room tests (52) and the build passed again, and a browser check confirmed the resident moving with the rug; the full suite was not repeated for this follow-up.

### Bug combat and progression — November 10, 2026

The [combat guide](bug-combat.md) documents level-3 entry, moves through level 10, saved setups, separate participation XP, replay compatibility and the API/persistence additions. No new dependency, environment setting or setup command is needed.

- `node --test test/bug-store-items.test.js test/bout.test.js test/barn-combat-api.test.js test/bug-combat-engine.test.js`: 24 passed. Coverage includes actual authenticated requests, strict setup validation, every fight outcome, rewards beyond the care cap and at level 10, no replay/cooldown rewards, failed-save rollback, opponent isolation, legacy records, deterministic effects and bounded replays.
- `npm run build`: passed; the two existing duplicate `data-test` warnings in `BlackjackPage.jsx` remain.
- `node --test --test-concurrency=1 test/*.test.js` with workspace-local `TEMP`/`TMP`: 354 tests, 349 passed, five failed. Four were the existing Doom Windows URL-to-path errors and one the Slack stale-alert assertion. The new combat tests all passed. This is not a passing full suite.
- Local browser checks at 1280×800, 390×844, 320×740 and 844×390 covered locked moves, the two-special limit, failed-save draft retention, save/reload, level-up and maximum-level XP, replay reward wording, proportional HP bars, tab keyboard navigation and modal focus/escape/return. No horizontal overflow was observed. Legacy replay rendering also passed a separate server-rendered assertion check.
- All 100 local documentation links resolved, and the combat guide's JSON example was accepted by the actual setup-save method.

A deterministic balance sample ran 377,000 simulated bouts: 435 species pairs × 200 seeds at levels 3, 4, 6 and 10, 27,000 same-species stance comparisons, and 2,000 same/adjacent-level comparisons. With equal condition, no gear and the default available specials, species-average scores ranged from 47–52% at level 3 and 42–59% at level 10 (draws count as half a win). Particular default matchups ranged about 27–74%. Stance pair averages were near 50%, and each stance pairing favored different species. This supports an initial tuning pass, not exhaustive balance across all selected moves, conditions or equipment.

Physical phones, Safari and live player behavior were not checked. Production deployment was not performed; pushing or merging this public snapshot does not deploy it.

The same-day visual growth follow-up adds small size gains through level 10, species-appropriate larval artwork at levels 1–2 and adult artwork at level 3, alongside smaller nymph-like forms and the Railroad Worm's retained larviform body. The Barn, room, store previews and recorded bouts share the same rendering rules; no API, persistence or combat-stat changes are involved. `node --test test/bug-growth.test.js test/room-scene.test.js test/bug-store-items.test.js test/bout.test.js test/barn-combat-api.test.js test/bug-combat-engine.test.js` passed all 48 tests, and the build passed with the same existing blackjack warnings. The five growth tests cover all 30 species, stage-specific sprite caches, pixel bounds, cosmetics, every level's size and stable floor positioning, including room textures and unchanged egg/memorial sizes.

Browser checks covered the 390px Barn, an immediate level-2 larva to level-3 adult change, level-3 to level-4 growth with reduced motion, desktop terrarium scaling, and a desktop preview of each new body type, caddisfly metamorphosis and retained nymph/larviform bodies. All 101 local documentation links resolved. The full suite was not repeated for this visual-only follow-up; the preceding 354-test result remains the latest full-suite observation. The life-stage guide documents the compressed pupal interval and family-level stylization; physical-device/Safari checks remain unverified.

### Direct room dragging and activity — November 10, 2026

Furniture and shelves now drag after a small pointer movement, without a hold. The resident has gentle idle movement and occasional silent speech bubbles, and a low-poly faun makes rare cosmetic visits to the yard. Activity pauses during editing, supports **Pause activity** and reduced motion, and does not alter the room API or persisted data. See [Personal rooms](personal-rooms.md#a-little-life-in-the-room).

`node --test test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js test/room-wagon.test.js test/room-activity.test.js test/room-faun.test.js` passed all 61 focused tests. Checks include direct dragging and cancellation, keeping the grabbed point under the pointer when zoom crops the furniture's origin, activity timing and lifecycle, and bounded faun geometry. `npm.cmd run build` passed with the same two existing duplicate `data-test` JSX warnings in `BlackjackPage.jsx`.

The final `npm.cmd test` run completed 381 tests: 376 passed and five failed. Four were the existing Doom Windows URL-to-path errors (`C:\C:\...`) at `test/doom.test.js:15`, `:28`, `:37` and `:80`. The fifth was the previously observed Slack stale-turn alert assertion at `test/slack.test.js:319` (actual `1`, expected `0`). All room tests passed; the full suite is not passing.

Local browser checks at 1440×900 verified immediate mouse dragging of the desk, its moving preview, valid drop and Cancel restoration. Emulated touch dragging also moved the desk at 390×844. Temporary browser-clock advancement exercised speech and faun appearances without changing production timing. **Pause activity** hid both and restored a still pose; reduced motion showed a static faun. Speech fit at 390px, and 320×640 and 844×390 layouts had no horizontal page overflow. Simulated WebGL context loss stopped activity and retained the labeled room controls. All temporary emulation and clock changes were cleared, and the demo was reloaded. Physical phones, Safari and production deployment were not checked.

### Room detail and wall arrangements — November 10, 2026

Rooms now support six shelves across twelve mounts on both walls and two movable wall displays across eight mounts. Shared collision checks keep shelves, their contents and wall displays clear of each other, floor furniture and the resident, including at the corner; dragging and location controls edit the same Save/Cancel draft. Removing a shelf returns its oddity to storage. The optional `wallDisplays` field extends schema version 1 with strict validation and preserves existing mounts when omitted; legacy records keep their original display positions. The server checks the complete resulting arrangement even when an older client omits the new field. Wall placement uses approved mounts rather than arbitrary coordinates.

The renderer follows up to 2× display density within 4096×2160 dimensions and an approximately five-million-pixel budget. Procedural prop detail and 512-pixel-wide framed artwork improve close views. The articulated resident gestures and can step at most 0.55 units along a clear route near the rug. Hidden tabs and scenes scrolled off screen pause rendering and retain elapsed activity time, including under reduced motion. Activity remains cosmetic and local to each viewer.

`node --test test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js test/room-wagon.test.js test/room-activity.test.js test/room-faun.test.js test/room-oddities.test.js` passed all 77 focused tests. Coverage includes added shelf/display mounts, collision checks against furniture and the resident, legacy requests that omit `wallDisplays`, bounded oddity models and texture disposal, resident routes and visibility timing. `npm.cmd run build` passed with the same two existing duplicate `data-test` JSX warnings in `BlackjackPage.jsx`.

`npm.cmd test` completed 397 tests: 392 passed and five failed. Four were the existing Doom Windows URL-to-path errors at `test/doom.test.js:15`, `:28`, `:37` and `:80`; the fifth was the previously observed Slack stale-turn alert assertion at `test/slack.test.js:319`. All room tests passed; this is not a passing full suite. All 103 local documentation links resolved, and the guide's JSON example passed through `Rooms.saveLayout` with the current mount/furniture/resident collision checks using an in-memory store. The [Personal rooms](personal-rooms.md#verification-and-limits) guide includes the current focused command.

Local browser checks verified desktop picture dragging between walls, emulated touch shelf dragging with its contents at 390×844, adding and filling six shelves, removal and Cancel restoration, and disabled occupied/blocked mounts. At an emulated 3840×2160 viewport with 2× density, the renderer used a 4096×968 buffer without a WebGL error. Scrolling the canvas fully out of view kept both the frame count and activity clock unchanged; reduced motion restored a still pose. Temporary clock advancement exercised the detailed faun and speech, and a resident step moved the articulated model along its clear route. The final shelf-bracket orientation fix passed all 24 scene tests and the build. Temporary emulation and clock changes were cleared, and the user's pre-existing unsaved demo arrangement was restored and verified unchanged. No browser console errors were recorded.

Save/reload, revision conflicts and collision rejection were exercised through domain/HTTP tests; the browser checks canceled their temporary arrangements. Physical phones, Safari, GPU profiling and production deployment were not checked. No new dependency, environment variable or setup command is required.

### Shelf sizes, direct controls and lighting — November 10, 2026

The sidebar now uses a short drag hint instead of wall-location grids. Adding a small one-item or large three-item shelf automatically selects a clear mount; moving, resizing, styling and displaying items remain one Save/Cancel draft. The six-shelf limit is unchanged. Large shelves retain their base ID for the centre slot and add `-slot-2`/`-slot-3` placements; shrinking returns outer-slot items to storage. Optional `sizeId` preserves existing sizes in older client writes. More closely spaced approved mounts give dragging finer placement on both walls, and only the current destination receives a drop preview. With a selected object and the canvas focused, arrow keys move it using the same collision rules; previous/next clear-spot buttons appear only after WebGL failure.

Warm lamplight varies slowly by at most 5% during activity, with a steady light while paused, editing or using reduced motion. One 1024×1024 PCF shadow map is cached and refreshed at 120ms active-animation intervals or after scene changes. Transparent picks, glass and unlit artwork do not cast shadows. Lighting adds no external assets, network requests, dependencies or persisted state.

The combined validation below covers these changes together with the subsequent room proportions and faun visits. The [Personal rooms](personal-rooms.md#verification-and-limits) guide contains the current focused command, including lighting and faun-route checks. Earlier results above describe the preceding implementation.

Documentation checks passed: all 104 local links resolved, and the guide's large-shelf JSON example saved through `Rooms.saveLayout` with its outer-slot item. A follow-up request omitting `sizeId` preserved the large shelf. These checks used an in-memory store and changed no local player data.

### Room proportions and faun visits — November 10, 2026

The left, back and glazed yard walls share one height derived from an 8½-foot wall against the resident's approximate 5′11″ proportions. The open yard door retains a 6′8″ proportion, with upper glazing filling the space above it. Shared camera and shadow bounds include the taller walls, and the existing wall cutaway and horizontal floor plan remain unchanged. These are visual proportions for the stylized character, not physical measurements of its hat or hair.

The faun first appears after 20–40 seconds of active viewing, stays for 18 seconds and leaves a 2–4-minute gap before returning. He peeks out, speaks during seconds 4–13 and retreats over the final four seconds. Resident chatter waits during the visit and for at least 15 seconds afterward. Room and yard routes account for the full umbrella footprint, current furniture, wall displays, shelves and the resident; a reserved yard-path appearance remains available when neither route fits. Reduced motion keeps his pose still while preserving the scheduled speech. These visits remain local cosmetic events, separate from the existing daily faun encounter.

The resident's shared mount-collision height includes the taller model and hat while keeping its existing floor footprint. No new persistence field or default-layout rewrite is involved. The shadow-frustum height bound was adjusted from 15 to 16 units for the taller walls; its measured height was 15.011, and all room corners remained inside the shadow map.

`node --test test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js test/room-wagon.test.js test/room-activity.test.js test/room-faun.test.js test/room-oddities.test.js test/room-lighting.test.js test/room-faun-route.test.js` passed all 99 focused tests. Coverage includes three separate shelf-item targets, dragging by an outer item, keyboard movement, save validation, legacy size preservation, wall proportions, taller-resident clearance, bounded lighting resources, faun speech timing and safe routes. `npm.cmd run build` passed with the same two existing duplicate `data-test` JSX warnings in `BlackjackPage.jsx`.

The final `npm.cmd test` run completed 419 tests: 414 passed and five failed. Four were the existing Doom Windows URL-to-path errors at `test/doom.test.js:15`, `:28`, `:37` and `:80`; the fifth was the previously observed Slack stale-turn alert assertion at `test/slack.test.js:319`. All room tests passed; the full suite is not passing. All 105 local documentation links resolved, and the guide's large-shelf request remained valid with the taller resident's collision height.

At 1440×900, browser checks clicked each of the three visible large-shelf items and selected its own slot. ArrowUp moved the selected shelf, and browser mouse input dragged an outer item and moved the shelf with all three items. Adding, filling, shrinking and removing shelves, followed by Cancel, were exercised. Emulated touch dragging of a large shelf passed at 390×844; 320×740 had no horizontal page overflow. Deliberate WebGL context loss exposed the next-clear-spot fallback, which moved the draft before Cancel and reload.

Temporary clock advancement showed the faun inside the room and behind the wagon, with the correct speech label. Reduced motion kept the pose still with a cached 1024×1024 shadow map; Pause cleared the visit and its shadow. The three taller wall caps matched visually, with an ordinary-height door and upper glazing. All temporary viewport, touch, reduced-motion and clock changes were cleared through reset and reload. The user's original unsaved demo arrangement was restored, compared in full and verified unchanged, with Save room still available; the demo was left open. No browser console errors were recorded. Physical devices, Safari, GPU profiling and production deployment were not checked.
