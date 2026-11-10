# Personal rooms

Open **My Room** from your account menu or profile. Your free, furnished bunkhouse brings together your real bug, equipped outfit and purchased oddities. It uses a slightly elevated 3D cutaway with the Academy's chunky low-poly look. Click a furnishing or use the named **Pet**, **Wardrobe**, **Collection** and **Chips & cash** buttons. The resident is part of the scene; there is no character movement or camera-control requirement.

The room's resident is an approximate low-poly representation, including the saved avatar face where available. Select **Wardrobe** to see the existing avatar display with its actual equipped cosmetics and fit. The pet uses its existing pixel artwork inside the 3D terrarium. Empty, egg, live-bug and memorial states reflect the same Barn resident, not a second pet.

## Look around

The view controls above the scene work for owners and visitors, including during editing:

- **Zoom in** and **Zoom out** change magnification in 25-point steps from 75% to 250%. The percentage shows the current zoom. Zooming in intentionally crops part of the room for a closer look.
- **Rotate left** and **Rotate right** turn the view in 15° steps through a full 360°. The near walls, their trim/window and attached decorations cut away as you turn so the furniture stays visible. Shelves remain visible when their supporting wall is cut away, like a Sims-style room view.
- **Reset view** returns to the original angle and 100% zoom, with the whole room and yard fitted into view.

Zoom and angle survive window resizing, scene refreshes, editing and visitor preview. They affect only your current view, are not saved to the room or shown to other visitors, and reset when the room page is reopened. Buttons support touch and keyboard use. Wheel, pinch and drag camera gestures are not implemented, so ordinary scrolling and clicking objects keep their existing behavior. When 3D is unavailable, view buttons are disabled and the labeled room controls remain available.

## Arrange and use your room

Select **Edit room**. Display spots, including empty ones, the floor, rug, wardrobe, terrarium and cash table gain gentle gold outlines, and the walls receive a warm tint. Click a glowing object to open its choices directly: walls show paint, floor/rug show finishes, display spots show compatible owned oddities plus **Leave empty**, and shelves also offer location, style and removal. The wardrobe offers furniture styles alongside its existing clothing controls. The selected object has a stronger outline. Equivalent labeled buttons below the scene work with a keyboard or when 3D is unavailable; there is no need to open a collection menu first.

Choose an oddity by pressing its item button. Choosing an item already displayed elsewhere moves it and identifies its current spot; each owned oddity can appear once. **Leave empty** returns it to storage without selling, consuming or removing ownership. Existing purchases count immediately.

**Save room** saves furniture positions, styles, arrangement and paint together; **Cancel edits** restores all those room-layout choices. When there are no layout changes, **Done editing** exits edit mode. Visitors and **Preview as visitor** see the saved arrangement, without edit outlines or editing controls. Failed saves keep the draft available; a conflicting save from another tab asks you to reload rather than silently overwrite newer work. Leaving with unsaved changes offers to keep editing or discard them.

Free wall finishes are **Warm timber** (`bunkhouse-timber`), **Sage wash** (`bunkhouse-sage`) and **Clay walls** (`bunkhouse-clay`). Five fixed display spots plus up to four shelves give possessions a suitable place:

| Position IDs | Compatible oddities |
| --- | --- |
| `wall-left`, `wall-right` | Deed to the Moon, Lucky Horseshoe, Expired Fishing Licence. |
| `shelf-left`, `shelf-right`, `shelf-3`, `shelf-4` (when that shelf exists) | Oil Lamp, Smallpox Vaccine, A Rock, Telegraph Key, Snake Oil Tonic, Player Piano Roll. |
| `desk` | Telegraph Key, Oil Lamp, Player Piano Roll, on a separate writing desk (while the desk is in the room). |
| `floor` | Anvil, Brass Spittoon. |
| `window` | Covered Wagon, parked in the yard beside the room. |

The yard is separated from the cutaway room by low timber siding, lightly glazed frames and an open door leading onto stepping stones. The side yard is wider to give the wagon more breathing room, with the fence and path following its outer edge. The scene uses the original plain dark backdrop; the rear window retains its framed painted view. The boundary and door are scenery, not additional editable furniture. The wagon has an open bowed canvas cover, wooden bed, seat, hoops and four spoked wheels resting on outdoor ground. Its saved position ID remains `window`, so existing wagon placements continue working. The writing desk is separate from the chips-and-cash tray. A Telegraph Key belongs naturally on the desk; previously saved shelf placements remain supported. Lamps and piano rolls can also sit on either a shelf or the desk. Indoor furniture never accepts the wagon. These additions preserve the existing saved-room format and ownership.

