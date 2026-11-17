# Barn care and combat

A Barn starts with three stalls. Each holds an egg, a living bug or an unburied memorial. One bug is the partner: the one in My Room's terrarium and beside its owner in the mine. My Room shows that same bug; it does not create another one or provide passive care. The server owns needs, clocks, progression and fight results.

## XP and care

- Free care in the Barn or My Room and store food give 12 XP each time. There is no daily cap: the care and item cooldowns are the only limit.
- At each 24-hour checkpoint since hatching, a living bug earns 10 XP if average needs are at least 25. The toy that is out adds 2 to 20 XP at the partner's checkpoint whatever its needs (a stalled bug has no toy and earns none), and an active feeder adds 12; neither gives immediate XP. Accrual settles when the server next refreshes the pet, using the toy that is out at that moment.
- A paid bug item does something free care cannot. Store food feeds like the free Feed and also packs a lunch worth 2 to 10 HP: the bug eats it in its next fight, in the Barn or the mine, the first time it is left standing below half health. Eating costs no turn. It carries one lunch, keeps the bigger, and keeps an uneaten one for the fight after.
- Food resets the starvation clock. An automatic feeder fills Fed, Mood and Clean, keeps all three full and pauses starvation while active, so the bug holds full condition. A feeder use adds 14 days, up to 60 days ahead. Toys do not protect against starvation.
- The Auto-Mister, Cosy Heat Lamp and Golden Ambrosia are no longer sold, because each did less than a free button or the feeder. One already held still shows in its owner's store and still works: 40 Clean or Mood and 6 XP, or a full meal, a 10 HP lunch and seven feeder days.
- By default, death occurs after 21 days without feeding, or 21 days after feeder expiry, with the server's minimum-life grace period. An empty Fed meter alone does not kill a bug. Visiting or reopening the room does not reset these clocks. A memorial occupies the Barn until buried.
- Buying a consumable does not apply it; **Use** spends it. Toys and gear are permanent equipment. Toys improve active Play and earn daily XP rather than supplying passive Mood; battle gear comes in two kinds, and a bug wears one of each: an attack item adds at most 6% to the damage of its hits, a defense item takes at most 6% off each hit it receives (venom and trait damage are not hits), and both are drawn on the bug. Gear equipped before the split moved to its own slot the first time the server started. Item-specific amounts and cooldowns are shown in the shop and owned by `server/catalog/bug.js` and `server/shop.js`.

## Stalls and the partner

- **Stalls.** Three to start. The fourth, fifth and sixth cost $1,500, $4,000 and $10,000 (`STALL_COSTS` in `server/barn.js`), bought from the last slot in the Barn's stall row. An egg, a bug and a memorial not yet laid to rest each take one.
- **Wild bugs.** A bug jarred in the mine takes a free stall at full health and its original level. See [Acid Mines](acid-mines.md).
- **Eggs.** An empty Barn gives you a 15% chance to find an egg each new shift. Any occupied stall takes you out of the roll, including an unhatched egg or an unburied memorial. Catch wild bugs to fill additional stalls.
- **The partner.** The first bug is the partner; **Make partner** on any other hatched, living bug swaps them, except while one of your bugs is in a fight. The mine guide, mine battles, My Room and store items (food, feeders, misters, toys) all act on the partner.
- **A stalled bug lives five times slower** (`BENCH_SLOW`). Its needs decay at a fifth of the rate, it starves after 105 days instead of 21, and its 24-hour XP checkpoint comes every five days. It still needs looking after: care works on any bug, on the usual cooldowns, and gives the usual 12 XP. Swapping partners carries each bug's needs over as they are. A feeder's dates stay on the wall clock, so one bought for a bug that is later stalled covers fewer of its slow days.
- **No empty partner's place.** When the partner is laid to rest, the first living stalled bug becomes the partner.
- **Fights.** Any standing bug can post, join or be called out; the ring's roster lists every living bug, and a challenge names both. An owner has one fight at a time.
- **The Bug Center** treats knocked-out bugs from any stall. The nurse charges $50 for immediate treatment and treats the bug for free an hour after the knockout.

