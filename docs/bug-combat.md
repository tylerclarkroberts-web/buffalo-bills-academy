# Bug combat and progression

The Barn's **Combat** tab opens fights at **level 3**. Choose a fighting style and up to two learned special moves, save the setup, then start a bout. The basic attack is always available. The server resolves the fight automatically; you can watch the result or skip its animation. Fights never wager money or harm your pet outside the bout.

Every new fight you start awards **20 XP**, for a win, loss or draw. This is separate from the [120 care XP/day limit](bug-store-items.md#xp-and-the-daily-care-limit), with no daily fight-XP cap. The one-hour cooldown still applies. Watching or skipping a replay gives no additional XP. Being chosen as another player's opponent gives you no XP and does not change your record.

## Leveling and moves

| Level | Total XP | New move |
| --- | ---: | --- |
| 3 | 160 | Basic attack; bouts open. |
| 4 | 360 | First technique. |
| 6 | 1,000 | Species special. |
| 8 | 1,960 | Alternative special. |
| 10 | 3,240 | Capstone special. |

Each bug has five named moves. The basic attack stays available and you can equip up to two of the four specials. At level 8 there are more learned specials than slots, so you can choose different combinations. A default setup is provided; deliberately saving fewer than two specials is also allowed. The move descriptions show what each effect does and how long its cooldown lasts.

From level 3 onward, each level adds three maximum HP and 2% base attack damage. A level-3 bug has 100 HP; a level-10 bug has 121 HP and +14% base attack damage before species, condition, equipment and style effects. Levels 5, 7 and 9 therefore still improve strength. These health values belong only to a fight, not the pet's care meters or starvation clock.

The XP curve is unchanged: total XP for a level is `40 * (level - 1)^2`. Each next level costs 80 XP more than the preceding step: 3→4 needs 200 XP, and 9→10 needs 680 XP. Level and combat growth stop at **10**; earned XP continues accumulating and is shown at the cap. XP from a bout affects subsequent fights, not the fight that awarded it.

Bugs also grow a little at every level: a level-1 hatchling uses 77.5% of the full-size drawing scale, gaining 2.5 percentage points per level until full size at level 10. Equipped accessories grow with the body in the Barn, room terrarium, store previews and bouts. Replay size and form follow the level recorded when that fight happened. This visual growth adds no extra combat bonus beyond the level stats above and needs no new saved data.

Young forms follow the species' development:

- Thirteen beetles start as curled grubs, legless weevil grubs, elongated wood-borers or segmented crawlers; the two lacewings start as wingless, jawed larvae. They change to their adult artwork at level 3.
- The Snail-case Caddisfly starts in its coiled larval case and becomes a winged caddisfly at level 3.
- True bugs, mantises and the Jungle Nymph use smaller versions of their existing artwork, reflecting nymph development.
- The Railroad Worm retains its glowing segmented form: adult females are larviform.

These are stylized life stages, not exact species/instar reconstructions. The level-3 change compresses the pupal interval; growth after that represents game progression. The shapes use broad family characteristics, with palette and equipped cosmetics retained. The distinction follows [Australian Museum's metamorphosis guide](https://australian.museum/learn/animals/insects/metamorphosis-a-remarkable-change/); larval shapes follow [University of Kentucky's identification guide](https://entomology.mgcafe.uky.edu/ef017). The caddisfly's adult wings and the Railroad Worm exception follow [NC State](https://genent.cals.ncsu.edu/insect-identification/order-trichoptera/) and [University of Florida](https://ask.ifas.ufl.edu/publication/in609). Sagra's grub shape is a family-level inference from [Sagrinae larval research](https://www.biotaxa.org/Zootaxa/article/view/zootaxa.4686.4.5/57084), not a verified reconstruction of that species.

## Species strengths and move effects

Species have different attack, defense and speed ratings, plus different move combinations. Attack changes direct damage, defense reduces ordinary hits, and speed affects the opening turn and evasion. All three care needs contribute to condition; the lowest need sets that small combat bonus. Equipped bug gear adds at most 6% attack damage.

There is no elemental type chart or automatic flying-versus-ground bonus. Move names alone do not imply a hidden advantage; the Combat tab describes the actual effect:

| Effect | What it does |
| --- | --- |
| Guard | Attack and halve the next incoming attack. Venom bypasses guard. |
| Venom | On hit, deal damage at the start of the target's next two turns, bypassing armor and guard. It does not stack. |
| Pierce | Ignore armor and half of the target's guard; stance protection still applies. |
| Heal | Recover HP instead of attacking, only at 65% HP or lower. |
| Weaken | On hit, reduce the target's next attack by 35%. It does not stack. |

For example, the Two-spotted Assassin Bug has high attack and lower defense/speed, with venom and piercing moves. A guard can soften a direct hit, but cannot prevent venom damage. Guard and weakening are spent on the next attack even if it misses; healing and venom ticks do not consume them. Specials have cooldowns measured in the user's own turns, shown beside each move.

Balanced stance rotates available specials in the saved order. Aggressive prioritizes piercing and venom and deals/takes 8% more direct damage. Defensive prioritizes healing and guarding and deals/takes 8% less direct damage. Healing and venom ticks do not receive stance damage modifiers. These are tradeoffs, not guaranteed winning builds.

## Opponents and replay

The server chooses another living bug within one level of yours, with at least level 3. If none is available, a stray at your level takes its place. The opponent's current species, level, condition, gear and saved setup are captured when the fight starts. Replays show that historical fight rather than recalculating it with current settings.

Fights stop after a knockout or 32 alternating actions. If both bugs are still standing, the higher remaining percentage of maximum HP wins; equal percentages draw. Venom can add an event before an action, so a replay may contain more than 32 events.

Changing a setup takes effect after **Save setup**. Unsaved choices must be saved or discarded before fighting. Cooldowns and locked-move checks are enforced on the server; the browser cannot choose the winner or the XP award.

## Compatibility and privacy

Existing pets keep their XP, names, species, needs, items and win/loss/draw records. Moves previously learned under the old level-1/3/5 schedule remain available, even if their revised normal unlock is later. New pets use the level-3/4/6/8/10 schedule. This can temporarily give an older low-level bug access to a move a new bug has not learned yet; both still use the same two-special limit.

Old saved replays remain watchable with their original 100-HP presentation and receive no retroactive XP. New replays store their initial maximum HP, move events, XP award and before/after levels. A replay can expose the opponent's fighting style and equipped moves as part of that bout. A room visitor still receives only the existing pet appearance/level projection, not private care history, saved battle setup or replay.

## API and persistence

All Barn routes require the existing authenticated player/session or supported legacy bearer token. They act on that player's pet; a request cannot nominate another owner.

- `GET /api/barn` returns the current pen and server time. A live creature now includes five `abilities` with stable IDs, unlock flags and descriptions, `battle`, `combat`, `arenaLevel: 3` and `boutXp: 20`. Reading a pen can settle ordinary passive bonuses but never issues fight rewards.
- `PATCH /api/barn/battle` saves a fighting style and at most two unlocked special IDs. Both fields are required; unknown fields, duplicate IDs, the basic move, unknown moves and locked moves return 400. Missing/unhatched/dead pets return 409. The response is the updated Barn view.
- `POST /api/barn/bout` creates and persists a new fight and its 20-XP award together. There is no client-supplied reward or result. Empty barns return 404, eggs/dead/below-level-3 pets return 409, and an active cooldown returns 429. Successful responses include `pen.lastBout` with `version: 2`, `maxHp`, `xpEarned`, `levelBefore`, `levelAfter`, the participants, rounds and result.

Example setup, once its moves are learned:

```json
{
  "stance": "balanced",
  "specials": ["technique", "signature"]
}
```

Valid styles are `balanced`, `aggressive` and `defensive`. Special IDs are `technique`, `signature`, `tactic` and `capstone`; `basic` cannot occupy a special slot. An empty `specials` array keeps only the basic attack.

The existing `barn.json` document stores optional `battle`, `combatVersion` and `legacyAbilities` fields on creature records, plus the expanded `lastBout`. No database or new environment variable is required. Setup and bout commits persist before replacing the in-memory pen; a failed write does not consume the new fight's cooldown or participation XP. Passive accrual before the attempt is independent. Repeated submissions inside the hour are rejected by the existing server cooldown, and replay is read-only.

See [Development and troubleshooting](development.md) for local validation and deployment limitations.
