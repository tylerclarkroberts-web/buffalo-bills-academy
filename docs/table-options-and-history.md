# Host options and room history

## Start a table

Use **Tables** in the app header to return to the lobby, then open **Start a table**. The same continuous form is available on desktop and mobile. Name, visibility, buy-in, blinds, seats, per-turn time, rebuys and speed-ups are together; there is no separate **Options** step. On short or narrow screens, scroll inside the form to reach its remaining settings. The create button follows the settings.

**Friends** shows the human-table controls. **Play bots** shows bot count, practice stack, blinds, turn time, **Let friends join too**, and speed-ups. Bot practice stays private and uses unlimited rebuys. The selected values stay in place when the window changes between desktop and mobile layouts. See [Public and private poker tables](public-tables.md) for visibility and joining rules.

The header keeps **Tables** labeled at every width. Below 1100px, **Games** opens Risk bets and Acid Mines, plus Barn and General Store when signed in. Larger windows keep the individual game shortcuts. Tab moves through the Games links; Escape closes the disclosure and returns focus to its button.

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

Rows remain paged. When the screen is too short for the filters, a full row and page controls together, scroll inside **Your tables** to reach them instead of using a clipped row.

The filter applies on desktop and mobile. It does not change ownership or access to any room. **Public tables** remains a separate directory of joinable public rooms and continues to exclude closed or full rooms. See [Public and private poker tables](public-tables.md) for its rules.

### Read your turn position

During a hand, your table row shows **Your turn** when you need to act. Otherwise it names the current player with **to act** and their remaining turn time, when available. Your own status says **You’re next** when only the current actor is ahead of you, or **N players ahead** when more players still need to act before you.

This position describes the **current betting round**, not a guaranteed number of moves until your next turn. The count follows the engine's clockwise action order and includes the current actor. Empty seats, folded or all-in players, and players sitting out or leaving do not count. Raises can put someone who already acted back into the round; a short all-in can require another call even without reopening raises. Private auto-check choices are not exposed or predicted, so automatic actions can shorten the visible wait after the next refresh.

When you have already acted, the row says **Waiting on this betting round** instead of predicting a later round. Folded, all-in, sitting-out, leaving, joining-next-hand, unseated, out-of-chips and between-hand states have their own labels without a queue count. Waiting lobbies retain **Not started** or **Ready to start**, and finished tables retain **Closed**.

The lobby polls every 15 seconds and requests a refresh when the window regains focus or the page becomes visible. Countdown text updates every second using the last received deadline; the actor and position remain a snapshot until another response arrives. They can therefore lag the table itself, especially for short turns or a failed refresh. Open the table for its current action view.

### Recover a failed list load

Before the first successful response, **Your tables** shows **Loading your tables…** and uses dashes for unavailable counts. A failed first load shows **Couldn’t load your tables.** with **Retry**, rather than reporting an empty history.

If a later refresh fails, the existing rows and counts remain visible with **Couldn’t refresh. Showing last loaded tables.** and **Retry**. The selected filter and pager position stay in place; a successful refresh can reduce the page count when the list changes. Automatic polling continues, and Retry is disabled while a request is in progress. A successful response clears the warning. An empty state appears only after a successful response, including when that last successful response was empty. Changing accounts clears the prior account's list.

## Catch up when you return

Opening a table plays the public activity you have not watched yet in chronological order, including earlier hands, bets, folds, board cards, results, table updates, smokes, gags, and public speech. Social moments use short illustrations and captions in the same sequence as poker actions. The recap records when an item was used; it does not wait a minute between smoking moments.

Use **Pause** / **Resume** to read at your own pace, or **Skip replay** to finish the queued recap immediately. **Table replay** in Settings turns automatic playback on or off. Smoking preferences, gag preferences, muted gag senders, and Guntrad's voice setting are respected. Reduced motion uses still captions instead of movement. Playback waits while the browser tab is hidden, another multi-table pane is focused, or the table itself is not visible. Turn deadlines continue running; skip the recap when you need to act immediately.

Progress is saved in this browser separately for each player and table after each completed step, or when you explicitly skip. Leaving during a step keeps that unfinished step for the next visit. Another browser or device has its own progress, and clearing browser storage resets it.

The first visit after this update may replay retained history once: the old progress key was shared across players, so it is not reused for the new player-specific progress.

The table retains its latest **300 public log entries**. Returning players can catch up across hands within that history; entries older than the retention limit are unavailable. This is a recent-history recap, not an unlimited archive. Smokes, gags, and speech recorded after this change survive server restarts with the table. Previously expired gags and earlier speech cannot be recovered, and old Smoke Shop history is not backfilled into the new replay.

Public speech and cosmetic activity now remain in the table log until older entries are trimmed. Access to the table is unchanged, including invite-link access for private tables. The replay contains public information only; unrevealed hole cards are not added to the log.

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

### Personal-table turn summary

Authenticated `GET /api/my-tables` adds a `turn` object to each existing personal-history row:

```json
{
  "turn": {
    "actorName": "Dan",
    "deadline": 1800000,
    "ahead": 2,
    "state": "pending"
  }
}
```

This is the additional field, not the full row. `actorName` is the current actor's display name and `deadline` is their deadline in Unix milliseconds; both are `null` when there is no current actor. `ahead` counts pending players before the requesting player in this betting round: `0` means their own turn, `1` means they are next, and `null` means no position is available or applicable.