### Parked for later: one-of-a-kind bugs

Left out on purpose, as a possible expansion once a rare tier exists (wild bugs and the jar are in: see [Acid Mines](acid-mines.md)): a legendary species of which only one lives in the whole Academy at a time. Whoever jars it owns the only one, and it is up for grabs again when that owner releases or loses it.

## Leveling and moves

Any hatched bug may bout, from **level 1**, and any bug still standing at the end recovers to full HP immediately, even after a loss on points. A bug reduced to 0 HP needs the Bug Center. Challenge another player's bug, post a bout open to anyone, or join one; there is no automatic opponent or level matching. Both bugs earn **20 XP** and the winner a bonus on top that follows the line (below): 10 in an even fight, up to 18 for the longest shot and as little as 2 for a sure thing. Both records update. A bug guiding its miner in the Acid Mines earns **2 XP** for each pool with acid it finds. Watching a replay gives no XP or money. Five wins earn the title **Barn Menace**.

| Level | Total XP | Unlock |
| --- | ---: | --- |
| 1 | 0 | Basic attack, technique and bouts |
| 4 | 360 | Species special |
| 7 | 1,440 | Alternative special |
| 10 | 3,240 | Capstone |

The XP curve is `40 * (level - 1)^2`. Level and combat growth cap at 10; XP can still accumulate. Each level after 3 adds 3 HP and 2% base attack damage. Fight XP affects subsequent bouts, not the bout awarding it.

Every fight, in the Barn or the mine, is the same turn-based fight in the ring. The bugs act in turn, one action every few seconds. Under the ring, a panel shows what your bug will do next; tap its moves to line up as many as three, and tap a lined-up move to take it back. Each move shows its chance to hit and the damage it would do right now (or the HP it would heal); the line under the buttons spells out the move you last touched, with its poison, guard or weakening and how long it rests after. A bug with nothing lined up, or whose lined-up move is still recovering, picks for itself, so a fight never waits on an owner: one who is away simply gets their bug's own picks, and a fight nobody is watching runs straight to its end. The saved `balanced`, `aggressive` or `defensive` stance steers those picks (a balanced bug mends when hurt and otherwise takes its specials in turn) and still shifts damage dealt and taken. Specials have cooldowns in the user's own turns. Each species also has one trait, drawn from a fact on its sheet (the Combat tab and the panel name it; `TRAIT` in `server/engine/bug-combat.js` holds the numbers). The Combat tab describes effects; move names do not grant hidden elemental or flying bonuses, and the fighting styles in replays (fliers, hoppers, chargers and so on) are animation only. Condition uses the lowest care need, and gear bonuses of the same kind do not stack: one attack item and one defense item count. Initiative, accuracy and damage vary using server-seeded randomness. Piercing level-10 capstones have a 5% chance on a nonlethal hit to leave the target at 1 HP; an ordinary knockout stays a knockout. Criticals are recorded in the replay.

Bugs grow slightly through level 10, with shared size and equipped-art scaling across the Barn, room, shop and bouts. Young forms become adults at level 3 where appropriate; some species retain a similar form. These are stylized life stages, not exact biology. Replays use the historical level/form rather than today's pet.

## The ring, challenges and open bouts

