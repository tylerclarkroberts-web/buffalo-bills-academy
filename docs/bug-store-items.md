# Bug supplies in the General Store

Bug departments unlock after your egg hatches. Select an item to read its effect, duration and use limits before spending play money. The detail panel scrolls on smaller screens so its explanation and buttons remain reachable.

Buying a consumable puts it in your inventory. Its effect starts when you press **Use**, and that spends one copy. All need meters stop at 100, so using a boost near full gives a smaller increase. Need boosts have no fixed expiry: the meter gradually falls again.

## Bug care

| Item | What happens when used | How long / limits |
| --- | --- | --- |
| Automatic Feeder | Sets Fed to 100 and keeps it full; pauses the starvation clock. The bug earns 12 XP for each full day the feeder covers, on top of the usual day XP. | 14 days per use. Another use adds 14 days to the remaining time, with no more than 60 days ahead. No use cooldown. The Barn shows the end date. Mood and Clean still decay. |
| Auto-Mister | Adds 40 Clean immediately, with up to 6 care XP. | Single use, one instant mist. Clean falls 1.4 points/hour, so a full 40-point boost takes about 28 hours 34 minutes to decay. Wait 30 minutes between misters. |
| Cosy Heat Lamp | Adds 40 Mood immediately, with up to 6 care XP. | Single use, one instant boost. Mood falls 1.6 points/hour, so a full 40-point boost takes 25 hours to decay. Wait 30 minutes between lamps. |

The lamp and mister do not stay equipped or run automatically. Their cooldowns are separate. Their boosts do not reset the feeding clock. Each gives up to 6 care XP, half a free care action, inside the shared limit of 120 care XP per UTC day. Food and the feeder protect against starvation; mood and cleanliness do not.

## Your bug in My Room

[My Room](personal-rooms.md) displays the same Barn egg, bug or memorial in a 3D terrarium. It does not create another pet, change needs/XP rules or provide passive care. Owners can use the existing free Feed, Play and Mist actions, including while editing the room; other equipment, consumables and full pet details remain in the General Store and Barn. Care and clothing actions save immediately, independently of **Save room** or **Cancel edits**. A visitor can inspect appearance and level but cannot care for the pet and does not receive its private feeding history or cooldowns.

Room oddities are decorative. The Oil Lamp oddity is separate from the single-use Cosy Heat Lamp care item; neither displaying an oddity nor visiting a room grants pet benefits.

## Bug food

Food increases Fed by the amount below and resets the starvation clock. All store foods share one 15-minute cooldown. Each use also gives up to 12 care XP within the shared limit of 120 care XP per UTC day; free Barn care shares that XP limit. Store-food cooldowns are separate from the free **Feed** button's 20-minute cooldown.

| Food | Fed gained, up to 100 |
| --- | --- |
| Fresh Leaf Litter | 20 |
| Overripe Fruit | 35 |
| Flower Nectar | 40 |
| Tree Sap Drip | 45 |
| Cricket Snacks | 50 |
| Mealworm Bucket | 60 |
| Premium Dung Ball | 70 |
| Artisan Moss | 75 |
| Bug Banquet | 100 |
| Golden Ambrosia | 100, then kept full for 7 days |

Fed normally falls 0.6 points/hour. Food has no timed protection, except Golden Ambrosia: it also works as a 7-day automatic feeder (same 60-days-ahead limit, same 12 XP per covered day). The feeding clock restarts when food is used. A bug can die after 21 days without feeding, or 21 days after its feeder runs out. A low Fed meter alone does not determine death.

## Bug toys

Toys are permanent purchases. Equip one toy at a time; each free **Play** action then adds its bonus to the normal 30 Mood, up to 100. Play has a 20-minute cooldown. The toy adds no passive mood: use Play to receive the bonus. Mood falls 1.6 points/hour afterward. Swap toys or take one off without losing ownership.

| Toy | Extra Mood per Play |
| --- | --- |
| Climbing Twig | 4 |
| Shiny Pebble | 5 |
| Tiny Dung Ball | 6 |
| Leaf Maze | 8 |
| Little Mirror | 10 |
| Bug Wheel | 12 |
| Bark Castle | 15 |
| Disco Ball (tiny) | 20 |

## Bug style and battle gear

Style items are permanent cosmetics. Equip one shell colour, one hat and one accessory together. They stay until swapped or taken off, and do not alter species, needs, XP or battle strength. The first purchase in an empty equipment slot is equipped automatically; later purchases can be worn from the detail panel.

Battle gear is also permanent, with one gear slot. It adds the listed 1–6% damage (Six Tiny Boots: 2.5%) while equipped in Barn bouts, capped at 6%. Gear bonuses do not stack. Bouts unlock at level 5 and have a one-hour cooldown, with no money or XP at stake. Store items do not change poker cards or odds.

These explanations reflect `server/catalog/bug.js`, `server/shop.js`, `server/barn.js` and `server/engine/bout.js`. Prices, effects, caps and cooldowns are enforced on the server; changing this wording does not change the game rules.
