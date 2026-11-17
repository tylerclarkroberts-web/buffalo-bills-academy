# Acid Mines maintenance notes

## Shift behavior

A version-2 shift uses one map and one 100-unit bucket across several deposits. Holding Mine collects five units per second; release preserves confirmed contents. Clock out pays for a partial bucket, and a full bucket settles automatically. The hidden full-bucket outcome is saved once: partial payment is that amount multiplied by collected units / 100, rounded to cents, including mud and jackpots. Empty departures are unpaid and retain the Foreman's quiz; mud retains its quiz; other paid departures use the farewell.

Acid is available when a miner reaches the current deposit; there is no minimum shift duration, maturation timer or travel wait between deposits. Each deposit's size is a share of the shift's bucket, rolled once at clock-in and revealed on first inspection: 5% of deposits fill 1% of the bucket, 25% fill it entirely, 50% fill it halfway, and 20% fill a uniform random 1–100%. The amount is clamped to remaining capacity, so a full-fill roll into a partly filled bucket only tops it up. A pool resolves once and never grows, refills or rerolls. Drained pools advance the target; the next remaining acid is then the guide's target. A full bucket still settles the shift automatically (one cheque, then home) — the bug leads you to every remaining acid until that happens or you clock out. Keep probability details out of player controls.

The door behind the start opens the **Hall of Doors** (`DoorHall.jsx`, `doorHall.js`): Doom, Nanosaur and EL HALO are open, the rest are locked placeholders that rattle and say "coming soon". Each game's files load only when its door opens; leaving removes its frame. Nanosaur (`client/public/nanosaur/`, CC BY-NC-SA 4.0) is the unmodified upstream WebAssembly build plus `webgl-fixes.js`, which converts the 1998 renderer's Mac texture formats and index sizes for WebGL and keeps it out of browser fullscreen; Vite gzips its ~20 MB at build time and the server streams the `.gz` from disk. `npm run build && node scripts/e2e-door-hall.mjs` checks the whole route with screenshots. **EL HALO** (`elhalo/`) is our own three.js arena shooter (original models, generated WebAudio music and sound, no outside assets); it is a lazy chunk, free play only, never calls the server, and `scripts/e2e-el-halo.mjs` covers it.

Only server-confirmed progress survives interruption. Release, cancellation, focus loss, hidden pages, Doom and reload stop extraction. An unfinished shift resumes when clocking in again. After a version-2 shift's 30-minute expiry, the next mining interaction settles its contents rather than discarding them. Existing legacy shifts retain their collection and completion contract, with acid immediately available and no minimum-duration or maturation wait.

## Gear and shafts

Mine gear and shaft permits are General Store items (`server/catalog/mine.js`, the **Mine gear** tab). They are bought once, never equipped, and read at clock-in; a shift keeps the gear it started with. Without any, a shift is exactly the plain Shaft 7 bucket above.

| Gear | Effect |
| --- | --- |
| Buckets (Second Bucket to Golden Bucket) | Capacity of 200, 400, 600, 800 or 1,000 units; the largest owned counts. |
| Bendy Straw, Shop-Vac | Collection is 2 or 10 times the base five units per second; the fastest owned counts. |
| Headlamp Helmet | Longer lamp and fog distance. This is drawn by the browser only. |
| The Foreman's Nephew | `POST /api/mines/nephew` once a UTC day (the faun's day) pays the owner $40 to $90, fixed by player and day, plus $1 for each day he has already worked (up to $30). His record (days, total, best day and a tally of what he did instead) is kept in `mines.json`. It is not a shift: no shift count, history or mining earnings. |
| Dowsing Rod | An arrow along the shortest walk to the current pool. It does not change how much an acid deposit fills the bucket. |

| Shaft | Permit | Most a bucket brings up | Fare | Cave-in per pool |
| --- | --- | --- | --- | --- |
| Shaft 7 | none | 100 | free | never |
| Shaft 8 | $40,000 | 400 | $40 | 4% |
| Shaft 12 | $150,000 | 800 | $80 | 7% |
| Earl's Level | $500,000 | 1,000 | $100 | 10% |

