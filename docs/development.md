# Development and troubleshooting

## Install and run

Use Node.js 22.12+ from the repository root:

```sh
npm ci
npm run build
npm run server
```

Open http://localhost:3000. Stop with Ctrl+C. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

| Command | Behavior |
| --- | --- |
| `npm ci` | Installs the committed lockfile's dependencies. |
| `npm run build` | Builds `client/` into `dist/`. |
| `npm run server` | Serves the existing build on port 3000; it does not build. |
| `npm start` | Installs if Vite is missing, builds if the index is missing or `client/` is newer, then starts. Rebuild explicitly after dependency/configuration changes. |
| `npm run dev` | Watched API server on 3000 and Vite on 5173; see the login limitation below. |
| `npm test` | Runs `test/*.test.js` with Node's native test runner. |

Many historical `e2e:*` aliases name scripts omitted from this snapshot. Check that the script exists before using an alias. There is no separate lint command.

### Development authentication on port 5173

Vite proxies `/api` but not `/auth/*`; login, registration, logout and password changes therefore fail on 5173. Use the built frontend on 3000 for a complete local flow. A working health endpoint does not verify login.

## Environment configuration

The app reads the shell environment; it does not load `.env` files automatically. [.env.example](../.env.example) lists optional integration settings without credentials.