- **The ring** is in the Barn for every signed-in player, with or without a bug. It lists every living bug whose owner is not hidden, the bouts open to anyone and the latest 20 fights, any of which can be replayed.
- **The line** is a bug's chance of winning, worked out by the server: the two bugs as they stand (level, health, condition, gear, packed lunch, stance) fight 400 times with both left to themselves, and the share is rounded to the nearest 5% and kept between 10% and 90% (`line` in `server/engine/bout.js`). Each seed is fought both ways round, so two identical bugs are exactly even and the two corners always add up to 100%. The board shows your chance against every bug that can fight, every open bout and every challenge; the ring names the favourite beside its level. An owner who picks the moves can beat it. It is worked out from condition, gear and stance without showing them, so it hints at what stays private.
- **Stakes follow the line.** Whoever posts a bout or sends a challenge names their own stake. The other corner puts up fair odds against it, `stake × (1 − p) / p` to the whole dollar, where `p` is the first bug's chance (`riskFor`), so a favourite risks more to win less: against a $10 stake from a 20% underdog, the favourite puts up $40. The winner takes both. The line is read again when the fight starts; if it has moved since the page showed it, joining or accepting is refused (409) and nothing is taken.
- **A challenge** names another player's bug and a stake. Both must be hatched and alive. Nothing is held. It stands for 24 hours; the sender can withdraw it and the owner can decline it. A player can have one out per opponent, with no other limit. It lapses if either bug dies or is replaced.
- **Accepting** takes both stakes at that moment and starts the fight, exactly as joining a posted bout does. The player who accepted or joined sees it at once; the other owner's bug fights on its own until they open the Barn, where they can take over. Both bugs must be alive, not fainted and not already in a fight, neither player may have a bout posted, the challenger must cover the stake they named and the accepter what the line asks of them. A refused accept leaves the challenge standing.
- The Barn button shows a count, checked once a minute while the page is showing: challenges waiting on you, bouts other players have open (only while your bug is fit to fight), one while your bug is in the ring, and one for a fight that was decided while you were away. Opening the Barn plays that fight and clears it. A player with Slack alerts on also gets one message from Guntrad when challenged, naming the challenger, both bugs and the stake; it is not sent again if the same challenge is repeated, and a Slack failure never fails the challenge.
- A stake is **$0–$10,000 in play money**, in steps of $10 (`BOUT_STAKE_STEP`); the Barn's stake box opens on $100, or the most its owner can cover. Bout money never has cents. Only the stake a player names is capped; what the line asks of the other corner can be up to nine times it. Posting holds the host's stake. Joining pays what the line asks and starts the fight; both stakes are held until it ends, when the winner receives the whole pot. A draw refunds both stakes. A server restart during a fight calls it off: both stakes are returned and nobody earns XP or a record. There are no spectator bets or house fees.
- One listing per player. The host can cancel for a full refund. Listings expire after one hour and are refunded when the Barn next checks them; a missing, dead or replaced host bug also invalidates the listing. Posting and cancelling award no XP and start no fight cooldown.
- The board shows the host's bug, level, condition, gear and combat setup before joining. The host's fighter is captured when posted; the joining bug is captured when joining. Care or gear changes do not change an already-posted fighter, except its health and packed lunch, which are read when the fight starts. Cancel before changing its combat setup or joining a different bout.
- Held stakes remain part of net worth. Cancel an open bout before deleting the account.
- Signed-in players can see, for every bug in the ring, its name, species, level, looks, record and whether it has fainted; and for each recent fight, the bugs, their owners, the blows, the result and the pot. Wallets, payout receipts, combat setups, condition, needs, XP and care history remain private.

## Sound

A fight's effects and music follow the Barn's one sound switch, which is off until a player turns it on, and stop at once when it is turned off. Both are made in the browser; there are no audio files. The music plays from the first blow to the finish. Each blow is followed by a short pause so its line can be read before the next one lands.

## Fight invariants and compatibility

- Both bugs must be hatched, alive, not fainted and not already in a fight when joining. Any two levels may fight; the board shows the difference before players commit.
- A fight ends at knockout or 32 alternating actions. Surviving bugs compare remaining HP percentages; equal percentages draw. Venom events and a packed lunch can make a replay longer than 32 events.
- Existing bugs retain previously learned moves from the old level-1/3/5 schedule, even before the revised unlock level. The two-special limit still applies.
- Old replays retain their original 100-HP presentation and earn no retroactive XP. New replays include maximum HP, moves, the XP award and before/after levels. A participant's own replay may show the opponent's stance and equipped moves; the public replay carries only the bugs as drawn, their owners, the blows and the pot. Room visits include no battle setup, replay or private care history.

