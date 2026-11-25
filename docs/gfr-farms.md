# GFR Farms

The barn's stalls are the active ones: three to start, up to six with the paid stalls (`STALLS`, `STALL_COSTS`,
`ACTIVE_MAX`). Beyond that a player can keep any number of bugs at **GFR Farms** (`doc.farm[playerId]`).

- **Where new bugs go:** `barn.placement` / `barn.placeNewBug(playerId, pen)` routes a new bug to the empty partner
  place, then a free stall, then the farm. Mine and circuit catches use it (a jar is never refused for want of a stall).
  Trades should use `placeNewBug`: it validates the bug, writes it once, and returns `{ where: 'partner' | 'stall' | 'farm', pen }`.
- **Frozen in time:** a bug at the farm has `farmedAt`. It is never refreshed: no XP, no needs lost, no starving or
  death, no sickness. When it comes back (`thaw`), every clock it has (needs, `fedAt`, `dayXpAt`, feeder dates) moves
  on by the time it was away, so it is exactly as it left.
- **Out of play:** farm bugs aren't in `bugs()`, so the ring, the circuit, the gym, mine shifts, bouts and challenges
  can't reach them. They still count for `holds` (one living legendary), `ownerHolds` (STEEZE), the Bugdex, and a
  deleted account.
- **No free eggs:** a player with bugs at the farm is not an empty barn (`rollEgg` / `layEgg`).
- **Swaps** (`POST /api/barn/farm` with `{ bug }`; `POST /api/barn/farm/back` with `{ bug, swap? }`): send a stall bug
  out, bring a farm bug back to a free stall, or swap it for a stall bug when every stall is taken. The partner, an
  egg, a grave, or a bug that is away, sick, fainted or has an open bout posted can't travel.
- **Migration:** on load, a barn with more bugs than stalls keeps its partner, eggs, graves and the bugs that can't
  travel, plus its highest levels (ties go to the most recently cared for). The rest go to the farm, and nothing else
  on them changes.
