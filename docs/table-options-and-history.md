# Host options and room history

## Change options after a table starts

The host can open the table’s **Info** / **You** panel and use **Host settings** to change:

- **Automatically check when free**: the default for human players in future hands. A player can still override their own **Check if free** checkbox.
- **Skip first betting round**: new hands post the blinds and start at the flop, using the existing skip-preflop rules.

Each checkbox change saves automatically and shows a saving status. Changes apply to the **next hand**, not the hand already being played. The table log announces the host’s change so everyone can see when defaults change. A host can also configure these defaults in a waiting lobby, before the first hand.

Current cards, bets, stacks, action order, deadlines, and each player’s current-hand checkbox are preserved. An explicit personal choice made between hands still overrides the table default for that player’s next hand. Bots continue to make their own decisions rather than inheriting automatic free checks.

These controls do not edit blinds, buy-ins, seat capacity, turn limits, rebuy limits, or visibility. Closed tables cannot be changed. Existing host controls for gags, the Smoke Shop, and closing the table retain their current behavior.

## Find open or finished rooms

Under **Your tables**, choose a filter:

| Filter | Rooms shown |
| --- | --- |
| **Open** — default | Waiting and in-progress rooms, including full rooms you already belong to. |
| **Closed** | Finished rooms, with their results and history still accessible. |
| **All** | Both open and closed rooms. |

Counts describe the corresponding groups in your table history. Changing the filter resets the pager to the first page. If Open is empty, **View closed tables** opens the history and **Start a table** opens creation. Closed rooms are hidden by filtering, not deleted.

The filter applies on desktop and mobile. It does not change ownership or access to any room. **Public tables** remains a separate directory of joinable public rooms and continues to exclude closed or full rooms. See [Public and private poker tables](public-tables.md) for its rules.

## Show cards once per winning hand

After everyone else folds, the winner may show both cards, show one at a time, or choose **Keep hidden**. After showing one card, **Done** keeps the other hidden. These choices belong to that finished hand; a later uncontested win gets a new choice.

**Keep hidden** and **Done** are saved on the server. The same prompt stays closed after refreshing, leaving and reopening the table, changing between desktop/mobile or multi-table layouts, using another device, or restarting the server. A failed save leaves the choice available so it can be retried. Cards already shown remain public; unrevealed cards stay private. These choices do not change chips, bets, or the next hand.

The existing authenticated `POST /api/tables/:code/show` accepts `{ "which": "none", "handNumber": 2 }` to finish that hand's choice without revealing more cards. Only the winner can do this. `which` still accepts `"both"`, `0`, or `1` to reveal cards. The current UI includes `handNumber` for every choice; a stale request is rejected before it can affect a later hand. Older clients that omit it retain the existing show-card behavior.

Run `node --test test/showcards.test.js test/showdown.test.js test/game.test.js` and check dismissal across refresh/navigation, a layout change, and a separate browser session. There is no migration: the existing saved reveal opportunity is removed when the choice is finished. An old prompt that was dismissed only in browser memory before this fix may appear once more until the choice is saved.

## HTTP contract and persistence

`POST /api/tables/:code/settings` uses the existing table-action authentication and returns the refreshed table view. Send one or both supported booleans:

```json
{
  "autoCheck": true,
  "skipPreflop": false
}
```

Only the host can update a nonclosed table. Values must be booleans. Unknown settings, empty input, arrays, and invalid values are rejected rather than silently changing unrelated rules. Validation completes before a change is saved.

The defaults are saved in the existing table settings and survive restart. The active hand already has its own auto-check choices and skip-preflop state, so updating defaults does not replay actions or re-deal cards. Existing service mutation and event notifications distribute the updated view. No new database, migration, or dependency is needed.

Room filters operate on the existing **Your tables** history. They do not remove saved tables or introduce a new public history endpoint.

## Source and verification

| Area | Source |
| --- | --- |
| Host authorization, settings validation, log entry, next-hand behavior | [server/engine/game.js](../server/engine/game.js) |
| Saved mutation and notifications | [server/service.js](../server/service.js) |
| Authenticated settings action | [server/app.js](../server/app.js) |
| Host controls and personal checkbox | [client/src/TablePage.jsx](../client/src/TablePage.jsx) |
| Room filters, counts, empty states, pager reset | [client/src/Home.jsx](../client/src/Home.jsx) |
| Regression tests | [test/host-settings.test.js](../test/host-settings.test.js) |

Run the relevant tests and build from the repository root:

```sh
node --test test/host-settings.test.js test/v42.test.js test/game.test.js
npm run build
```

Verify that nonhosts and closed tables cannot update settings, invalid patches do not partially apply, and current-hand state and money remain unchanged. Check that new hands use the new defaults, personal overrides survive, and updates persist and notify other clients.

For the lobby, check Open / Closed / All counts and rows, full but active rooms, closed-result navigation, each empty state, and switching filters from a later pager page. Check both desktop and mobile, including a narrow phone. [Development and troubleshooting](development.md) describes the local setup and dated baseline failures.

Merging this public snapshot does not deploy the live site.
