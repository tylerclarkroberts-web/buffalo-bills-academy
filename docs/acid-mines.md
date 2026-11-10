# Acid Mines

Clock in, follow the clicks through the tunnels, and hold **Mine** at a flowing pool to fill the bucket. Shifts take at least 20 seconds; some veins take longer. The server chooses the payout and credits it to your bankroll when the shift finishes.

## Leaving after getting paid

After a successful shift, **Back to the card room** and the mine header's **Surface** button both bring up the Foreman for a brief send-off. He picks one of eighteen three-line grumbles about payroll, work ethic, or heading back to the cards. Normal acid pay and all jackpot results qualify.

Use **Skip** to reveal the current line, **Next** to advance, and **Back home** after the final line to return to the lobby. The dialogue button receives keyboard focus; Enter or Space activates it. Sound follows the mine's sound toggle, and the scene respects reduced motion.

There is no math question, bonus, pay deduction, or clock-in restriction for this send-off. Pay is already credited. **Another shift** starts the next shift directly without the send-off.

Controls behind the Foreman are inactive while he speaks. Clock-in and departure buttons also wait for an in-progress clock-in request, so another shift cannot start behind the send-off.

The paid send-off is local to the current results screen. It is not saved or replayed after a reload, and it does not intercept browser Back or navigation outside the mine's departure buttons.

## Mud and empty buckets

Leaving an unfinished shift with **Surface** or the shift's quit control ends that shift without pay and triggers the usual lecture and math question. A mud result still pays $10 and immediately triggers its own lecture and question.

Those questions remain server-held and block another clock-in until answered correctly. A wrong answer gives a new question without taking money. A correct first answer can award the existing $5 bonus, at most three times per hour.

## Dialogue variety

| Pool | Choices |
| --- | ---: |
| Paid send-offs | 18 complete three-line scenes |
| Empty-bucket openings | 24 pairs |
| Mud openings | 15 pairs |
| Shared rant lines | 114 |
| Lead-ins to the math question | 30 |
| Wrong-answer jabs | 15 |
| Correct-answer replies | 6 |

Paid departures randomly choose a complete scene so each joke keeps its setup and payoff. Mud and empty-bucket lectures randomly combine an opening, shuffled shared rant lines, and a math lead-in. They stay 4–20 lines long: 40% short (4–6), 35% medium (7–12), and 25% long (13–20). Four-line lectures use only the first line of the opening pair. No line repeats within a lecture, but separate encounters can repeat dialogue; there is no remembered rotation.

Wrong and correct answers randomly choose from their own pools. The eight existing math generators still randomize their numbers; dialogue variety does not change question difficulty, pay, or bonuses. Already-pending server-held lectures keep their original lines until completed.

## Development checks

Run `node --test test/foreman.test.js` and `npm run build` from the repository root. Check both paid exit buttons, **Another shift**, and mud/unfinished-shift quizzes on desktop and narrow/short mobile layouts. Confirm paid send-offs return home without a math form or an answer request, and leave the credited bankroll unchanged.

No endpoints, saved-data formats, or environment settings change for paid send-offs. See [Development and troubleshooting](development.md) for local setup and the known test baseline.

Verification on November 10, 2026: all eight Foreman tests passed, the frontend build passed with the existing duplicate-attribute warnings in the blackjack screen, and local documentation links resolved. An isolated local server with synthetic accounts, deterministic payouts, and shortened shift waits exercised both paid departure buttons, Another shift, unchanged pay, absence of a pending paid quiz, and the existing unfinished-shift math form. The dialogue was checked at 1366×768, 320×640, and 844×390, including scrolling the results screen before departure. The full suite, physical devices, and live deployment were not checked.

The subsequent dialogue-only expansion tripled every pool listed above, bringing the distinct written lines from 98 to 296. All eight Foreman tests, the frontend build, and local documentation-link checks passed again; the existing blackjack build warnings remain. The selection logic and layouts did not change in this expansion, and browser checks and the full suite were not repeated.