`state` is `pending`, `acted`, `folded`, `all-in`, `sitting-out`, `leaving`, `next-hand`, `not-seated`, `out-of-chips`, or `between-hands`; it is `null` for waiting or closed tables. Existing top-level fields remain compatible: `myTurn` still identifies the requesting player's turn, and the top-level `deadline` still applies only to that player's turn. Public-table discovery does not gain these fields.

The summary is computed for the requesting player's existing table history. It contains no hole cards, deck, other players' auto-check choices, or list of queued player identities. Computing it does not change the hand, balances or saved table; `turn` is not persisted and needs no migration. Tables without a visibility field remain private.

### Table activity and replay

`GET /api/tables/:code` now returns up to 300 entries in `log`, matching the saved table history rather than the previous 120-entry response window. Entries retain their increasing `seq`, timestamp `t`, hand number, and public `text`. Successful gag and smoke uses add structured `ev` records with `k: "gag"` or `k: "smoke"`, public sender/target details, and the item's display fields. Changed, nonempty public speech adds `k: "say"` records. These share the same sequence as poker actions, so playback does not depend on which live notification arrived first. Rejected uses do not add an entry.

The existing gag/smoke POST responses and live event shapes remain compatible. Smoke queue limits and scheduled timestamps remain available to older clients; the quick recap orders the use itself alongside other table activity. The replay setting continues to use `bba.fx.replay`. Replay progress stays in browser storage; it is not an account-level acknowledgment API. No new database, environment variable, dependency, or data migration is required. Existing shop and table saves remain separate file writes; see the persistence limitations in [Development and troubleshooting](development.md#local-persistence).

## Source and verification

| Area | Source |
| --- | --- |
| Host authorization, settings validation, log entry, next-hand behavior | [server/engine/game.js](../server/engine/game.js) |
| Saved mutation and notifications | [server/service.js](../server/service.js) |
| Authenticated settings action | [server/app.js](../server/app.js) |
| Host controls and personal checkbox | [client/src/TablePage.jsx](../client/src/TablePage.jsx) |
| Continuous creation form, room filters, turn rows, load recovery and pager reset | [client/src/Home.jsx](../client/src/Home.jsx) |
| Header navigation and Games disclosure | [client/src/Shell.jsx](../client/src/Shell.jsx) |
| Per-viewer turn summary and API regression tests | [server/engine/game.js](../server/engine/game.js), [server/service.js](../server/service.js), [test/table-turn-summary.test.js](../test/table-turn-summary.test.js) |
| Catch-up selection, progress, and playback | [client/src/table/replay.js](../client/src/table/replay.js), [client/src/table/Replay.jsx](../client/src/table/Replay.jsx) |
| Regression tests | [test/host-settings.test.js](../test/host-settings.test.js) |
| Catch-up and saved social activity tests | [test/replay.test.js](../test/replay.test.js), [test/table-activity.test.js](../test/table-activity.test.js) |

Run the relevant tests and build from the repository root:

```sh
node --test test/host-settings.test.js test/v42.test.js test/game.test.js
node --test test/table-turn-summary.test.js test/public-tables.test.js
node --test test/replay.test.js test/v43.test.js test/table-activity.test.js
npm run build
```

Verify that nonhosts and closed tables cannot update settings, invalid patches do not partially apply, and current-hand state and money remain unchanged. Check that new hands use the new defaults, personal overrides survive, and updates persist and notify other clients.

For catch-up, leave a table, create poker and social activity, and return after the former six-second gag and 24-hour smoke windows. Check chronological playback, reload after completion, leaving midway through a step, Skip, hidden tabs, multi-table focus, reduced motion, preferences, and player/table changes. Verify persistence after restart, the 300-entry boundary, and that no unrevealed cards enter public history. Test narrow mobile and large desktop layouts, including long names and speech, and confirm replay and other table animations do not overlap.

On November 9, 2026, the focused replay, public-log, speech, poker, showdown, and show-card checks passed all 51 tests, and the frontend build passed with the existing duplicate-attribute warnings in the blackjack screen. The latest full run passed 254 of 260 tests: four Doom tests failed on the documented Windows path issue, the Slack stale-alert assertion failed, and a Fawn test failed after a Windows file-rename `EPERM`. The Fawn test passed in the focused rerun; these unrelated failures remain unresolved.

An isolated browser check with synthetic players passed ordered speech/gag/smoke playback, Pause/Resume, mid-step refresh, completed-history suppression, simulated hidden-tab changes, narrow detail tabs, reduced motion, new events during playback, multi-table focus, visible turn deadlines, and serialized showdown playback. Screenshots were inspected at 390×844, 844×390, desktop, and 3840×2160; controls were also checked at 2560×1440. This used desktop Edge, not physical phones or a production deployment.

For the lobby, check Open / Closed / All counts and rows, full but active rooms, closed-result navigation, each empty state, and switching filters from a later pager page. Check both desktop and mobile, including a narrow phone. [Development and troubleshooting](development.md) describes the local setup and dated baseline failures.

For creation, reach every Friends and Play bots setting on desktop, a 320px-wide phone and short landscape; resize with an unfinished form and verify the values survive. Check the Tables link and Games disclosure with keyboard, outside click and breakpoint changes. For personal rows, cover current actor, next player, several players ahead, raises, folded/all-in/away states and no current actor. Simulate an initial load failure, a refresh failure after both empty and populated results, Retry, account switching and return-to-tab refresh. Verify that failures never silently erase the last successful list or present unknown counts as zero.

Merging this public snapshot does not deploy the live site.
