# Personal rooms

My Room displays the owner's existing pet, outfit, oddities and in-game wealth in a furnished 3D bunkhouse. Room layout is separate from those systems; it creates no pet, balance, income or gameplay bonus.

## Visits and privacy

- Every available account's room and **exact in-game balances** are visible to any signed-in player. There is no sharing opt-in. A room link is a destination, not an access token.
- A legacy name-only guest can use their own room but must register or sign in before visiting or being visited. Hidden, deleted and missing accounts remain unavailable.
- Visitors see the saved layout, displayed items, visible outfit, curated pet and owner wealth. They cannot edit, equip items or care for the pet. Visits are snapshots, not shared editing or live visitor presence.
- Visitor data excludes undisplayed possessions, unworn clothing, email, authentication details, original selfies, transactions, battle setup/replay and pet-care timing. For a living bug, visitors do see the toy and battle gear in use, whether an automatic feeder is running, and a one-word mood (a neglected bug stamps about its terrarium); they never see need levels, cooldowns or timings. Eggs hide their species; memorials hide feeding history and time of death. Avatars are saved drawings.
- Wealth combines bankroll, chips at tables, holdings and Risk escrow. Missing/nonfinite amounts stay unavailable rather than becoming zero; negative amounts remain accurate. Figures belong to the room owner, never the visitor's session.

## Editing boundaries

**Save room** commits layout choices together; **Cancel** restores them. Failed saves retain the draft, revision conflicts require reloading, and leaving with unsaved changes offers to continue or discard. **Visitor view** shows the saved layout.

Pet care and clothing changes save immediately, even during layout editing, and are not undone by Cancel. They use the existing [Barn care rules](bug-combat.md#xp-and-the-daily-care-limit). Visiting never feeds the pet, pauses neglect or awards care XP.

Each owned oddity can appear once in a compatible spot. Removing a display, shrinking/removing a shelf or putting away the desk returns its displayed items to storage without changing ownership. Storing the wardrobe leaves the outfit intact; the couch can be put away too. **Add** brings stored pieces back. Oddities are cosmetic; `odd-sheriffbadge` is still the legacy ID for the Expired Fishing Licence, and `window` remains the yard/wagon position ID.

Furniture stays within its approved room/yard bounds and clear of other furniture, mounts, the resident and doorway. The rug may pass under furniture, but its centre locates the resident and must remain clear. Shelves and wall displays use approved mounts rather than arbitrary wall coordinates. Invalid drops and cancelled drags restore the prior position. Server validation enforces these rules on save too.

## A little life in the room

Resident errands (sitting on the couch, inspecting furniture, taking a note from the cash table), chatter and faun visits are local cosmetic events. The resident routes around floor furniture but not low shelves. They change no balances, pet care, inventory or daily-faun gifts. Editing and Pause activity dismiss current bubbles/visits; hidden or offscreen scenes pause the activity clock. Reduced motion stops character animation while permitting static bubbles and visits. Camera angle, zoom, pan and activity choices are local to the current page, not persisted or shared with visitors.

## API and persistence

| Endpoint | Contract |
| --- | --- |
| `GET /api/room` | Owner view: layout, curated pet/appearance, exact worth and owned oddity IDs. |
| `PATCH /api/room/layout` | Owner-only replacement with `expectedRevision`, `themeId`, `placements` and optional `shelves`, `wallDisplays`, `finishes`, `furniture`. |
| `GET /api/players/:id/room` | Signed-in visitor view of an available account, including exact worth. |

Responses use `Cache-Control: no-store`, including errors. Missing authentication returns 401, a legacy guest visiting returns 403, and an unavailable target returns 404. Invalid fields, ownership, compatibility or placement return 400; stale revision returns 409. The former sharing endpoint is removed. A successful save returns the owner view with `layoutRevision` incremented.

Important replacement and compatibility rules:

- `placements` replaces the full list of `{anchorId,itemId}` pairs, with at most 23 compatible, uniquely owned items/positions. An empty list clears displays. Do not send an owner ID, sharing fields, image URLs or HTML.
- Supplied `shelves` replaces the list (zero to six). Each entry has `id`, `spotId`, `typeId`, `colorId` and optional `sizeId` (`standard` or `wide`). Omitted size preserves an existing shelf's size; new shelves default small. Wide shelves retain their centre ID plus `<id>-slot-2` and `<id>-slot-3` in ordinary placements. Shrinking requires removing outer placements; removing all shelves requires `shelves:[]` and no shelf placements.
- Supplied `wallDisplays` contains exactly `wall-left` and `wall-right`, using distinct approved mounts clear of shelves, furniture and the resident. Both reserve space even when empty.
- Supplied `finishes` contains floor, rug and wardrobe objects, and optionally couch, each with `typeId` and `colorId`. An omitted couch keeps its default style.
- Supplied `furniture` maps pieces (`desk`, `pet`, `wardrobe`, `wealth`, `rug`, `floor`, `window`, `couch`) to finite `x`, `z`, quarter-turn `r` (0–3) and optional boolean `off`. Only desk, wardrobe and couch accept `off:true`. Omitted pieces return to default spots; coordinates store to two decimals.
- Omitting an entire optional `shelves`, `wallDisplays`, `finishes` or `furniture` field preserves its saved value for older clients. The resulting combination still undergoes all collision and ownership checks.

Visitor JSON contains `owner`, layout fields, curated `pet`, `worth` (`bankroll`, `chips`, `holdings`, `riskEscrow`, `total`) and `wealthStage` when the total is finite. Invalid amounts are omitted. Owner JSON additionally contains `owned`. The profile's `roomVisitAvailable` flag is only a navigation hint; the endpoint rechecks access.

Room metadata lives in `<DATA_DIR>/rooms.json` as schema version 1. Old records retain default shelves, wall mounts, finishes, furniture and their placements without a destructive migration. An explicit empty shelf list remains empty. Invalid saved furniture arrangements fall back to default positions; invalid finishes and wall mounts use valid catalog defaults. Old `visibility` and `showWealthPile` flags are ignored and dropped on the next save.

Saved records carry `plan: 2`. A record without it was arranged on the earlier, smaller floor: when read, its furniture coordinates are scaled up proportionally and the couch is placed in the nearest clear spot, or put away if none is free. Nothing is written until the owner next saves.

Reading defaults creates no room file. Writes validate against current ownership and persist before replacing the in-memory room document; failed writes preserve the last committed room. Unsupported schema versions stop initialization instead of being overwritten. Older servers may drop newer layout fields, so back up before rolling back.

Account deletion removes room metadata after deletion guards pass. Legacy-account claiming retains the legacy room and removes the discarded fresh account's room. Whole-account cleanup is not transactional across feature files; multiple server replicas cannot safely share this JSON store. See [Development](development.md#local-persistence) before maintaining data.

## Verification and limits

Labeled HTML controls remain usable if WebGL fails; keep keyboard/touch alternatives when changing scene interactions. Check actual owner/visitor access, exact balances, draft save/cancel/conflicts, invalid placement, reduced motion, hidden-tab timing and narrow/short layouts. Pure model tests do not prove GPU rendering, context recovery or physical-phone performance.

The scene bounds its geometry, drawing buffer and shadows; large/high-density screens may render below native resolution. It renders on demand while paused or reduced-motion is enabled and stops rendering when hidden/offscreen. Use the room domain/API/layout/scene tests and browser checks described in [Development](development.md); keep detailed run results in the PR.