A shift's capacity is the smaller of the bucket and the shaft's limit, so big buckets do nothing in Shaft 7. The fare is charged once when a new shift starts, in the same write as the clock-in, and is never refunded; resuming does not charge again. Deeper shafts are darker. Acid fills are a share of that shift's capacity, so a halfway fill in a 200-unit bucket is 100 units. Acid and mud pay per 100 units, so a 200-unit bucket of ordinary acid pays twice the $80–$120 roll. The three rare finds pay the same for a full bucket of any size: Motherlode $10,000 (0.05%), Alien Skeletons $25,000 (0.02%) and Diamond Well $50,000 (0.01%).

In a permit shaft, each pool after the first may cave in as the miner arrives, decided at clock-in from a separate random source and never sent to the browser beforehand. A cave-in spills a quarter of the bucket's current contents once; state then carries `spill` (`poolId`, `lost`). Later deposits still use their own fill roll, clamped to whatever space is left after the spill, so a cave-in costs volume, or pay if the miner clocks out early.

A permit shaft may also have the other faun waiting at the elevator: 8% of shifts in Shaft 8, 12% in Shaft 12 and 15% on Earl's Level, decided at clock-in from its own random source and never sent to the browser beforehand. He takes a third of whatever the shift pays, rare finds included; the result then carries `twin` (`took`). Shaft 7 never meets him.

About 20% of shifts (any shaft) also have the faun follow you in the tunnels, decided at clock-in from the same encounter roll as the visitor: 28% visitor, 20% faun, never both. Public state carries `faun: true` when he is on the shift. He is solid, bleats, and yields if he would trap you; pay and deposit amounts ignore him.

Prices are deliberately high because the mines are the only source of new money. The owned-bug guide's feeding is not built.

## API and compatibility

All endpoints require the signed-in player. New shifts use `rulesVersion: 2`; existing legacy shifts keep their old request/response contract.

| Request | Contract |
| --- | --- |
| `GET /api/mines/office` | The player's capacity, extraction rate, lamp and rod, and every shaft with `fare`, `max` and whether a permit opens it. |
| `POST /api/mines/nephew` | Send the hired nephew down for the day: 403 if not hired, 409 if he has already gone. `office` reports `nephew` (`ready`, `today`, `days`, `total`, `best`, `raise`, `tally`), or `null` when not hired. |
| `POST /api/mines/start` | Send `{"rulesVersion":2}` to start, resume or recover a result. Optional `shaft` (`"7"`, `"8"`, `"12"`, `"earl"`; default Shaft 7) is used only for a new shift: 403 without the permit, 402 without the fare. Include `afterShiftId` to acknowledge a displayed completed result and start another shift. |
| `POST /api/mines/probe` | Send `rulesVersion`, `shiftId`, `poolId`. Inspect the current deposit once; repeats return saved state. |
| `POST /api/mines/extract` | Send those identifiers plus `action: "start"`, `"continue"` or `"stop"`. The server calculates collection; never send quantity or pay. |
| `POST /api/mines/quit` | Send `rulesVersion` and `shiftId` to settle collected material or issue an empty-bucket lecture. |
| `POST /api/mines/finish` | Retains legacy completion; it cannot bypass version-2 collection. |
| `POST /api/mines/egg` | Retains the existing `shiftId` pickup contract and 30-second opportunity with a three-second request allowance. |

Public version-2 state retains the shift's identity, seed, clock, maze size, scare, faun and egg information. `faun` is `true` on about 20% of shifts and never set on a scare shift. It adds `rulesVersion`, `capacity`, `collected`, `extractionRate`, `shaft`, `lamp`, `rod`, `currentPoolId`, `readyAt` and `pools`. Each pool has `id`, `x`, `y`, nullable `quantity` and nullable `remaining`; null means uninspected. API quantities are units. For older clients, `minMs` is always zero and `readyAt` is the shift's `startedAt`; neither gates collection. Legacy probes return `{flowing: true, seeping: false}`.

Clock-in, probe, extraction and quit can return `{result: ...}` or `{pending: ...}` during completion/recovery instead of active state. Results include the existing payout fields plus `shiftId`, `collected` and `capacity`; mud can include `foreman`. Empty departures return the pending lecture. Do not assume every successful clock-in response contains a playable shift.

