# Table spectacles

Spectacles are big, one-time-use shows the whole table watches for a few seconds. They are a late-game way to spend play money once the rest of the General Store is owned. Play money only: nothing here can be bought with, won as, or cashed out for real money.

## Buy and use one

Open **General Store → Spectacles**. Buying puts the spectacle in your pocket; you can hold one of each. Purchases over $1,000 ask you to confirm, like every store item.

At a table where you are seated, choose **Spectacle**, then pick one. It is used up immediately. Everyone at the table sees a full-screen cartoon for about five seconds as part of the table replay, so players who are away see it once when they come back. The table history records it as, for example, "Ann set off a fireworks show".

| Spectacle | Price | What everyone sees |
| --- | --- | --- |
| Balloon Release | $2,500 | A hundred balloons float up past every seat. |
| Fireworks Show | $6,000 | Rockets burst over the felt. |
| Blimp Flyover | $12,000 | A blimp crosses the table towing a banner with your display name. |
| Buffalo Stampede | $20,000 | A herd thunders across the screen and the view shakes. |
| Close Encounter | $35,000 | The saucer from the Acid Mines beams a cow up, then puts it back. |
| Gold Rush | $50,000 | Cartoon gold nuggets rain down and the table glows gold. |

At about $106 a mine shift, the range is roughly 24 to 470 shifts. The store's highest price is now $50,000 (it was $20,000).

## Limits and switches

- A spectacle never touches cards, chips, turns, timers or the replay order of poker actions. The overlay ignores clicks.
- One spectacle per table per minute. A refused spectacle stays in your pocket; it is not queued.
- You must be seated, and the table must not be closed.
- Spectacles follow the gag switches. The host's **Turn gags & spectacles off** button refuses them at that table. A player who turns off **Allow Gags?** in Settings, or mutes the sender's gags, does not see them in the replay; others still do.
- Reduced motion shows a still badge instead of the animation.

## HTTP contract

`POST /api/tables/:code/spectacle` with `{ "item": "show-fireworks" }` returns `{ ok: true, show }`. Errors: 400 for an unknown item, 403 when you don't own it, aren't seated or the host switched gags off, 409 for a closed table, and 429 within a minute of the table's last spectacle. The route is not `/show`, which already reveals cards.

A successful use pushes `{ show }` to the table's event stream and appends a log entry with `ev.k: "show"`, plus `id`, `from`, `fromName`, `seat`, `item`, `name`, `emoji` and `fx`. `GET /api/tables/:code` includes `myShows`, the viewer's unused spectacles.

The one-a-minute limit is held in memory, like the gag rate limits, so a server restart resets it. Ownership is saved with the rest of the store inventory. No new environment variable, dependency or data migration is needed.

## Source and checks

The items are defined in `server/catalog/spectacles.js` and enforced by `Shop.spectacle` in `server/shop.js`. The client lives in `client/src/table/Spectacle.jsx`, with styles under `.show-<fx>` in `client/src/styles.css`. `test/table-activity.test.js` covers use, logging, the rate limit and refusals; `test/store-art.test.js` checks that every spectacle has an overlay and styles.
