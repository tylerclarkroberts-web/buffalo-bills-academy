# Public and private poker tables

Poker hosts choose whether a new table appears in the lobby's **Public tables** browser. This changes how players discover a table; it does not change poker rules, seat limits, or buy-ins.

## Create and join a table

1. Open **Start a table** and choose **Friends**.
2. Choose **Private · invite link** or **Public** under Visibility. Private is the default.
3. Select the buy-in, blinds, and any other table options, then open the table.
4. For a private table, share its existing invite link. For a public table, other players can find it under **Public tables**.

The public browser is available beside **Your tables** on desktop and mobile. Each listing shows the table name, host, occupied and total seats, buy-in, blinds, turn limit, and **Waiting to start** or **In progress**. These are game states, not indicators that everyone is online.

**View table** opens the existing table screen without buying a seat. The player can review the buy-in and then use **Deal me in** or select an open seat. The server checks funds and capacity again when joining. If a hand is already running, the new player participates from the next hand.

The lobby reloads its lists every 15 seconds. A table can fill between refresh and joining; a listing does not reserve a seat. When no eligible tables remain, **Start a public table** opens creation with Public selected.

**Your tables** has separate Open / Closed / All filters for your own room history, with Open selected initially. These filters do not change which rooms qualify for public discovery. Hosts can also change two defaults for future hands; see [Host options and room history](table-options-and-history.md).

## What private means

| Visibility | Public lobby | Access through an invite link |
| --- | --- | --- |
| Private · invite link | Hidden | Anyone with the link can view it and join if existing joining requirements are met |
| Public | Listed when eligible | The same existing table viewing and joining flow |

Private means **unlisted**, not password protection, a member allowlist, or host approval. Someone who receives a private link can forward it. Table viewing, events, and fight watching remain accessible by table code; joining still requires a recognized player and the existing funds, capacity, and bot-table checks.

Visibility is selected at creation. There is no host control to change it afterward. Bot practice stays private and retains its separate **Let friends join too** setting.

## Which public tables appear

The server lists a table only when all these conditions hold:

- Its saved visibility is exactly `public`.
- It is a human table, not bot practice.
- It is not closed and has at least one empty seat.
- The requesting player is not already seated there; seated tables appear under **Your tables**.
- If it is waiting to start, its host account still exists. A lobby whose host deleted their account cannot be started and is omitted. In-progress tables do not require a surviving host account for discovery.

Results are ordered by creation time, newest first. There is no short inactivity cutoff: asynchronous tables may have turns lasting a day or more.

## Existing data and profile history

New table records save a top-level `visibility` field in the existing JSON table file. Existing records without that field behave as private. No data migration or bulk rewrite is required, and existing tables are not published automatically.

Table views and **Your tables** responses include the effective visibility. A player viewing their own profile retains the full table history. Other viewers, including anonymous profile visitors and people who shared a private table, see only public table names and links in that profile's game history.

Profile aggregates still include all games: `poker.lifetimeNet`, `poker.gamesPlayed`, hands played, and other lifetime statistics are not reduced to the visible history. The Games tab counts the visible entries; the lifetime overview uses the total game count.

## HTTP contract

Authentication follows the existing API middleware: a valid session cookie or supported legacy player bearer token identifies the requesting player. An unauthenticated request to table creation or public discovery returns HTTP 401.

### Create a table

`POST /api/tables` accepts `visibility` at the top level, alongside `name`, `settings`, and optional `bots`:

```json
{
  "name": "Friday Night",
  "visibility": "public",
  "settings": {
    "maxPlayers": 9,
    "buyIn": 200,
    "smallBlind": 1,
    "bigBlind": 2,
    "turnSeconds": 86400
  }
}
```

The response remains `{ "code": "ABCDEF" }`. Omitting visibility selects `private`. Only the exact strings `private` and `public` are accepted; values such as `null`, `PUBLIC`, or an array return HTTP 400 before a table is saved or a buy-in is charged. Requesting public bot practice also returns HTTP 400.

### Browse tables

`GET /api/public-tables` returns an array of summaries. Each summary contains only:

| Field | Meaning |
| --- | --- |
| `code`, `name` | Table link identifier and display name |
| `hostName` | Host display name, with stored-name fallback for an in-progress table |
| `players`, `maxPlayers` | Occupied seats and configured capacity |
| `buyIn`, `smallBlind`, `bigBlind` | Existing play-money table amounts |
| `turnSeconds` | Per-turn limit in seconds |
| `status` | `lobby` or `playing` for current eligible table states |
| `createdAt` | Creation timestamp in milliseconds since the Unix epoch |

The response is not a raw saved table and does not contain private cards, player credentials, the ledger, or table logs. Joining continues through `POST /api/tables/:code/join`; discovery does not create a separate joining mechanism.

## Code and verification

| Area | Owning source |
| --- | --- |
| Creation validation, persistence choice, discovery filtering and summaries | [server/service.js](../server/service.js) |
| Authenticated discovery route and profile-history filtering | [server/app.js](../server/app.js) |
| Lobby polling, public browser, creation controls | [client/src/Home.jsx](../client/src/Home.jsx) |
| Table visibility label | [client/src/TablePage.jsx](../client/src/TablePage.jsx) |
| Lifetime count and profile empty state | [client/src/People.jsx](../client/src/People.jsx) |
| Responsive layout | [client/src/styles.css](../client/src/styles.css) |
| Visibility, directory, persistence, join, and profile regression tests | [test/public-tables.test.js](../test/public-tables.test.js) |

Run the focused integration tests and frontend build from the repository root:

```sh
node --test test/public-tables.test.js test/delete-account.test.js
npm run build
```

The integration tests exercise private defaults, invalid creation without charges, disk persistence, legacy-private fallback, directory authentication and summary fields, exclusion rules, deleted-host lobbies, late joins, capacity rechecks, private-link joins, and profile filtering with unchanged lifetime totals.

For UI changes, check both desktop and mobile layouts, including a small phone. Confirm that Private is the normal creation default, Public creation is visible to another player, opening a listing does not charge a buy-in, and the empty-state creation action preselects Public. Check that private names and links do not appear in other players' profile histories. See [development notes](development.md) for local setup and the known test baseline.

This public source repository is a standalone snapshot. Merging a change here does not deploy the live site.
