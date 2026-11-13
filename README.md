# Buffalo Bill’s Academy

Play poker and blackjack, mine acid, get yelled at by the Foreman, raise bugs for barn fights, and occasionally receive money from a faun. A ridiculous playground for friends, built with Node.js, Express, React and Vite. Play money only.

## Run locally

Requires Node.js 22.12+ and npm. From the repository root:

```sh
npm ci
npm run build
npm run server
```

Open http://localhost:3000. Username accounts work without Google setup. On Windows PowerShell, use `npm.cmd` if the shell blocks `npm.ps1`.

`npm run server` serves the existing build; rebuild after frontend changes. `npm start` also handles first-run setup and conditional building. `npm run dev` has an authentication proxy limitation on port 5173; use port 3000 for complete flows. See [Development](docs/development.md) for configuration, checks and troubleshooting.

## A few things worth knowing

- **Poker privacy:** new tables default to **Private · invite link**. They are unlisted, but anyone with the link can open them and join an available seat. There is no host approval or password. Tables without a visibility field stay private. Other players' profile histories hide private table names and links; aggregate results still include them. Public listings are refreshed snapshots, not seat reservations.
- **Hands and history:** host changes to automatic free checks and skipping preflop apply next hand. Closed tables remain in history. Live and missed activity play on the felt using historical public table states, within the latest 300 log entries. A first visit starts live; returning visitors resume this browser's progress for that player and table, and never earlier than their own last turn: a player's own turns are not replayed. A showdown plays as the cinematic for each seated player, in its place in the order; fold wins stay on the felt. Pause or skip at any time; turn deadlines keep running and taking an action jumps to live play. Older entries without table states remain in HandLog. Unrevealed cards stay private. Gags, smokes and spectacles respect preferences and reduced motion; they do not change poker actions. Switching replay off keeps standalone live gags and smokes.
- **Acid Mines:** collect across deposits into one 100-unit bucket (bigger buckets, faster fillers and deeper shafts are sold, expensively, in the General Store); clock out for partial pay or fill it for automatic payment. Mud and empty departures keep the Foreman's quiz. Eggs still have a 10% chance with an empty Barn and appear near the entrance for 30 seconds. Optional phone tilt keeps sensor data local and has a touch fallback. [Mines maintenance notes](docs/acid-mines.md) cover saved progress, API compatibility and the live-source deployment check.
- **Bugs:** care, supplies and fights share one pet. Fights open at level 3 and award 20 XP separately from the 120 care XP/day cap. Food and feeders matter even while you are away. [Bug care and combat](docs/bug-combat.md) covers the clocks, limits and saved fight behavior.
- **Rooms:** any signed-in player can visit another player's room and see exact cash/chip balances. Layout edits use Save/Cancel; pet care and clothing changes save immediately. [Room maintenance notes](docs/personal-rooms.md) cover privacy and saved layouts.
- **Accounts and avatars:** Account holds sign-in and deletion; Settings holds preferences. Changing a username updates the display name only while it still follows that username; custom names stay unchanged. Selfie processing runs locally and uploads only the finished PNG on save. See [Selfie avatars](docs/selfie-avatars.md) for photo privacy, fallback and model maintenance.
- **Risk bets:** optional ConquestK linking keeps the two sites' accounts and games separate. New bets default to disabled; pending bets still recover and settle when connected. Linked/wagered accounts have deletion restrictions. Read [ConquestK integration](docs/conquest-integration.md) before configuring or changing the ledger.

## Data and contributing

Game state is local JSON and avatar files under `data/`. Preserve that directory; the app uses a single-process store, not a separate database. Optional settings are listed in [.env.example](.env.example). Export them in your shell: `.env` files are not loaded automatically. Leave `DEV_LOGIN` unset outside local testing and never reuse production credentials.

See [Contributing](CONTRIBUTING.md) for focused PRs and checks, and [AGENTS.md](AGENTS.md) for the site's humor and UI direction. Keep documentation small: update useful existing notes when needed; ordinary UI changes do not need another guide.

## Public source snapshot

Tyler's initial public snapshot omits production data, credentials, deployment settings, pre-snapshot history, reference photos and live-site maintenance scripts. Many historical `e2e:*` aliases refer to omitted scripts; use the supported commands in the development guide.

Pushing or merging here does not deploy the live site. Releases require the maintainer's separate deployment process. Local checks do not establish configured GitHub CI or branch protection.

## License

Original application code is MIT licensed; see [LICENSE](LICENSE). Included character art accompanies this project. Third-party components retain their own licenses: the embedded Doom engine is GPL-2.0 and Freedoom game data has its own BSD-style license. Their license, credits, notices and corresponding source are preserved under `client/public/doom/`.

Selfie background removal uses the Apache-2.0 licensed MediaPipe Tasks Vision library and SelfieMulticlass model. Their [license](client/public/avatar-model/LICENSE.txt) and [attribution and model hash](client/public/avatar-model/NOTICE.txt) are included with the public model assets.
