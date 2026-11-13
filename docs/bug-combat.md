# Barn care and combat

One Barn slot holds an egg, living bug or unburied memorial. My Room shows that same pet; it does not create another one or provide passive care. The server owns needs, clocks, progression and fight results.

## XP and the daily care limit

- Free care in the Barn or My Room and store consumables share **120 care XP per UTC day**, resetting at 00:00 UTC. Free care and food give up to 12 XP; misters and heat lamps give up to 6. Once capped, care still improves needs and consumables are still spent.
- At each 24-hour checkpoint since hatching, a living bug earns 10 XP if average needs are at least 25. An active feeder adds 12 XP at that checkpoint, outside the care cap; it gives no immediate XP. Accrual settles when the server next refreshes the pet.
- Food resets the starvation clock. An automatic feeder keeps Fed full and pauses starvation while active; Mood and Clean still decay. A feeder use adds 14 days, up to 60 days ahead; Golden Ambrosia supplies seven days. Misters, heat lamps and toys do not protect against starvation.
- By default, death occurs after 21 days without feeding, or 21 days after feeder expiry, with the server's minimum-life grace period. An empty Fed meter alone does not kill a bug. Visiting or reopening the room does not reset these clocks. A memorial occupies the Barn until buried.
- Buying a consumable does not apply it; **Use** spends it. Toys and gear are permanent equipment. Toys improve active Play rather than supplying passive Mood; equipped battle gear adds at most 6% attack damage and is drawn on the bug. Item-specific amounts and cooldowns are shown in the shop and owned by `server/catalog/bug.js` and `server/shop.js`.

## Leveling and moves

Bouts open at **level 3**, once an hour per bug. Challenge another player's bug, post a bout open to anyone, or join one; there is no automatic opponent or level matching. Both players earn **20 XP**, win, lose or draw, outside the care cap, and both records update. Watching a replay gives no XP or money. Fights cannot injure the pet outside the bout. Five wins earn the title **Barn Menace**.

| Level | Total XP | Unlock |
| --- | ---: | --- |
| 3 | 160 | Basic attack and bouts |
| 4 | 360 | Technique |
| 6 | 1,000 | Species special |
| 8 | 1,960 | Alternative special |
| 10 | 3,240 | Capstone |

The XP curve is `40 * (level - 1)^2`. Level and combat growth cap at 10; XP can still accumulate. Each level after 3 adds 3 HP and 2% base attack damage. Fight XP affects subsequent bouts, not the bout awarding it.

The basic attack is always available. Save up to two learned specials and a `balanced`, `aggressive` or `defensive` stance. Specials have cooldowns in the user's own turns. The Combat tab describes effects; move names do not grant hidden elemental or flying bonuses, and the fighting styles in replays (fliers, hoppers, chargers and so on) are animation only. Condition uses the lowest care need, and gear bonuses do not stack. Initiative, accuracy and damage vary using server-seeded randomness. Piercing level-10 capstones have a 5% chance on a nonlethal hit to leave the target at 1 HP; an ordinary knockout stays a knockout. Criticals are recorded in the replay.

Bugs grow slightly through level 10, with shared size and equipped-art scaling across the Barn, room, shop and bouts. Young forms become adults at level 3 where appropriate; some species retain a similar form. These are stylized life stages, not exact biology. Replays use the historical level/form rather than today's pet.

## The ring, challenges and open bouts

- **The ring** is in the Barn for every signed-in player, with or without a bug. It lists every living bug whose owner is not hidden, the bouts open to anyone and the latest 20 fights, any of which can be replayed.
- **A challenge** names another player's bug and a stake. Both bugs must be level 3; the sender's need not be rested. Nothing is held. It stands for 24 hours; the sender can withdraw it and the owner can decline it. A player can have three out at once, one per opponent. It lapses if either bug dies or is replaced.
- **Accepting** takes both stakes at that moment and resolves the fight immediately for both players, exactly as joining a posted bout does. Both bugs must be alive, level 3 and rested, neither player may have a bout posted, and both must be able to cover the stake. A refused accept leaves the challenge standing.
- The Barn button shows how many challenges are waiting on you, checked once a minute while the page is showing. A player with Slack alerts on also gets one message from Guntrad when challenged, naming the challenger, both bugs and the stake; it is not sent again if the same challenge is repeated, and a Slack failure never fails the challenge.
- A stake is **$0–$10,000 in play money**, in whole cents. Posting holds the host's stake. Joining pays the same stake and resolves the fight immediately; the winner receives the whole pot. A draw refunds both stakes. There are no spectator bets or house fees.
- One listing per player. The host can cancel for a full refund. Listings expire after one hour and are refunded when the Barn next checks them; a missing, dead or replaced host bug also invalidates the listing. Posting and cancelling award no XP and start no fight cooldown.
- The board shows the host's bug, level, condition, gear and combat setup before joining. The host's fighter is captured when posted; the joining bug is captured when joining. Care or gear changes do not change an already-posted fighter. Cancel before changing its combat setup or joining a different bout.
- Held stakes remain part of net worth. Cancel an open bout before deleting the account.
- Signed-in players can see, for every bug in the ring, its name, species, level, looks, record and whether it is resting; and for each recent fight, the bugs, their owners, the blows, the result and the pot. Wallets, payout receipts, combat setups, condition, needs, XP and care history remain private.