| Variable | Purpose / default |
| --- | --- |
| `PORT` | HTTP port; `3000`. |
| `DATA_DIR` | Local data directory; repository `data/`. |
| `STATIC_DIR` | Built frontend directory; repository `dist/`. |
| `PUBLIC_URL` | Public origin for redirects and OAuth. Leave unset for ordinary local testing. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` | Optional Google login requires all three, a random session secret and the configured callback. |
| `SLACK_BOT_TOKEN` | Optional Slack integration; leave unset when testing without Slack. |
| `DEV_LOGIN` | `1` enables development sign-in and test hooks. Leave unset outside local testing. |
| `ALLOW_GUEST` | `0` disables guest creation. Username accounts need no Google setup. |
| `CONQUESTK_URL`, `CONQUESTK_SERVICE_TOKEN` | Optional ConquestK origin and dedicated server credential; see [integration setup and recovery](conquest-integration.md). |
| `CONQUESTK_BETTING_ENABLED`, `CONQUESTK_PILOT_PLAYER_IDS` | New-bet switch (disabled by default) and optional player allowlist. Existing-bet recovery stays enabled. |

Google OAuth's callback is `<PUBLIC_URL>/auth/google/callback`; when `PUBLIC_URL` is unset, it uses the request origin.

For an alternate local port in PowerShell:

```powershell
$env:PORT = '3001'
npm.cmd run server
```

Unset inherited integration credentials for isolated testing. Never commit credentials, private photos, sessions or production game state. [.gitignore](../.gitignore) excludes local data, environment files, dependencies and builds.

## Code map

| Area | Entry points |
| --- | --- |
| Client routing, navigation and lobby | `client/src/main.jsx`, `App.jsx`, `Shell.jsx`, `Home.jsx`; HTTP/session helpers in `api.js`. |
| Server wiring, accounts and storage | `server/index.js`, `app.js`, `auth.js`, `accounts.js`, `store.js`. |
| Poker | `server/service.js`, `server/engine/`, `client/src/TablePage.jsx`, `client/src/table/`. |
| Other games | Matching blackjack, slots, mines and barn modules under `server/` and `client/src/`; bug rules in `server/engine/bug-combat.js` and `bout.js`. |
| Rooms | `server/rooms.js`, `server/catalog/room.js`, `client/src/room/`. |
| Selfies | `client/src/avatar/AvatarMaker.jsx`, `head-segmenter.worker.js`, `CutoutEditor.jsx`, `head-mask.js`. |
| ConquestK | `server/conquest.js`, `client/src/Conquest.jsx`, `test/conquest*.test.js`. |

Poker uses Server-Sent Events to trigger a refetch of each player's view; the public lobby polls every 15 seconds. The same stream marks a signed-in, seated player as at the table while their page is in front (`here` in the view); a page in the background reconnects with `?away` and does not count. This is held in memory only, shown to anyone who can view the table, and dropped a few seconds after that player's last such page closes. The pure poker engine accepts injected time/randomness for deterministic tests.

New poker log entries include compact public table frames for visual catch-up, within the existing 300-entry limit. Frames keep historical occupants and chip counts, never decks or private hole cards; publicly shown cards appear only from their reveal onward. Old entries without frames remain readable in the log and are not reconstructed for playback.

Queued tobacco moments keep a bounded public `pendingSmokes` list in the table until their scheduled time. The normal table timer records each due moment with its current public frame, including in lobbies and after restart; closing the table cancels pending moments. The shop's inventory and legacy tobacco history remain separate.

## Local persistence

`server/store.js` keeps state in memory and writes JSON under `DATA_DIR`, including `players.json`, per-table files in `tables/`, feature/session documents and avatars. Writes use a temporary file followed by rename. Room layout metadata lives separately in `rooms.json`; money, ownership and pet clocks remain in their existing systems. See [room compatibility and persistence](personal-rooms.md#api-and-persistence) before changing its schema or rolling back.

Blackjack earnings in `blackjack.json` accumulate net results when a player cashes out or a human house returns its bank; active sessions are excluded. Older saves recover surviving cash-out records and returned house results, but replaced seats cannot be recovered, so older totals may be incomplete. Keep the earnings fields when maintaining or restoring this file. Tables with individual continuous play keep `round: null` and store each seat's own deck, round and last hand under `lanes` (keyed by seat index); seat chips and a human house's bank stay on the table, so cash-out and earnings work as before.

Version-2 mining saves resolved deposits, bucket contents and prepared settlements in `mines.json`. Bankroll, transaction, statistics and the payment receipt commit together in `players.json`; shift-keyed receipts and Foreman markers make recovery idempotent across the separate files. Holds are memory-only. Read [Mines compatibility and recovery](acid-mines.md#persistence-and-recovery) before changing this flow or rolling back; new bucket shifts must not be processed by the legacy settlement path.

Preserve the data directory. Stop the server before manual state maintenance and keep a backup. Atomic replacement is not a transaction across files, and separate processes do not share memory: multiple writers/replicas must not share one data directory. [ConquestK](conquest-integration.md#persistence-and-recovery) has additional ledger/recovery requirements.

## Validation and known baseline

Run focused tests for the changed behavior, build for frontend changes, and use the full suite for cross-cutting changes. For example:

```sh
node --test test/public-tables.test.js test/delete-account.test.js
npm run build
npm test
```

Exercise actual HTTP requests, invalid input and old saved records when changing API or persistence behavior. For UI changes, check the main interaction, loading/empty/error states, keyboard access, desktop and narrow/short mobile layouts. Poker/blackjack sizing changes also need 1440p and 4K checks at 100% scaling. Model tests and browser emulation do not establish physical-phone, Safari or GPU performance.

- Show-card requests to `POST /api/tables/:code/show` should include the original `handNumber`; stale requests are rejected before affecting a later hand. `which: "none"` saves dismissal without revealing more cards. Keep the legacy omitted-hand behavior covered by `test/showcards.test.js`.
- Mine tilt controls are opt-in and require a secure context (normally HTTPS, not a phone-accessible HTTP LAN address). Sensor data stays local and unsaved; touch fallback remains available. See `client/src/mines/tilt.js` and `test/mines-tilt.test.js`; real-phone comfort and Safari support remain unverified.
- Bucket shifts require versioned probe/extraction requests and server-confirmed collection. The [Mines API and checks](acid-mines.md#api-and-compatibility) cover late responses, stop/retry, expiry, legacy saves and settlement recovery. `npm run sim:mines -- 5000` compares repeatable legacy, unguided and ideal-route timings; it does not verify human play or the deployed bug guide.

Windows temporary-file renames can fail with `EPERM`. Retry with `TEMP` and `TMP` pointing to a writable workspace-local temporary directory excluded from commits. Record the actual rerun result; an environment failure proves neither a code regression nor a passing check.

The suite has no known failures: the Doom Windows path errors and the Slack stale-turn timing race recorded in [PR #33](https://github.com/tylerclarkroberts-web/buffalo-bills-academy/pull/33) are fixed. Treat any failure as new. Put per-change commands, results and browser evidence in the PR; keep only actionable known limitations here.

## Selfie avatar checks

Run `node --test test/avatar-mask.test.js test/selfie-framing.test.js test/cutout-brush.test.js test/head-segmenter.test.js test/avatar-upload.test.js test/facegate.test.js`, then build. Use synthetic or explicitly authorized test photos.

Check camera/upload, framing, automatic removal, manual fallback, brush/keyboard edits, preview, save retry, cancel and page exit. Inspect actual network traffic: the model/runtime must load from this origin, only the finished PNG should upload on save, and the only third-party request should be MediaPipe's metrics post to `odml.pa.googleapis.com`. Original photos, masks and worker input stay local; leaving or successful save clears editing copies. Verify real inference, not just a model download. Preserve model notices and recheck the hash/outbound requests when upgrading; see [Selfie avatars](selfie-avatars.md#model-licensing-and-maintenance).

The live deployment setup is outside this public snapshot. Building, pushing or merging does not deploy the site. Follow [Contributing](../CONTRIBUTING.md) for review and separate release coordination.
