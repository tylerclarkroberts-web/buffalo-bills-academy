# Acid Mines

Clock in, follow the clicks through the tunnels, and hold **Mine** at a flowing pool to fill the bucket. Shifts take at least 20 seconds; some veins take longer. The server chooses the payout and credits it to your bankroll when the shift finishes.

## Finding an egg

Each new shift has a **10% chance** of an egg when your Barn is empty. An egg, living bug or unburied dead bug occupies the Barn and prevents another egg from appearing. Resuming a shift keeps its original roll; reloading does not give another chance.

An egg appears near the entrance for the **first 30 seconds of the shift**. Approach it and use **Pick it up**, tap the egg itself, or press **G**. The server keeps an additional three-second allowance for the pickup request to arrive. The timer starts at clock-in and continues when you leave or reload the page; finishing or quitting the shift ends the opportunity. Collection moves the egg into your existing Barn slot without changing the shift's pay or timing.

## Phone controls

The stick moves forward/back and turns when pushed sideways. Small sideways thumb movements stay in a deadzone; moving farther sideways increases turning smoothly. Hold the left/right arrow buttons to turn continuously; they do not snap to a fixed angle. Drag the tunnel view to look around. At a flowing pool, hold **Mine** to fill the bucket. Releasing or cancelling the press stops mining.

On narrow portrait layouts, mining, egg pickup and door actions sit above the movement pad. Narrow landscape layouts put them beside it. The status and acid meter use separate columns on narrow screens; the decorative header brand hides on the smallest screens to keep Surface, balance and sound reachable. The orientation screen explains the stick, held turn buttons and drag-to-look gesture. The November 10, 2026 update fixes the mining-panel overlap observed at 320px and 390px and removes the sudden steering jump while walking. Physical-phone feel, performance and Safari remain unverified.

### Optional tilt controls

Tap **TILT OFF** beneath the left-turn button to use phone motion instead of the stick. Allow motion access if the browser asks, then hold the phone in a comfortable position for calibration. The control reads **WAITING** during permission, **CENTERING** during calibration, **TILT ON** when ready, and **PAUSED** while mining or opening the Doom room. Errors show **TILT OFF**. **Use touch** remains available to turn tilt off with one tap and restore the stick. Tilt the phone's top away from you to walk forward, back toward you to reverse, and lean it left/right to steer. Small movements are ignored and larger movements ramp up smoothly. Dragging the view still lets you look around.

**Recenter** makes your current grip neutral. **Use touch** stops motion input and restores the stick and turn buttons; it also leaves a permission or sensor error. Keyboard walking/turning is inactive in tilt mode so the two inputs cannot fight. Tilt starts off for every shift or reload and is not saved as a preference.

Holding **Mine** pauses tilt walking and turning. Releasing it recalibrates to your current grip. Opening the Doom room pauses tilt; interacting with its embedded game transfers focus and turns tilt off, so enable it again after returning if needed. These controls do not pause the shift or egg timer. Rotating between portrait and landscape clears movement and recalibrates for the new screen direction. Switching away from the page or losing window focus turns tilt off. Sensor listeners stop when you switch to touch or leave the shift.

Motion access requires a supporting browser and a secure context, normally HTTPS. Plain HTTP at a phone-accessible LAN address does not qualify. Permission requests happen only after tapping **TILT**. Unsupported browsers, denied permission and missing/invalid sensor readings show a message with **Use touch** available. Orientation values, calibration and permissions are used locally; the app does not send sensor readings to the server or save them. There are no new endpoints, saved-data fields, dependencies or environment settings. See [browser permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static).