## Fight invariants and compatibility

- Both bugs must be alive, at least level 3 and off their one-hour fight cooldown when joining. Any two eligible levels may fight; the board shows the difference before players commit.
- A fight ends at knockout or 32 alternating actions. Surviving bugs compare remaining HP percentages; equal percentages draw. Venom events can make a replay longer than 32 events.
- Existing bugs retain previously learned moves from the old level-1/3/5 schedule, even before the revised unlock level. The two-special limit still applies.
- Old replays retain their original 100-HP presentation and earn no retroactive XP. New replays include maximum HP, moves, the XP award and before/after levels. A participant's own replay may show the opponent's stance and equipped moves; the public replay carries only the bugs as drawn, their owners, the blows and the pot. Room visits include no battle setup, replay or private care history.

## API and persistence

Barn routes require the existing session or supported legacy bearer token and operate on that player's pet; requests cannot nominate another owner.

| Route | Contract |
| --- | --- |
| `GET /api/barn` | Current pen, board, own open bout, bankroll and server time, plus the ring: `roster`, `challenges` (`incoming`, `outgoing`, `max`) and `fights`. Reads settle passive bonuses, expired refunds and any already-committed fight receipt; they never start fights. |
| `PATCH /api/barn/battle` | Save both `stance` and `specials`; reject unknown fields, duplicates, basic/unknown/locked moves or more than two specials (400), and missing/unhatched/dead pets (409). |
| `POST /api/barn/bouts` | `{ "stake": 25 }` posts an open bout. Invalid amount/extra fields: 400; insufficient funds: 402; empty Barn: 404; egg/dead/below-level-3 or another open stake: 409; cooldown: 429. Reposting the same open stake returns the existing listing. |
| `POST /api/barn/bouts/:id/join` | Empty body. Accept the posted stake and resolve for both players. Unavailable/self/own open bout: 409; insufficient funds: 402. A participant retry returns the saved result without another payout or XP award. |
| `DELETE /api/barn/bouts/:id` | Cancel your own open bout and refund. Another player's listing: 404. Retrying the most recent cancellation is harmless. |
| `POST /api/barn/challenges` | `{ "to": "<player id>", "stake": 25 }` challenges that player's bug. Invalid body: 400; insufficient funds now: 402; no living bug there, or a hidden owner: 404; yourself, a bug under level 3 on either side, a different stake to the same bug, or three already out: 409. Repeating the same challenge returns the existing one. |
| `POST /api/barn/challenges/:id/accept` | Empty body. The challenged owner accepts and the fight resolves for both players. Gone, not yours, a bout posted by either player, or a challenger who can no longer cover it: 409; your own funds: 402; either bug resting: 429. A retry after the fight returns the saved result without another payout or XP award. |
| `DELETE /api/barn/challenges/:id` | Withdraw a challenge you sent or decline one you were sent. Someone else's: 404. Repeating is harmless. |
| `GET /api/barn/waiting` | `{ "challenges": n }`: how many challenges are waiting on the caller. The same number is `barnChallenges` in `/api/me`. |
| `GET /api/barn/fights/:id` | The public replay of a fight still in the ring's record, for any signed-in player. Otherwise 404. |
| `POST /api/barn/bout` | Retired automatic matchmaking endpoint; returns 409 directing the caller to the board. |

Example setup, once those moves are learned:

```json
{ "stance": "balanced", "specials": ["technique", "signature"] }
```

Special IDs are `technique`, `signature`, `tactic` and `capstone`; an empty array keeps only the basic attack. The response is the updated Barn view.

`barn.json` retains the pet's optional `battle`, `combatVersion` and `legacyAbilities` fields and `lastBout`. Version-2 bouts include `maxHp`, `xpEarned`, `levelBefore` and `levelAfter`. Version-3 bouts add the bout ID, stake, payout and net result, with rounds oriented to each participant; newer ones also name both owners. Old replays still work.

`barn.json` also holds `challenges`, which carry no money, and `fights`, the ring's record of the latest 20 bouts. A fight is recorded in the same save as the first pet reward for it, so it needs no write of its own and is recovered with that reward after a failed write or restart. Bouts fought before this record existed are not in it.

`players.json` stores `barnBouts.open` with the held stake and fighter snapshot. On joining, both wallets, transaction logs and `barnBouts.lastBout` reward receipts commit together through `commitPlayerDrafts`. Only then does each pet receive XP, its record entry, cooldown and replay. `barn.json` saves `settledBoutId` with those changes; refreshing after a failed pet write or restart applies a pending receipt exactly once. The receipt is tied to that bug's birth time and is not applied to a replacement pet. A player must catch up before entering another fight, so the latest receipt suffices. A failed wallet write leaves the listing and wallets unchanged. Preserve **both files** for backup/restore; do not roll back to code that ignores held stakes or reward receipts.

## Checks

Use the focused Barn/combat/API tests when changing these rules; see [Development](development.md). Check two-player joining, refunds, duplicate joins, failed writes, receipt recovery and legacy pets/replays. Browser checks should cover locked moves, posting/joining/cancelling, stale listings, save failures and replay without duplicate rewards. Pure tests do not establish device rendering or exhaustive game balance.
