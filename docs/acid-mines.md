# Acid Mines maintenance notes

## Shift behavior

A version-2 shift uses one map and one 100-unit bucket across several deposits. Holding Mine collects five units per second; release preserves confirmed contents. Clock out pays for a partial bucket, and a full bucket settles automatically. The hidden full-bucket outcome is saved once: partial payment is that amount multiplied by collected units / 100, rounded to cents, including mud and jackpots. Empty departures are unpaid and retain the Foreman's quiz; mud retains its quiz; other paid departures use the farewell.

The existing hidden vein-time roll now controls gradual availability. The first 20 seconds cannot resolve a pool; afterward, later first inspections are more likely to find larger deposits. A pool resolves once and never grows, refills or rerolls. Ordinary quantities are 20, 35 or 60 units; the final pool contains at least the remaining bucket capacity. Dry pools advance the target immediately, wet pools only when drained. Keep timing and probability details out of player controls. Quality tiers, equipment upgrades and manual target skipping are deferred.

Only server-confirmed progress survives interruption. Release, cancellation, focus loss, hidden pages, Doom and reload stop extraction. An unfinished shift resumes when clocking in again. After a version-2 shift's 30-minute expiry, the next mining interaction settles its contents rather than discarding them. Existing legacy shifts retain their original rules until they finish or expire.

## API and compatibility

All endpoints require the signed-in player. New shifts use `rulesVersion: 2`; existing legacy shifts keep their old request/response contract.

| Request | Contract |
| --- | --- |
| `POST /api/mines/start` | Send `{"rulesVersion":2}` to start, resume or recover a result. Include `afterShiftId` to acknowledge a displayed completed result and start another shift. |
| `POST /api/mines/probe` | Send `rulesVersion`, `shiftId`, `poolId`. Inspect the current deposit once; repeats return saved state. |
| `POST /api/mines/extract` | Send those identifiers plus `action: "start"`, `"continue"` or `"stop"`. The server calculates collection; never send quantity or pay. |
| `POST /api/mines/quit` | Send `rulesVersion` and `shiftId` to settle collected material or issue an empty-bucket lecture. |
| `POST /api/mines/finish` | Retains legacy completion; it cannot bypass version-2 collection. |
| `POST /api/mines/egg` | Retains the existing `shiftId` pickup contract and 30-second opportunity with a three-second request allowance. |

Public version-2 state retains the shift's identity, seed, clock, maze size, scare and egg information. It adds `rulesVersion`, `capacity`, `collected`, `extractionRate`, `currentPoolId`, `readyAt` and `pools`. Each pool has `id`, `x`, `y`, nullable `quantity` and nullable `remaining`; null means uninspected. API quantities are units. `readyAt` exposes only the minimum arrival/first-20-second floor, never the hidden maturation time.

Clock-in, probe, extraction and quit can return `{result: ...}` or `{pending: ...}` during completion/recovery instead of active state. Results include the existing payout fields plus `shiftId`, `collected` and `capacity`; mud can include `foreman`. Empty departures return the pending lecture. Do not assume every successful clock-in response contains a playable shift.

The browser serializes pulses about every 500ms. `start` arms collection without credit; `continue` and `stop` credit elapsed time within a live hold. A gap over one second disarms collection with no gap credit; continuing an inactive hold returns 409 and requires a new `start`. Minimum feasible travel, target order, remaining material and bucket capacity are checked server-side, but these bounds do not prove physical movement or button presses. Future/unknown pool IDs return 409; stale requests for an earlier pool return current state without advancement. Early probes leave the pool unresolved; extraction before inspection returns 425. Incompatible clients receive HTTP 409 with `code: "mine_reload"` without losing the shift.

## Persistence and recovery

`mines.json` holds versioned active shifts, private outcome/availability rolls, deposit identities and resolved amounts, collected volume, prepared settlements and the latest completed receipt per player. Quantities use integer thousandths internally. Resolution and extraction persist before responding. Active holds are memory-only and never resume after a server restart.

Manual cash-out, a full bucket and expiry share this settlement sequence:

1. Persist the prepared result in the active shift.
2. Atomically commit bankroll, transaction, mining statistics and `mining.lastSettlement` in `players.json`. Repeating that shift ID cannot pay again. Jackpot counts use the outcome identity, so partial jackpot payouts remain jackpots.
3. For mud or empty departures, save the lecture with its `lastMineShift` marker in `foreman.json`, preventing repeat issuance after retries or restarts.
4. Replace the active shift with its completed receipt in `mines.json`.

Failed stages leave recoverable state. Receipts replay lost responses without another payment; pending quizzes still block clock-in until answered. Preserve these files together when maintaining data. This is recovery across separate atomic file writes, not a cross-file transaction or support for multiple writers. See [local persistence limits](development.md#local-persistence).

After displaying a result, the browser stores only its shift ID in the account-scoped localStorage key `acidMine.seenResult:<playerId>`. A later clock-in passes it as `afterShiftId`; no amount, bucket or balance is stored locally. If storage is unavailable or the response was never displayed, the server can replay the saved result. No database, dependency or environment setting is added.

## Checks and deployment boundary

Run the focused checks, frontend build and full suite from the repository root:

```sh
node --test test/mines-buckets.test.js test/mines-route.test.js test/mines-client.test.js test/mines-scene.test.js test/mines-eggs.test.js test/mines-controls.test.js test/mines-tilt.test.js test/foreman.test.js test/conquest-store.test.js
npm run build
npm test
npm run sim:mines -- 5000
```

Cover partial/full payouts, dry/drained targets, stop/retry/reload, late requests and competing tabs, expiry, legacy saves, failed writes and settlement recovery. Check desktop, narrow portrait and short landscape controls, plus preserved egg, tilt, sound, reduced-motion, visitor and Doom behavior. Timing simulation compares legacy, unguided and ideal-route travel; it is not a human playtest. Physical-phone motion and Safari still need device testing. Put actual results in the PR; [Development](development.md) covers setup and known limitations.

**Before deploying**, recover and compare the source behind the live site's owned-bug guide, preserve it, connect its existing target to successive deposits, and check for other missing live behavior. That guide is absent from this public snapshot; this change does not invent a replacement, and ideal-route simulation does not validate it. Merging this repository does not deploy the site.