The entrance lift uses the same clock-out request lane, then returns to the game room only after settlement succeeds. It remembers a paid receipt before leaving; any server-held Foreman lecture remains due on the next mine visit. Failed departures keep the miner and confirmed bucket in the mine.

The browser serializes pulses about every 500ms. `start` arms collection without credit; `continue` and `stop` credit elapsed time within a live hold. A gap over one second disarms collection with no gap credit; continuing an inactive hold returns 409 and requires a new `start`. Target order, remaining material and bucket capacity are checked server-side; physical arrival and held buttons are not verified. Future/unknown pool IDs return 409; stale requests for an earlier pool return current state without advancement. A current-pool probe resolves it immediately; extraction before inspection returns 425. Incompatible clients receive HTTP 409 with `code: "mine_reload"` without losing the shift.

## Persistence and recovery

`mines.json` holds versioned active shifts, private payout and deposit-fill rolls, deposit identities and resolved amounts, collected volume, prepared settlements and the latest completed receipt per player. Quantities use integer thousandths internally. Resolution and extraction persist before responding. Active holds are memory-only and never resume after a server restart. Old `veinMs`, `readyAt` and per-pool `steps` fields are ignored without rerolling deposits or discarding confirmed quantities; new shifts no longer save those fields.

Manual cash-out, a full bucket and expiry share this settlement sequence:

1. Persist the prepared result in the active shift.
2. Atomically commit bankroll, transaction, mining statistics and `mining.lastSettlement` in `players.json`. Repeating that shift ID cannot pay again. Jackpot counts use the outcome identity, so partial jackpot payouts remain jackpots.
3. For mud or empty departures, save the lecture with its `lastMineShift` marker in `foreman.json`, preventing repeat issuance after retries or restarts.
4. Replace the active shift with its completed receipt in `mines.json`.