The room and side yard each have 75% more floor area than the earlier layout (about 32% wider and deeper). Furniture, shelves, decorations and the wagon keep their original sizes, leaving more open space. Shelf mounts stay against the expanded wall, and the camera fits the larger footprint. Existing saved arrangements use the new positions automatically without changing their IDs or stored layout.

## Move, turn and put away furniture

In **Edit room**, seven pieces can be rearranged: the writing desk, terrarium, wardrobe, cash table, rug, the floor display spot and the yard display spot (with whatever is displayed on them). Select a piece in the scene or by its button and use **Move the …** at the top of its panel:

- The four arrows move it a quarter unit at a time. They follow the current view angle, so **→** always moves the piece toward the right of the screen.
- **Turn** rotates it a quarter turn.
- **Put away** is offered for the writing desk and wardrobe. A stored desk returns anything displayed on it to storage, and its display spot disappears until the desk comes back. Storing the wardrobe changes nothing about owned or worn clothing; the **Wardrobe** button still opens the outfit controls. The **Edit room** panel and the piece's own panel offer **Put the … back**, which uses its last position or, if that is now occupied, the nearest free spot to its original place. The rug is removed with its existing **No rug** style; the terrarium and cash table always stay in the room.

You can also press and hold a piece for about half a second and drag it across the floor. A footprint follows the pointer on a quarter-unit grid: green where the piece fits, red where it does not. Releasing on red, off the floor or outside the scene leaves the piece where it was. The same cancellation rules as shelf dragging apply.

Placement is deliberately limited. Indoor pieces stay on the room floor and may not overlap each other, the strip under the shelf mounts, the resident or the yard doorway. The resident stands at the centre of the rug and moves with it, including when **No rug** is chosen. A turn that would push a piece into a wall or neighbor is refused, so move it clear first. The rug only has to stay on the floor and may lie partly under other furniture, as long as its centre leaves the resident clear floor to stand on. The yard display stays in the yard, clear of the fence and stepping stones. The server applies the same rules on save. Furniture changes are part of the layout draft: they do nothing until **Save room** and are undone by **Cancel edits**. Shelves keep their four wall mounts. Furniture cannot be resized, stacked, placed diagonally or moved between the room and the yard, and nothing new can be added.

All 12 oddities are decorations. They grant no luck, XP, income, crafting, healing or battle bonus. Stable IDs and compatibility live in `server/catalog/room.js`; `odd-sheriffbadge` remains the legacy ID for the Expired Fishing Licence.

Feeding, playing, misting, wearing and fitting are available while editing, as well as during an ordinary owner visit. These existing actions save immediately and are not undone by **Cancel edits**; paint and display changes remain a separate draft. Wearing or fitting changes the same outfit throughout the Academy. The room offers existing free Barn care; consumables, bug equipment, additional pet details and memorial management remain in the [General Store and Barn](bug-store-items.md). Visiting never feeds a bug, pauses neglect or awards care XP. The Barn still reconciles hatching, time-derived XP and death from its authoritative clock.

## Shelves and finishes

Shelves, finishes and furniture styles are free. In **Edit room**, **Add shelf** lets you choose an empty wall mount. Each room supports zero to four shelves on four approved mounts: **Back lower**, **Front lower**, **Back upper** and **Front upper**. Occupied mounts are disabled. Existing rooms begin with their two original lower shelves and displayed items.

Click a shelf to select its displayed item, move it using **Shelf location**, choose its style/color, or **Remove shelf**. Moving a shelf carries its displayed item with it. Removing a shelf returns the item to storage without selling, consuming or deleting ownership. **Cancel edits** restores the removed shelf and its display; saving commits both together. Shelf names identify the furniture, so **Shelf 1** keeps its name after moving.

You can also press and hold a shelf for about half a second, then drag toward a free mount and release. The preview snaps to approved positions. Occupied mounts and releases away from a valid mount do not move the shelf. Escape, pointer cancellation, changing modes/views and leaving the room cancel an active drag. This edits the same layout draft as the location buttons; it does not save immediately. While editing, the scene handles shelf gestures; scroll the page outside the scene. Location buttons remain the keyboard and non-WebGL alternative.

| Object | Types | Colors |
| --- | --- | --- |
| Floor | Wood planks, Stone slabs | Honey pine, Walnut, Slate, Sage |
| Rug | Woven rug, Striped rug, No rug | Maroon, Sage, Indigo, Gold |
| Wardrobe | Classic wardrobe, Paneled wardrobe | Walnut, Honey pine, Sage, Clay |
| Shelf | Plain shelf, Braced shelf | Honey pine, Walnut, Sage, Clay |