Orientation events may arrive only when the phone changes angle. A steady valid tilt keeps moving until you return to neutral, pause or switch to touch; it does not time out just because the phone is held still. See the [device orientation event specification](https://www.w3.org/TR/orientation-event/#deviceorientation).

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

Run `node --test test/mines-eggs.test.js test/mines-controls.test.js test/mines-tilt.test.js test/foreman.test.js` and `npm run build` from the repository root. Check egg visibility through 30 seconds and pickup after the former ten-second deadline. Check movement and action targets together on portrait and short landscape layouts, including smooth steering and releasing/cancelling a mining press. For tilt, check permission grant/denial, missing readings, current-grip calibration, both landscape directions, Recenter, steady holds, mining/room pause, focus loss and touch fallback. Physical iPhone and Android checks are still needed to tune sensitivity and judge whether tilt feels easier. Check both paid exit buttons, **Another shift**, and mud/unfinished-shift quizzes on desktop and narrow/short mobile layouts. Confirm paid send-offs return home without a math form or an answer request, and leave the credited bankroll unchanged.

No endpoints, saved-data formats, or environment settings change for paid send-offs. See [Development and troubleshooting](development.md) for local setup and the known test baseline.

Verification on November 10, 2026: all eight Foreman tests passed, the frontend build passed with the existing duplicate-attribute warnings in the blackjack screen, and local documentation links resolved. An isolated local server with synthetic accounts, deterministic payouts, and shortened shift waits exercised both paid departure buttons, Another shift, unchanged pay, absence of a pending paid quiz, and the existing unfinished-shift math form. The dialogue was checked at 1366×768, 320×640, and 844×390, including scrolling the results screen before departure. The full suite, physical devices, and live deployment were not checked.

The subsequent dialogue-only expansion tripled every pool listed above, bringing the distinct written lines from 98 to 296. All eight Foreman tests, the frontend build, and local documentation-link checks passed again; the existing blackjack build warnings remain. The selection logic and layouts did not change in this expansion, and browser checks and the full suite were not repeated.

The same day's egg update raises the chance from 6% to 10% and the visible window from 10 to 30 seconds, preserving the three-second network allowance and existing API/data formats. All three deterministic egg tests passed, covering probability boundaries, occupied Barns, resuming without a reroll, authenticated pickup at 30 and 33 seconds, and rejection after 33 seconds or for invalid/repeated claims. The build passed with the existing blackjack warnings. Isolated browser checks at 1280×844, 390×844, 320×640 and 568×320 confirmed visibility after 20 seconds, pickup at 25 seconds through the UI/API, disappearance after 30 seconds, and reachable pickup/movement targets. These checks used synthetic accounts, controlled clocks and repositioning near the egg; they do not prove real-device search ease.

The mobile fixes passed two steering tests and browser checks at 320×640, 390×844, 568×320, 667×340, 844×390 and desktop 1280×800. Hit-testing confirmed that movement and mining targets no longer overlap, while scripted pointer input verified continuous steering, held-turn release and cancellation stopping mining progress. All 12 existing Foreman/Barn tests also passed. No browser exceptions were observed. Physical devices, Safari, a full-suite run and live deployment were not checked.

The subsequent tilt-control checks passed all 25 tests in `node --test test/mines-tilt.test.js test/mines-eggs.test.js test/mines-controls.test.js test/foreman.test.js test/bout.test.js`. Eight tilt tests cover opt-in permissions, cancellation, valid/invalid/missing readings, calibrated axes and screen rotation, deadzone/smoothing, held poses without repeated events, upright-angle transitions, recentering and lifecycle cleanup. The build passed with the same existing blackjack warnings; all 31 local links in the README and this guide resolved.

An isolated Edge browser with synthetic accounts and simulated sensor events passed 20 layout/state checks across 320×640, 390×844, 568×320, 667×340 and 844×390. Checks covered manual controls, active tilt, errors and egg pickup; reachable targets without panel overlap or horizontal overflow; tap-activated permission requests, neutral/combined movement, steady holds, Recenter, mining pause without camera drift, focused-button Space/Enter, keyboard movement after switching back, denied/unsupported/no-reading/pending-cancel paths, hidden/blur reset and listener cleanup. The existing egg-window and desktop/mobile control checks also passed against the new UI. No browser exceptions were observed. Sensor permissions/data were simulated, so physical iPhone/Android comfort, sensitivity and Safari compatibility still need device testing. The full suite was not rerun, and this work did not deploy the site.
