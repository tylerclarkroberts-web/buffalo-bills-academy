# Playing at a poker table

This guide covers the controls on the poker table screen: the table menu on phones, choosing a bet or raise amount, and how players are shown around the felt. For creating tables and host options see [Host options and room history](table-options-and-history.md).

## Table menu on phones

On a phone, upright or on its side, the table header shows the table name and one **Menu** button. The menu lists every table control by name:

| Row | What it does |
| --- | --- |
| **Say something** | Opens the speech-bubble box. Seated players only. |
| **Gag** / **Light up** | Shown when you hold a gag or Smoke Shop item and the host allows it. The choices open inside the menu. |
| **Replay last showdown** | Shown after a hand has gone to showdown. |
| **Music** | Opens the on/off switch, volume and current tune inside the menu. |
| **Invite players** | Shares or copies the invite link. Not shown on a bot table that is closed to friends. |

Below the rows the menu shows the blinds, buy-in and turn time, whether the table is public or private (or a practice table), and any host defaults such as **Flop start** and **Auto-check**.

Choosing a row that leaves the menu (Say, replay, Invite, or using a gag or item) closes it. Tapping outside or pressing Escape also closes it; Escape returns focus to **Menu**.

Windows 900px and wider that are not a short landscape phone keep these controls as separate buttons in the header, with the stakes and visibility lines next to the title. The multi-table view keeps its own compact pane header.

## Choose a bet or raise amount

**Bet…** or **Raise…** opens the sizing panel. It has three rows:

1. **Quick sizes**: **Min**, **½ pot**, **¾ pot**, **Pot** and **All-in**. Pot sizes are "raise to" amounts measured after your call, rounded to the small blind. A size that falls below the minimum raise or above your stack is left out, so a short stack may see only **Min** and **All-in**.
2. **Steps and amount**: buttons that subtract or add one big blind and one small blind, with the amount between them. A tap moves one step; holding a button keeps stepping. An amount that is off the grid, such as a pot size of 333 at 5/10 blinds, moves to the next multiple first (335 up, 330 down). Tap the amount to type any whole number; phones show the number keypad. Typed values are brought back inside the legal range when you leave the box.
3. **Back, slider and confirm**: the slider is curved when the range is large, so most of its travel covers small amounts and it stays usable with a deep stack. It stops on multiples of the small blind; both ends are exact. The confirm button always shows the amount it will send, and reads **All-in** at the top of the range.

When the small blind equals the big blind there is one pair of step buttons. When all-in is the only legal raise, the action row shows the all-in button directly and the panel is not needed.

On phones the panel uses the full width, so your hole cards leave the action bar while it is open; they stay on your seat. On a phone on its side, the turn bar and the tab row also step aside until you confirm or go back.

The amounts and rules the server accepts are unchanged. The panel sends the same `raise` and `allin` actions as before.

## Players around the felt

Each seat shows the player's avatar, name and stack. On a phone-shaped (upright) felt the avatars are sized from the screen width and the head fills more of the figure, so faces are recognisable: about 55px wide at six seats on a 375px phone, and about 37px at nine seats. They are also capped by the felt's height, so they shrink (to about 44px at six seats) while the sizing panel is open instead of running into each other. To make room, other players' face-down cards are smaller and tuck in behind the avatar, and at up to six seats the pit boss stands a little shorter so the oval is taller. Revealed cards and your own cards keep a readable size.

Also on an upright felt:

- Each bet or blind chip sits in the free spot on the felt nearest its player. It never covers a seat, a name plate, the board, the pot or another chip, and nothing covers it. Positions are measured from the page, so long names and large amounts are accounted for.
- A folded player's plate reads **folded** under the stack, and the avatar is greyed.
- Your own countdown appears in the turn bar under the felt, not as a tag on your seat. Other players' countdowns stay on their seats.
- Long names are shortened with an ellipsis so plates stay on screen. The full name is in **Players**.

Wide and landscape felts keep their existing sizes and fixed chip positions, including the larger sizes on 1440p and 4K windows.

## Players list

**Players** shows each player's chips, total buy-in and net result. In a narrow side panel (desktop windows up to roughly 1320px wide) the buy-in column is hidden so names have room; it returns when the panel is wider and is always shown on phones, where the list has the full width. Long names end in an ellipsis and show in full on hover.

## Source and checks

| Area | Files |
| --- | --- |
| Header menu, sizing panel, seat layout | `client/src/TablePage.jsx` |
| Step, preset and slider maths | `client/src/table/betsize.js`, `test/betsize.test.js` |
| Bet chip placement on the phone felt | `client/src/table/chipspot.js`, `test/chipspot.test.js` |
| Styles | the phone header, raise panel and phone felt sections at the end of `client/src/styles.css` |

```sh
node --test test/betsize.test.js test/chipspot.test.js
npm run build
```

In a browser, check a 375×812 phone, a short landscape phone (for example 667×340) and a desktop window: open every menu row, step and hold the − / + buttons, type an amount outside the range, drag the slider to both ends, and look at six-seat and nine-seat tables, with the sizing panel closed and open, for overlapping seats, covered bet chips or plates running off screen. On a desktop window near 1024px wide, check that names in **Players** are readable.
