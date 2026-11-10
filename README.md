# Buffalo Bill’s Academy

An asynchronous Texas Hold’em and blackjack game with a small arcade, built with Node.js, Express, React, and Vite. Poker supports two to nine players and configurable turn limits.

## Run locally

Requires Node.js 20+ and npm. From the repository root:

```sh
npm ci
npm run build
npm run server
```

Open http://localhost:3000. Local data is created in `data/`. Username accounts work without Google setup. On Windows PowerShell, use `npm.cmd` if the shell blocks the `npm.ps1` wrapper.

`npm run server` serves the existing build; rerun `npm run build` after frontend changes. `npm start` also provides first-run setup and conditional building. The hot-reload command, `npm run dev`, currently has a known authentication proxy limitation on port 5173; see [Development and troubleshooting](docs/development.md).

## Find and start a game

- **Tables** stays visible in the app header. Below 1100px, **Games** groups Risk bets, Acid Mines, Barn and General Store; larger windows retain their individual shortcuts. Barn and General Store require sign-in.
- **Start a table** puts seats, turn time, rebuys and speed-ups in the same form as name, visibility, buy-in and blinds. Scroll within the form on smaller screens; there is no separate Options step.
- **Your tables** shows who is acting and your position in the current betting round. Failed refreshes keep the last loaded tables visible and offer Retry. See [Host options and room history](docs/table-options-and-history.md) for counting rules and refresh limits.

## Poker table visibility

New tables default to **Private · invite link**. They are unlisted, but anyone with the invite link can open the table and join when a seat is available. Private does not mean host approval or password protection.

Choose **Public** at creation to appear in **Public tables** on desktop and mobile. Listings show the host, seats, buy-in, blinds, turn limit, and game status. Opening a listing previews the table; taking a seat uses the existing buy-in action. A player joining during a hand plays from the next hand.

Existing tables remain private. Other players’ profile histories hide private table names and links while aggregate results remain intact. Full details, listing rules, API examples, and verification are in [Public and private poker tables](docs/public-tables.md).

## Host options and room history

Hosts can change the automatic-free-check and skip-first-betting-round defaults after a table starts. Changes apply next hand and preserve current actions and personal checkbox choices. **Your tables** offers **Open** (the default), **Closed**, and **All** filters; finished rooms remain available for results and history. Card-reveal choices such as **Keep hidden** and **Done** are saved per winning hand, so the same prompt stays dismissed after reopening the table. See [Host options and room history](docs/table-options-and-history.md) for usage, timing, and the APIs.

Returning to a table plays a skippable recap of missed public actions, smokes, gags, and speech across hands. The table saves its latest 300 public events, and this browser remembers completed replay steps separately for each player and table. See [Catch up when you return](docs/table-options-and-history.md#catch-up-when-you-return) for controls, privacy, and retention limits.

## Table spectacles

The General Store's **Spectacles** department sells $2,500–$50,000 one-time-use shows the whole table watches: balloons, fireworks, a blimp towing your name, a buffalo stampede, a saucer and a gold rush. They play through the table replay, never touch the cards, and follow the host's and each player's gag switches. See [Table spectacles](docs/spectacles.md).

## ConquestK and Risk bets

**Risk bets** links to ConquestK and offers optional account linking and fixed-odds play-money bets on eligible public Classic matches. Accounts and games remain separate. New betting is disabled by default; existing bets continue recovering and settling when the integration is connected. See [ConquestK integration](docs/conquest-integration.md) for the player flow, odds, limits, deployment configuration, privacy, and recovery guarantees.

## Selfie avatars

Choose **Change avatar** on your profile picture or from the account menu. In Profile, **Account** holds sign-in and deletion controls; **Settings** holds table preferences and Slack alerts. Each tab scrolls as one pane. [Profile and account](docs/profile-and-account.md) covers these controls, avatar access, display-name changes and save recovery.

Frame a selfie or uploaded photo, remove its background on your device, and correct the cutout before making a low-poly head. The saved picture and 3D preview share that cutout. Manual brushes remain available when automatic removal cannot run; only the finished drawing is uploaded when you save. See [Selfie avatars](docs/selfie-avatars.md) for the flow, local-photo lifetime, download size and limitations.

## Configuration and data

Optional settings are listed in [.env.example](.env.example). Export values in your shell before starting; the app does not automatically load `.env` files. Google OAuth needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and your own `SESSION_SECRET`. Set `PUBLIC_URL` to configure the public origin and callback; otherwise the server uses the request origin. The callback path is `/auth/google/callback`. Slack integration is disabled unless `SLACK_BOT_TOKEN` is set. Leave `DEV_LOGIN` unset outside local testing, and never reuse production credentials.

Game state is stored locally as JSON and avatar files under `data/`; no separate database service is required. Keep that directory when local state matters. See [Development and troubleshooting](docs/development.md) for paths, environment variables, and storage limitations.

## Documentation and contributing

- [Development and troubleshooting](docs/development.md): commands, architecture, configuration, and known issues.
- [Public and private poker tables](docs/public-tables.md): player guide, behavior, API, compatibility, and checks.
- [Host options and room history](docs/table-options-and-history.md): create tables, read turn positions, recover failed list loads, change defaults for future hands, filter rooms, and replay missed public activity.
- [Profile and account](docs/profile-and-account.md): change your avatar or display name, manage sign-in in Account, and find table preferences and alerts in Settings.
- [Bug store supplies](docs/bug-store-items.md): effects, duration, cooldowns, and equipment limits for bug food, toys, style, care, and battle gear.
- [Selfie avatars](docs/selfie-avatars.md): framing, local background removal, correction brushes, privacy and model maintenance.
- [Contributing](CONTRIBUTING.md): branch/PR workflow, validation, and keeping documentation current with code.
- [ConquestK integration](docs/conquest-integration.md): account links, Risk bets, fixed odds, persistence, and rollout.

User-visible behavior, API, setup, and persistence changes should include the corresponding documentation update in the same pull request. The [pull request template](.github/pull_request_template.md) prompts authors to record documentation and validation; [agent guidance](AGENTS.md) carries this requirement into coding-agent work.

## Public source snapshot

This is a standalone source snapshot. Production databases, credentials, deployment settings, historical commits, reference photos, and live-site maintenance scripts are not included. Many historical `e2e:*` aliases refer to omitted private scripts; use the supported commands documented here.

Publishing or merging this repository does not deploy the live site. A live release requires the maintainer’s separate deployment process. Local validation is described in the development guide and each pull request; do not assume that GitHub CI is configured.

## License

Original application code is MIT licensed; see [LICENSE](LICENSE). Included character art accompanies this project. Third-party components retain their own licenses: the embedded Doom engine is GPL-2.0 and Freedoom game data has its own BSD-style license. Their license, credits, notices, and corresponding source are preserved under `client/public/doom/`.

Selfie background removal uses the Apache-2.0 licensed MediaPipe Tasks Vision library and SelfieMulticlass model. Their [license](client/public/avatar-model/LICENSE.txt), [attribution and model hash](client/public/avatar-model/NOTICE.txt) are included with the public model assets.