Failed stages leave recoverable state. Receipts replay lost responses without another payment; pending quizzes still block clock-in until answered. Preserve these files together when maintaining data. This is recovery across separate atomic file writes, not a cross-file transaction or support for multiple writers. See [local persistence limits](development.md#local-persistence).

After displaying a result, the browser stores only its shift ID in the account-scoped localStorage key `acidMine.seenResult:<playerId>`. A later clock-in passes it as `afterShiftId`; no amount, bucket or balance is stored locally. If storage is unavailable or the response was never displayed, the server can replay the saved result. No database, dependency or environment setting is added.

The shift map stores explored tiles and discovered pool IDs in `acidMine.map:<playerId>`, alongside the shift ID. Reloading the same shift restores the chart; starting a different shift replaces it, even on the same day's maze. With browser storage unavailable, exploration lasts until the page is closed. The map does not change the saved shift, pause its clock or remove the miner from PvP.

## The daily mine and miner-vs-miner (v71)

**One mine a day.** A shift's maze seed is `daySeed(mineDay(now))` (`server/engine/daily-maze.js`): the calendar day in America/Denver, so it changes at Denver midnight (DST-safe), and everyone who clocks in that day walks the same tunnels with the deposits in the same places. The maze size comes from the day's difficulty tier (below), and a day whose bucket chain would have fewer than five pools is re-dug deterministically (`${day}#k`). A shift keeps the maze (and tier) it started with across midnight. Tests that pin `vein` keep their size and get plain, tier-less tunnels unless the pinned vein also returns a `tier`. Each *shift* still rolls its own fill table (5/25/50/20), cave-ins, visitor/faun encounter (faun 20%, never with Nosferatu) and egg; acid you can see is always mineable; the bug guide retargets; a full bucket ends the shift.

**Difficulty tiers (v79).** `dayTier(daySeed(day))` (`server/engine/mine-tiers.js`) gives every day one of five tiers, 20% each, the same for everyone. `GET /api/mines/office` reports it as `today` (`day`, `tier`, `cells`, `pay`) for the shift office banner; a shift stores `tier` (and `hazard` when it pays extra) and its public state carries `tier`. One builder, `shiftMaze({seed, cells, tier})`, digs the tunnels for the server, PvP and the browser; a shift without a tier gets exactly the old maze.

| Tier | Name | Cells | Cave-ins | Lamp / fog / ambient | Flicker | Worms a minute (most at once, size) | Acid pay |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Greenhorn Gulch | 6 | 0 | 1.3 / 1.35 / 1.4 | none | 0 | ×1 |
| 2 | Tenderfoot Tunnels | 8 | up to 2 | 1.1 / 1.15 / 1.15 | 0.2 | 0.6 (1, 26%) | ×1.1 |
| 3 | Honest Work | 10 | up to 4 | 1 / 1 / 1 | 0.4 | 1.2 (2, 32%) | ×1.25 |
| 4 | The Badlands | 13 | up to 8 | 0.78 / 0.8 / 0.7 | 0.7 | 2.2 (2, 40%) | ×1.5 |
| 5 | Dead Man's Dig | 16 | up to 14 | 0.6 / 0.62 / 0.45 | 1 | 3.5 (3, 48%) | ×2 |

- **Cave-ins** are grid value `RUBBLE` (2): solid everywhere (`=== 0` is the only walkable test), drawn as a rock pile with a CAVE-IN plank. They are placed per day after extra loops are opened, only on straight hallway tiles at least four steps from the elevator, and only where blocking keeps every tunnel tile connected, so the elevator and every acid spot (chosen afterwards) are always reachable. They are not timed.
- **Light** multiplies the shaft's lamp reach and fog distance (a headlamp still helps), never below 5.5 m of fog and 3.6 m of lamp, so a pool in reach (1.9 m) is never lost in the dark.
- **Acid worms** are browser-only (`client/src/mines/worms.js`): they land on the view and stay until cut (tap or swipe the worm, the CUT button, or K). None land while acid is in reach, during a battle, behind the door or in the first 6 s; the MINE button sits above them. They are drawn in 3D as grotesque low-poly trilobites on a small transparent WebGL layer (`WormLayer.js`, `wormMesh.js`: at most 520 triangles and 6 draw calls each, half resolution, idle when none are on screen). Each one has a pitted, slimy acid-green and bile-yellow shell with three lobes, a head shield with genal spines, segments and a tail shield; nine pairs of jointed legs that skitter and twitch; twitching antennae; oozing drips; and a pale fleshy underside showing at the edges. Two wet human eyes, set too close, follow the finger or cursor, and a small human mouth with teeth opens and closes under the front rim. The knife cracks it into shell pieces and loose twitching legs. Without WebGL (or if the context is lost) the flat SVG worms stand in; the DOM hit boxes are the same either way. Reduced motion turns off the stutters and twitches and calms the legs.
- **Hazard pay** multiplies ordinary acid only. Mud stays pity money, the rare finds stay fixed, and the nephew and PvP spoils are untouched.

The local dev server's `MINE_TEST_TIER=1..5` (with `DEV_LOGIN`) forces a tier for screenshots: `npm run build && PLAYWRIGHT_DIR=<dir with playwright-core> OUT=<dir> TIERS=1,3,5 npm run e2e:tiers`.

**Deposits are per player.** The pools are in the same places for everyone, but each shift has its own amounts. A shared, first-come drain would let the first miner of the day empty everyone's pools; taking other people's acid is what ambushes and battles are for.

**Presence.** The page posts `POST /api/mines/pvp/tick` about every 250 ms with `{rulesVersion: 2, shiftId, x, y, yaw, fresh?}` (tile units). The server keeps positions in memory only, rejects a spot inside rock or further than ~2.5 tiles/s from the last accepted one (answering `snap`), and lets `fresh: true` (a page reload) restart at the elevator. A miner who has not reported for 4 s is not in the tunnels as far as anyone can tell. The answer lists up to 12 other miners on today's maze (`id`, `name`, `avatar`, `x`, `y`, `yaw`, `bug`, `shield`, `cooling`), `ambush` (`{id, name}` when you can stab someone right now), your own `shield`, and `battle` when you are in one. After your shift ends, it answers `{ended: true, ...result}`.

**Seeing.** You see someone within 5 tiles, inside a 100° cone ahead, with a clear line through tunnel (not rock), or by bumping into them. "Has seen you" lasts 4 s.

**Ambush.** `POST /api/mines/pvp/ambush {target}` succeeds only if the server agrees: touching (≤0.75 tile), you are behind them (inside the 180° half behind their facing), and they have not seen you in the last 4 s. The victim's shift ends at once with an AMBUSHED receipt (no pay, not counted as a shift, the fare is lost). The attacker takes all the acid in the victim's bucket (anything past their own capacity is spilled) and $20–$100, never more than the victim has.

**Bug battle.** Two miners who have both seen each other and touch go straight into a fight: the same turn-based ring fight the Barn runs (`server/fights.js`, `server/engine/bout.js`; the rules are in [Barn care and combat](bug-combat.md)), shown in the ring on a tunnel floor. Every roll is made on the server. A player with no living hatched bug, or whose bug is in a Barn bout at that moment, fights with the Foreman's loaner, *Gerald (on loan)*, a level 1 onymacris. Mining and movement stop during a battle. `POST /api/mines/pvp/move {battleId, moves}` lines up to three of the bug's learned moves; a bug with nothing lined up picks for itself, one action every few seconds. A fight that reaches the bell dead level is no contest and nobody is robbed. Not being heard from for 15 s, clocking out, or `POST /api/mines/pvp/forfeit` loses the battle. The winner takes the loser's acid, $20–$100 (clamped as above) and every tobacco product they own; one the winner already has is smoked instead. Battles live in memory: a server restart ends them with no winner and nothing taken.

**Fainting and the Bug Center (v75).** However a battle ends (except *abandoned*), the loser's HP goes to 0. Both real bugs that fought to a faint earn `BATTLE_XP` (20); the winner also gets `WIN_BONUS_XP` (30), so 50 in all. A loser who forfeits or goes quiet earns nothing. The losing bug faints: `barn.json` saves `faintedAt` and `faintedBy` on its pen (plus `mineRecord`, `mineBattles` and `lastMineBattle`; older rows without them are healthy). A fainted bug cannot battle (its miner fights with Gerald; being fainted is never a shield), take or keep a barn bout (an open one is refunded), or guide in the mines (`bugFainted` on the shift instead of `bug`). It shows swirly eyes in the barn and at table seats. `POST /api/barn/heal` (the Bug Center nurse at `/barn/center`) clears the faint (free after an hour's rest, or paid at once; see below); a healthy bug is a no-op (`healed: false`). The XP and faint are a fourth raid step (`steps.barn`), idempotent per battle id and tied to the bug's birth time, so recovery after a crash applies them once. Old raid records without `bugs` skip it.

