# Buffalo Bill’s Academy

An asynchronous Hold’em and blackjack game with a small arcade, built with Node.js, Express, React, and Vite.

## Run locally

Requires Node.js 20+.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Local data is created in `data/`. Username accounts work without Google setup.

Optional environment variables: `PUBLIC_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` (generate your own random value). Google OAuth redirects to `<PUBLIC_URL>/auth/google/callback`. See `.env.example` for names; export values in your shell before starting (the app does not automatically load `.env` files). Never reuse production credentials. Slack integration is off unless `SLACK_BOT_TOKEN` is set. Leave `DEV_LOGIN` unset outside local testing.

This is a standalone source snapshot: no production database, credentials, deployment settings, historical commits, reference photos, or live-site maintenance scripts are included. Some historical npm e2e aliases refer to omitted private maintenance scripts; use `npm run dev`, `npm run build`, and `npm test` for this snapshot. Publishing or changing this repository does not deploy the live site.

## Poker table visibility

New tables default to **Private · invite link**: they are not listed in the public lobby, but anyone with the invite link can open the table and join when a seat is available. This is link-based access, not host approval or a password-protected room.

Choose **Public** when creating a table to list it under **Public tables** for signed-in players. Listings show the host, available seats, buy-in, blinds, turn limit, and game status. Opening a listing does not buy a seat; use the table's existing join action. Joining during a hand takes effect on the next hand. Full tables, closed tables, and bot practice tables are not listed.

Existing tables remain private. Your profile retains your full table history; other players' profile views omit private table names and links while keeping aggregate poker totals. Visibility is selected at creation; host approval and changing visibility later are not included.

## License

Original application code is MIT licensed; see LICENSE. Included character art accompanies this project. Third-party components retain their own licenses: the embedded Doom engine is GPL-2.0 and Freedoom game data has its own BSD-style license. Their license, credits, notices, and corresponding source are preserved under `client/public/doom/`.