Select **Floor finish**, **Rug**, **Wardrobe** or a shelf, then choose a type and color. A removed rug still has an editable floor spot and **Rug** button so it can be added back. Wardrobe furniture styling is separate from the outfit worn by the resident. Choosing styles changes no balances, pet rules or gameplay bonuses. See [Move, turn and put away furniture](#move-turn-and-put-away-furniture) for positions.

## Visits

Every account's room is open to **any signed-in player**, including accounts with no saved room record. Visits and wealth displays are always enabled; there are no sharing switches. A legacy name-only guest can use their own room, but must sign in with a username/password or Google account before their room can be visited or they can visit another player's room. Hidden and deleted accounts remain unavailable.

Profiles offer **Visit room**, and owners can copy a room link from **The front door**. The link is a destination, not an access token. Visitors see the saved room, visible outfit, pet, displayed oddities and exact in-game financial balances. Owners can be offline; visits are snapshots with no live visitor avatars, chat or shared editing. Only the owner can edit, equip or care for the pet.

The visitor response excludes undisplayed possessions, unworn clothing, email, authentication details, original selfies, transactions and pet-care timing. Eggs do not disclose their hidden species; memorials do not disclose feeding history or time of death. The displayed avatar is the existing saved drawing, not an original source photo.

Room pages refresh on open, focus and while visible every 30 seconds; hidden tabs pause periodic refreshes. An owner's selected Pet or Wardrobe panel refreshes too, including care or clothing changes made in another tab. **Preview as visitor** shows the saved visitor presentation with the same wealth display and exact balances as a real visit.

## Chips and cash

The physical pile grows by broad stages of existing total in-game worth: spendable bankroll, investments, poker chips in play and Risk escrow. Moving cash onto a poker table therefore does not shrink the pile by itself. Hover over the pile or hover/focus the **Chips & cash** button to see exact **Cash** and **Chips at tables**. Press Escape to dismiss the tooltip. Selecting the pile or button shows the exact total and breakdown, including investments and Risk stakes, for both owners and visitors; this also works on touch screens. Figures come from the room owner's current server snapshot, never the visiting player's session. The room creates no balance, reward or deposit mechanism.

| Stage | Total in-game worth | Appearance |
| --- | --- | --- |
| 0 | $0 or less | Empty tray. |
| 1 | Above $0, below $1,000 | Loose chips and notes. |
| 2 | $1,000 to below $10,000 | Neat chip stacks. |
| 3 | $10,000 to below $100,000 | Stacks and cash bundles. |
| 4 | $100,000 to below $1,000,000 | Crowded cash tray. |
| 5 | $1,000,000 or more | Full strongbox. |

Geometry is bounded even for extreme amounts. Missing or nonfinite data uses a neutral display and an unavailable amount rather than an invented zero. Negative amounts remain accurate in the numeric detail. Wealth is visible to every signed-in visitor without an opt-in.

## API and persistence

| Endpoint | Contract |
| --- | --- |
| `GET /api/room` | Current player's owner view, with layout, curated pet/appearance, exact worth and owned oddity IDs. |
| `PATCH /api/room/layout` | Owner-only layout replacement with expected revision, theme, placements and optional shelves/finishes/furniture. |
| `GET /api/players/:id/room` | Signed-in visitor view of an available account's room, including exact worth. |

Room endpoints set `Cache-Control: no-store`, including authentication and unavailable-room responses. No authenticated player yields 401; a legacy guest attempting a visit yields 403; a hidden, deleted, missing or legacy guest target yields 404. Malformed fields, unknown catalog IDs, incompatible/unowned items, duplicate items/positions, placements on absent shelves or a stored desk, furniture that is unknown, out of bounds, overlapping or not removable, more than nine placements or more than four shelves yield 400. A stale layout revision yields 409. The former sharing endpoint has been removed.

Example layout request, assuming the player owns the deed and revision 0 is current:

```json
{
  "expectedRevision": 0,
  "themeId": "bunkhouse-sage",
  "placements": [{ "anchorId": "wall-left", "itemId": "odd-deed" }],
  "shelves": [{ "id": "shelf-left", "spotId": "left-high-back", "typeId": "braced", "colorId": "sage" }],
  "finishes": {
    "floor": { "typeId": "stone", "colorId": "slate" },
    "rug": { "typeId": "striped", "colorId": "indigo" },
    "wardrobe": { "typeId": "paneled", "colorId": "honey" }
  },
  "furniture": { "wardrobe": { "x": 1.5, "z": 0, "r": 1 }, "desk": { "x": -0.73, "z": -2.87, "r": 0, "off": true } }
}
```

The response is the updated owner view with `layoutRevision` incremented. Do not include an owner ID, sharing fields, image URLs or HTML in this body; coordinates belong only in `furniture`. To remove all displays, send an empty `placements` array with the current revision and selected theme. To remove all shelves, send `shelves:[]` and omit any shelf placements from the replacement `placements` array. When supplied, `shelves` replaces the whole shelf list; each entry has exactly `id`, `spotId`, `typeId` and `colorId`. `finishes` supplies all three objects, each with exactly `typeId` and `colorId`. `furniture` maps any of `desk`, `pet`, `wardrobe`, `wealth`, `rug`, `floor` and `window` to exactly `x`, `z` (finite scene units, stored to two decimals), `r` (quarter turns, 0 to 3) and optionally `off` (boolean; `true` only for `desk` and `wardrobe`). Omitted pieces return to their default spots, and the resulting arrangement must satisfy the placement rules above. Omitting `shelves`, `finishes` or `furniture` preserves its current saved value for older clients. Shelf IDs and catalog choices are stable and checked server-side; each mounting spot accepts only one shelf.

Visitor JSON contains `owner` (`id`, `name`, display `avatar`), `layoutRevision`, `themeId`, validated `placements`, `shelves`, `finishes`, `furniture` (all seven pieces), a curated `pet` or null and `worth` (`bankroll`, `chips`, `holdings`, `riskEscrow`, `total`). Nonfinite or missing worth fields are omitted. `wealthStage` is included when a finite total is available. Owner JSON additionally includes `owned`. The profile's `roomVisitAvailable` boolean is a navigation hint; the room endpoint always checks that the viewer is signed in and the target account is available.

Room metadata lives in `<DATA_DIR>/rooms.json` as `{schemaVersion:1, rooms:{[playerId]:{layoutRevision,themeId,placements,shelves,finishes,furniture}}}`. Shelves, finishes and furniture extend schema version 1 with optional fields: old records retain their two lower shelves, original finishes, default furniture positions and existing placements without a write or destructive migration; an explicit empty shelf list remains empty. Invalid stored furniture references are filtered and invalid finishes fall back to catalog defaults. If stored furniture positions are malformed or no longer fit the floor plan, every piece is shown at its default spot until the next save. Previously stored `visibility` and `showWealthPile` flags are ignored and dropped on the next save. Money, ownership and pet state remain in their existing systems. Reading defaults creates no room file. Saves validate against current ownership, write through the existing atomic-file replacement, then replace the in-memory room document; a failed room-file write keeps the last committed room. Unsupported document schema versions stop room initialization rather than being overwritten. Older server builds do not understand added shelf identities/styles or furniture positions; keep a backup before a rollback that may rewrite these records.

Account deletion removes room metadata after existing deletion guards pass. Legacy-account claiming removes a discarded fresh account's room and retains the legacy player's room. Whole-account cleanup is not transactional across feature files. The JSON store remains single-process; multiple server replicas cannot safely share it. See [Development and troubleshooting](development.md) before maintaining local data.

## Verification and limits

```sh
node --test test/rooms.test.js test/rooms-api.test.js test/room-scene.test.js test/room-layout.test.js test/room-wagon.test.js
npm run build
npm test
```

Domain/API checks cover permissions, data projection, ownership, revisions, failures, deletion and wealth behavior. Scene tests cover fitted camera bounds, view limits, picking, furniture dragging and bounded wealth geometry; they do not prove actual GPU rendering or mobile performance. Follow the [development guide](development.md#validation-and-known-baseline) when recording current full-suite results and existing failures.

The room renders on demand with antialiased edges, slightly finer prop geometry and wood grain, and no required camera motion or automatic sound. The drawing buffer follows the display up to 1.5× density, capped at 1600×1000 pixels; larger screens may render below native resolution. Bug and avatar pixel art retain their existing style. The back-wall window has a recessed painted view, four glass panes, a full frame and a projecting sill; the wardrobe sits clear of it in the back corner. Camera fitting includes the wider yard at every rotation. The larger wagon uses its visible model for clicking, allowing nearby furniture to remain reachable through empty space around the canopy and wheels.

Equivalent labeled HTML controls remain usable when WebGL cannot initialize or loses its context. Check the real owner/visitor flows, object picking, narrow/short layouts, keyboard focus, save conflicts and fallback in a browser. Physical-phone performance and GPU recovery still need device testing; do not infer those results from model tests or the build. Pushing or merging this code does not deploy the live site.