**HP only comes back at the Bug Center (v76).** A bug's HP is saved as `pen.health`, a percent of its level's max HP (absent = 100, so old rows are healthy). It never regenerates: no time-based regen, no rest, no refill on level-up. Every fight starts from it and writes it back:
- **Barn bouts** (posted, joined or challenge): `simulateBout` starts each side at `ceil(maxHp × health%)` (never below 1; the host's HP is read at join time, not when it posted). The receipt (version 4) carries `startHp` and `healthAfter`. The **loser faints** (`faintedAt`, `faintedBy` = the winner's owner, `faintedIn: 'ring'`, health 0); a **winner or a draw keeps the HP it ended on**. Applied once per receipt with the XP; pre-v76 receipts change nothing.
- **Mine battles**: the loser faints as before (`faintedIn: 'mines'`); the winner keeps its remaining HP (`hpPct` on the raid's winner bug). A hurt bug starts its next fight at that HP.
- **Hurt but standing** bugs may still post, join, accept, battle and guide, at reduced HP. **Fainted** bugs can do none of it until healed.
- `POST /api/barn/heal` restores 100% and clears any faint. A hurt bug is free. A fainted bug is free `RECOVER_MS` (one hour) after `faintedAt`; before that the call is refused (409) unless the body is `{ "pay": true }`, which charges `FAST_HEAL_COST` ($50; 402 if short) and returns it as `cost`. The pen view carries `recoverMs` and `healCost` while fainted; it reports `healed: true` for a fainted *or* hurt bug.
- The barn view adds `health`, `hp`, `maxHp`, `hurt` (and `faintedIn`); the ring roster adds `health` and `fainted`. The barn shows an HP pill on the bug, a "Your bug is hurt — visit the Bug Center →" line, and the same button at the end of a live bout. In Async Scum, a fainted bug is at the Bug Center, so a stray bug covers its owner's missed turn.

**Who can be touched.** Nobody in their first 15 s on shift or within 2.5 tiles of the elevator. No guest, account under 24 hours old, or player with fewer than 3 finished shifts can be touched, and none of them can touch anyone either. You can't target yourself. The same two players can only raid each other once every 2 hours, and a player loses cash at most 3 times per Denver day (after that, acid and smokes can still go, but not money).

**Money.** Bankroll is the app's play money. Every raid is one atomic `players.json` write for both players, with `pvp` ledger lines ("Acid Mines: ambushed X" / "ambushed by X" / "won a bug battle against X" / "lost a bug battle to X") and the raid id on both players so a retry can't pay twice. `pvp.json` keeps raid records (30 days), pair cooldowns and daily losses. A raid is saved before any money moves and then applied in steps (mine, money, shop); after a crash, `recover()` finishes those steps on restart.

Run `PLAYWRIGHT_DIR=<dir with playwright-core> OUT=<dir> node scripts/e2e-pvp.mjs` after `npm run build` for the three-browser check, and `scripts/e2e-bug-center.mjs` (same variables; `SWAP=1` swaps phone and desktop) for the intro, the faint and a heal. It uses the `PVP_TEST=1` / `PVP_TEST_GRACE_MS` hooks, which only work with `DEV_LOGIN`.

## Horror Night

Once a week the mine goes dark for everyone. `HORROR_SCHEDULE` in `server/engine/horror.js` is the only knob (default Fridays 9 PM to midnight, `America/Chicago`). A shift clocked in inside the window is stamped `horror: { lightsOutMs }` (30–60 s, from the shift id) and keeps it to the end; a shift started at 8:59 PM stays normal. It is cosmetic only: no roll, payout, timer or PvP rule reads it, and it uses no random source the shift's pay uses. The lamp flicker, the Last Crew (they follow while unwatched, freeze when watched, vanish in a working lamp beam, have no body, never stand in the acid, capped at 3 / 2 on phones), the synthesized audio and the per-chunk jump scare (`ScareGate`: small chance, 35 s cooldown) live in `client/src/mines/horror.js`. "FLASHING: LOW" (default with reduced motion) keeps the lamp from strobing and fades the scare in instead.

To force it locally: `POST /api/dev/horror {"on": true|false|null}`, which only exists with `DEV_LOGIN=1`. `scripts/e2e-horror.mjs` (same variables as the PvP check; `GIF=1` writes a clip) drives it on desktop, phone and reduced motion.

## Checks and deployment boundary

Run the focused checks, frontend build and full suite from the repository root:

```sh
node --test test/mines-buckets.test.js test/mines-route.test.js test/mines-client.test.js test/mines-scene.test.js test/mines-eggs.test.js test/mines-controls.test.js test/mines-tilt.test.js test/mines-faun.test.js test/foreman.test.js test/conquest-store.test.js
npm run build
npm test
npm run sim:mines -- 5000
```

Cover partial/full payouts, dry/drained targets, stop/retry/reload, late requests and competing tabs, expiry, legacy saves, failed writes and settlement recovery. Check desktop, narrow portrait and short landscape controls, plus preserved egg, tilt, sound, reduced-motion, visitor and Doom behavior. Timing simulation compares legacy, unguided and ideal-route travel; it is not a human playtest. Physical-phone motion and Safari still need device testing. Put actual results in the PR; [Development](development.md) covers setup and known limitations.

**Before deploying**, recover and compare the source behind the live site's owned-bug guide, preserve it, connect its existing target to successive deposits, and check for other missing live behavior. That guide is absent from this public snapshot; this change does not invent a replacement, and ideal-route simulation does not validate it. Merging this repository does not deploy the site.