## API and persistence

Barn routes require the existing session or supported legacy bearer token and operate on that player's own bugs; requests cannot nominate another owner. Where a body takes `bug`, it is one of the caller's bugs by its `id` from `stable.bugs`; left out, it means the partner. An id that is not theirs: 404.

| Route | Contract |
| --- | --- |
| `GET /api/barn` | The partner as `pen`, every stall as `stable` (`stalls`, `nextStall` cost or null, `bugs` partner first, each with `id` and `partner`), `lastBout` (the newest fight of any of them), board, own open bout, bankroll and server time, plus the ring: `roster`, `challenges` (`incoming`, `outgoing`) and `fights`. For the line: a roster bug that can fight carries `line` (your chance, keyed by each of your standing bugs' ids), another player's open bout `terms` (`{ win, risk }` for each of your bugs) and a challenge `line` (the challenger's chance) and `risk` (what the challenged would put up). Reads settle passive bonuses, expired refunds and any already-committed fight receipt; they never start fights. |
| `POST /api/barn/care` | `{ "action": "feed" \| "play" \| "clean", "bug"? }`. On its cooldown: 429. |
| `POST /api/barn/partner` | `{ "bug": id }` makes that bug the partner. An egg or a memorial, or while one of your bugs is fighting: 409. Naming the partner is harmless. |
| `POST /api/barn/stalls` | Buys the next stall. Not enough money: 402; all six built: 409. |
| `POST /api/barn/heal`, `POST /api/barn/bury` | Take an optional `bug`. |
| `PATCH /api/barn/battle` | Save the `stance` (optional `bug`); reject anything else, including the retired `specials` (400), and missing/unhatched/dead pets (409). |
| `POST /api/barn/bouts` | `{ "stake": 30, "bug"? }` posts an open bout. Invalid amount/extra fields: 400; insufficient funds: 402; empty Barn: 404; egg/dead/below-level-3 a fainted bug or another open stake: 409. Reposting the same open stake returns the existing listing. |
| `POST /api/barn/bouts/:id/join` | Empty body, or `{ "bug": id, "risk": 12 }`: `bug` to send one other than the partner, `risk` the stake the page showed (409 if the line has moved since). Put up what the line asks against the posted stake and start the fight; the response's `live` is its id. Unavailable/self/own open bout, or a bug already in a fight: 409; insufficient funds: 402. A participant retry returns the Barn as it stands, without another stake, payout or XP award. |
| `GET /api/barn/fight?id=&have=` | The fight your bug is in or has just finished, from your corner, in the replay's shape: `rounds` holds only the blows after the first `have`, starting at `from`. While `live`, it also carries your `moves` (with `readyIn` own turns and the odds as things stand: `hit`, `dmg` as least and most, and where they apply `heal`, `venom`, `guard`, `weaken` and `crit`), your `queue`, the `next` move as things stand and your bug's `trait`. `{ "fight": null }` when there is none. Asking counts as watching. |
| `POST /api/barn/fight/:id/moves` | `{ "moves": ["technique", "basic"] }` replaces your lined-up moves: up to three, each one the bug has learned. Anything else: 400; a fight that is over or not yours: 409. |
| `DELETE /api/barn/bouts/:id` | Cancel your own open bout and refund. Another player's listing: 404. Retrying the most recent cancellation is harmless. |
| `POST /api/barn/challenges` | `{ "to": "<player id>", "stake": 30, "their"?, "bug"? }` challenges that player's bug (`their`, from the roster; left out, their partner) with yours (`bug`). Accepting fights those two. Invalid body: 400; insufficient funds now: 402; no living bug there, or a hidden owner: 404; yourself, or a different stake to the same bug: 409. Repeating the same challenge returns the existing one. |
| `POST /api/barn/challenges/:id/accept` | Empty body, or `{ "risk": 12 }`, the stake the page showed (409 if the line has moved since). The challenged owner accepts and the fight starts (`live`, as when joining). Gone, not yours, a bout posted by either player, or a challenger who can no longer cover it: 409; your own funds: 402; either bug fainted: 409. A retry after the fight returns the saved result without another payout or XP award. |
| `DELETE /api/barn/challenges/:id` | Withdraw a challenge you sent or decline one you were sent. Someone else's: 404. Repeating is harmless. |
| `GET /api/barn/waiting` | `{ "challenges": n }`: the Barn button's count for the caller (challenges, others' open bouts, an unseen result). The same number is `barnChallenges` in `/api/me`. `GET /api/barn?seen=1`, which only the Barn page sends, clears the unseen result and returns `unseenBout: true` that once. |
| `GET /api/barn/fights/:id` | The public replay of a fight still in the ring's record, for any signed-in player. Otherwise 404. |
| `POST /api/barn/bout` | Retired automatic matchmaking endpoint; returns 409 directing the caller to the board. |

Example setup, once those moves are learned:

```json
{ "stance": "balanced" }
```

Move IDs are `basic`, `technique`, `signature`, `tactic` and `capstone`. The response is the updated Barn view. Older saves that chose two specials keep their stance; the choice of specials is ignored.

`barn.json` retains the pet's optional `battle`, `combatVersion` and `legacyAbilities` fields and `lastBout`. Version-2 bouts include `maxHp`, `xpEarned`, `levelBefore` and `levelAfter`. Version-3 bouts add the bout ID, stake, payout and net result, with rounds oriented to each participant; newer ones also name both owners. Version-5 bouts were fought live; their rounds may include a lost turn (`skipped`), a bombardier's pop (`pop`) or a packed lunch being eaten (`type: "snack"`). Since stakes follow the line a receipt also holds `line` (that bug's chance) and `against` (the other corner's stake), and a recorded fight its `pot`; older ones have neither and read as an even $`stake × 2` pot. Old replays still work. A bug's packed lunch is `lunch` (`name`, `heal`) on its own entry, removed when a fight in which it was eaten ends.

`barn.json` keeps the partner in `pens`, stalled bugs in `bench` and bought stalls in `stalls`, all by owner; a stalled bug carries `benchedAt`, the moment its slow clock started. Saves from before stalls need no change: their one bug is the partner.

`barn.json` also holds `challenges`, which carry no money, and `fights`, the ring's record of the latest 20 bouts. A fight is recorded in the same save as the first pet reward for it, so it needs no write of its own and is recovered with that reward after a failed write or restart. Bouts fought before this record existed are not in it.

`players.json` stores `barnBouts.open` with the held stake and fighter snapshot. On joining, both stakes move into `barnBouts.live` in one write and the fight starts; the fight itself lives in memory (`server/fights.js`). A `live` entry whose fight is gone, as after a restart, is refunded the next time the Barn checks. When the fight ends, both wallets, transaction logs and `barnBouts.lastBout` reward receipts commit together through `commitPlayerDrafts`. Only then does each pet receive XP, its record entry, cooldown and replay. `barn.json` saves `settledBoutId` with those changes; refreshing after a failed pet write or restart applies a pending receipt exactly once. The receipt is tied to that bug's birth time and is not applied to a replacement pet. A player must catch up before entering another fight, so the latest receipt suffices. A failed wallet write leaves the listing and wallets unchanged. Preserve **both files** for backup/restore; do not roll back to code that ignores held stakes or reward receipts.

## Checks

Use the focused Barn/combat/API tests when changing these rules; see [Development](development.md). Check two-player joining, refunds, duplicate joins, failed writes, receipt recovery and legacy pets/replays. Browser checks should cover locked moves, posting/joining/cancelling, lining moves up and taking them back in a live fight, leaving one and reopening the Barn mid-fight, stale listings, save failures and replay without duplicate rewards. Pure tests do not establish device rendering or exhaustive game balance.
