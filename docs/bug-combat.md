# Barn care and combat

One Barn slot holds an egg, living bug or unburied memorial. My Room shows that same pet; it does not create another one or provide passive care. The server owns needs, clocks, progression and fight results.

## XP and the daily care limit

- Free care in the Barn or My Room and store consumables share **120 care XP per UTC day**, resetting at 00:00 UTC. Free care and food give up to 12 XP; misters and heat lamps give up to 6. Once capped, care still improves needs and consumables are still spent.
- At each 24-hour checkpoint since hatching, a living bug earns 10 XP if average needs are at least 25. An active feeder adds 12 XP at that checkpoint, outside the care cap; it gives no immediate XP. Accrual settles when the server next refreshes the pet.
- Food resets the starvation clock. An automatic feeder keeps Fed full and pauses starvation while active; Mood and Clean still decay. A feeder use adds 14 days, up to 60 days ahead; Golden Ambrosia supplies seven days. Misters, heat lamps and toys do not protect against starvation.
- By default, death occurs after 21 days without feeding, or 21 days after feeder expiry, with the server's minimum-life grace period. An empty Fed meter alone does not kill a bug. Visiting or reopening the room does not reset these clocks. A memorial occupies the Barn until buried.
- Buying a consumable does not apply it; **Use** spends it. Toys and gear are permanent equipment. Toys improve active Play rather than supplying passive Mood; equipped battle gear adds at most 6% attack damage. Item-specific amounts and cooldowns are shown in the shop and owned by `server/catalog/bug.js` and `server/shop.js`.

## Leveling and moves

Bouts open at **level 3**, once an hour. Each new fight you start awards **20 XP**, win, lose or draw, outside the care cap. Watching a replay gives no XP; being selected as another player's opponent changes neither your XP nor record. Fights wager no money and cannot injure the pet outside the bout.

| Level | Total XP | Unlock |
| --- | ---: | --- |
| 3 | 160 | Basic attack and bouts |
| 4 | 360 | Technique |
| 6 | 1,000 | Species special |
| 8 | 1,960 | Alternative special |
| 10 | 3,240 | Capstone |

The XP curve is `40 * (level - 1)^2`. Level and combat growth cap at 10; XP can still accumulate. Each level after 3 adds 3 HP and 2% base attack damage. Fight XP affects subsequent bouts, not the bout awarding it.

The basic attack is always available. Save up to two learned specials and a `balanced`, `aggressive` or `defensive` stance. Specials have cooldowns in the user's own turns. The Combat tab describes effects; move names do not grant hidden elemental or flying bonuses. Condition uses the lowest care need, and gear bonuses do not stack.

Bugs grow slightly through level 10, with shared size and equipped-art scaling across the Barn, room, shop and bouts. Young forms become adults at level 3 where appropriate; some species retain a similar form. These are stylized life stages, not exact biology. Replays use the historical level/form rather than today's pet.

## Fight invariants and compatibility

- The server selects a living opponent within one level, at least level 3, or a same-level stray. It captures species, level, condition, gear and setup when the bout starts.
- A fight ends at knockout or 32 alternating actions. Surviving bugs compare remaining HP percentages; equal percentages draw. Venom events can make a replay longer than 32 events.
- Existing bugs retain previously learned moves from the old level-1/3/5 schedule, even before the revised unlock level. The two-special limit still applies.
- Old replays retain their original 100-HP presentation and earn no retroactive XP. New replays include maximum HP, moves, the XP award and before/after levels. Opponent stance and equipped moves may be visible in the replay; room visitors do not receive battle setup, replay or private care history.

## API and persistence

Barn routes require the existing session or supported legacy bearer token and operate on that player's pet; requests cannot nominate another owner.

| Route | Contract |
| --- | --- |
| `GET /api/barn` | Current pen and server time. Reading can settle passive bonuses, never fight rewards. |
| `PATCH /api/barn/battle` | Save both `stance` and `specials`; reject unknown fields, duplicates, basic/unknown/locked moves or more than two specials (400), and missing/unhatched/dead pets (409). |
| `POST /api/barn/bout` | Persist the server-selected fight and 20-XP award together. Empty Barn: 404; egg/dead/below-level-3: 409; cooldown: 429. No client-supplied reward or result. |

Example setup, once those moves are learned:

```json
{ "stance": "balanced", "specials": ["technique", "signature"] }
```

Special IDs are `technique`, `signature`, `tactic` and `capstone`; an empty array keeps only the basic attack. The response is the updated Barn view.

`barn.json` retains the pet's optional `battle`, `combatVersion` and `legacyAbilities` fields and `lastBout`. Version-2 bouts include `maxHp`, `xpEarned`, `levelBefore` and `levelAfter`. Setup/bout writes persist before replacing the in-memory pen: a failed write does not consume the new cooldown or fight XP. Earlier passive accrual is independent. Replay is read-only.

## Checks

Use the focused Barn/combat/API tests when changing these rules; see [Development](development.md). Browser checks should cover locked moves, save failures, replay without duplicate rewards and legacy pets/replays. Pure tests do not establish device rendering or exhaustive game balance.
