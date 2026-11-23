// Evolution bodies share the adult sprite's grid and material lighting.
function oreClaw(c, x, y, reversed = false) {
  const tip = reversed ? -1 : 1;
  c.ell(x, y, 4.5, 3.5, 'M', false);
  c.ell(x, y, 2, 2, 'J', false);
  c.poly([[x - 1, y + tip * 2], [x - 4, y + tip * 2], [x - 6, y + tip * 6],
    [x - 5, y + tip * 10], [x - 2, y + tip * 11], [x - 3, y + tip * 7]], 'M', false);
  c.poly([[x + 1, y + tip * 2], [x + 4, y + tip * 2], [x + 6, y + tip * 6],
    [x + 5, y + tip * 10], [x + 2, y + tip * 11], [x + 3, y + tip * 7]], 'M', false);
}

function hybrid(c) {
  // Four legs carry the old shell below the boiler.
  c.line(25, 43, 15, 45, 'D', 4);
  c.line(15, 45, 8, 53, 'M', 3);
  c.line(8, 53, 5, 56, 'D', 2);
  c.line(25, 51, 17, 55, 'B', 4);
  c.line(17, 55, 13, 60, 'M', 3);
  c.ell(15, 45, 2, 2, 'J');
  c.ell(17, 55, 2, 2, 'J');
  c.ell(31.5, 47, 14, 11, 'B', false);
  c.line(31.5, 43, 31.5, 56, 'S', 2, false);
  c.line(22, 44, 25, 53, 'A', 2);
  c.poly([[24, 35], [39, 35], [41, 41], [36, 45], [27, 45], [22, 41]], 'M', false);
  c.line(31.5, 20, 31.5, 37, 'M', 6, false);
  c.ell(31.5, 30, 9, 9, 'D', false);
  c.ell(31.5, 30, 6.5, 8, 'M', false);
  for (const y of [27, 31, 35]) c.line(27, y, 36, y, 'J', 2, false);

  c.line(24, 25, 15, 30, 'M', 6, false);
  c.ell(23, 24, 5, 4, 'B', false);
  c.ell(15, 30, 3.5, 3.5, 'J', false);
  c.line(15, 31, 8, 37, 'M', 6, false);
  c.line(13, 32, 8, 35, 'J', 2, false);
  oreClaw(c, 8, 39);

  c.line(39, 26, 46, 32, 'M', 4, false);
  c.ell(40, 25, 4, 4, 'B', false);
  c.ell(46, 32, 2.5, 2.5, 'J', false);
  c.line(46, 33, 49, 39, 'M', 4, false);
  c.line(49, 38, 53, 41, 'M', 2, false);
  c.line(49, 39, 48, 43, 'M', 2, false);
}

function hauler(c, botched) {
  // Everything is drawn on the left and mirrored. Built like a hoist: shoulders twice the width of the hips.
  // Ore-grabber feet, shins, a geared knee, thighs.
  c.poly([[13, 61], [15, 57], [19, 55], [27, 55], [29, 58], [29, 61]], 'M');
  c.line(15, 60, 27, 60, 'J', 2);
  c.line(18, 60, 18, 61, 'o'); c.line(22, 60, 22, 61, 'o');
  c.line(23, 55, 24, 49, 'M', 6);
  c.line(22, 54, 23, 50, 'J', 2);
  c.line(25, 47, 28, 40, 'M', 9);
  c.line(25, 46, 27, 41, 'J', 3);
  c.ell(24, 48, 4.5, 4, 'D'); c.ell(24, 48, 2.5, 2.5, 'J'); c.sym(24, 48, 'o');
  // Hips, then the winch drum it has for a waist.
  c.poly([[25, 37], [38, 37], [40, 41], [23, 41]], 'M', false);
  c.ell(31.5, 34, 6.5, 4, 'D', false);
  for (const y of [32, 34, 36]) c.line(26, y, 37, y, 'J', 1, false);
  // The hoist wheel on its back, over one shoulder.
  c.ell(15, 15, 6, 6, 'D', false); c.ell(15, 15, 4, 4, 'J', false);
  c.line(15, 11, 15, 19, 'M', 2, false); c.line(11, 15, 19, 15, 'M', 2, false);
  c.line(31.5, 18, 31.5, 24, 'M', 8, false); // neck
  // Arms: piston bundles for biceps, a geared elbow, a forearm thicker than the leg.
  c.line(10, 27, 8, 36, 'M', 10);
  c.line(8, 28, 7, 35, 'J', 2); c.line(12, 28, 11, 35, 'J', 2);
  c.line(7, 39, 6, 47, 'M', 9);
  c.line(6, 40, 5, 46, 'J', 2);
  c.ell(7, 38, 5, 4, 'D'); c.ell(7, 38, 2.5, 2.5, 'J'); c.sym(7, 38, 'o');
  // Chest: a wedge of plate from shoulder to shoulder, with the bug's own shell bolted on as pecs.
  c.poly([[14, 21], [49, 21], [49, 28], [39, 33], [24, 33], [14, 28]], 'M', false);
  c.poly([[18, 22], [30, 22], [31, 28], [26, 31], [18, 28]], 'B');
  c.line(20, 24, 28, 24, 'L', 2);
  c.line(31.5, 22, 31.5, 32, 'S', 1, false);
  c.sym(22, 29, 'J'); c.sym(28, 31, 'J');
  // Shoulder housings, capped in shell.
  c.ell(11, 23, 8.5, 7.5, 'M');
  c.ell(11, 21, 6.5, 4.5, 'B');
  c.sym(11, 27, 'J');

  const fist = botched ? 6 : 57;
  c.ell(fist, 50, 5.5, 5, 'M', false);
  c.line(fist - 3, 51, fist + 3, 51, 'J', 2, false);
  oreClaw(c, botched ? 57 : 6, botched ? 52 : 48, botched);
}

function crookedFrame(c) {
  c.line(30, 37, 23, 49, 'M', 4, false);
  c.ell(23, 49, 3.5, 3, 'J', false);
  c.line(23, 50, 23, 57, 'M', 4, false);
  c.line(23, 56, 17, 60, 'D', 4, false);
  c.line(35, 38, 38, 47, 'M', 5, false);
  c.ell(38, 47, 3.5, 3, 'J', false);
  c.line(38, 48, 37, 57, 'M', 4, false);
  c.line(37, 58, 43, 59, 'D', 4, false);
  c.line(32, 20, 35, 30, 'M', 5, false);
  c.line(34, 26, 30, 38, 'M', 6, false);
  c.line(36, 26, 35, 37, 'J', 3, false);
  c.poly([[27, 34], [37, 36], [39, 40], [29, 42], [26, 39]], 'B', false);
  c.line(29, 24, 22, 32, 'M', 4, false);
  c.line(22, 32, 19, 39, 'M', 3, false);
  c.ell(22, 32, 2, 2, 'J', false);
  c.line(19, 39, 16, 43, 'D', 2, false);
  c.line(19, 40, 20, 44, 'M', 2, false);
  c.line(37, 24, 46, 31, 'M', 5, false);
  c.ell(46, 31, 3.5, 3, 'J', false);
  c.line(46, 32, 49, 43, 'M', 6, false);
  oreClaw(c, 49, 43, true);
}

function porcelainHead(c) {
  c.line(28, 8, 25, 4, 'D', 2, false);
  c.line(25, 5, 25, 3, 'A', 2, false);
  c.ell(32.5, 11, 9, 7, 'B', false);
  c.poly([[25, 9], [31, 7], [38, 8], [40, 14], [38, 20], [34, 22], [29, 21], [25, 16]], 'P', false);
  c.ell(29, 11, 3.2, 2.8, 'M', false);
  c.ell(36, 12, 2.4, 2.4, 'J', false);
  c.ell(29, 11, 2.2, 1.8, 'E', false);
  c.ell(36, 12, 1.4, 1.4, 'E', false);
  c.put(29, 10, 'G');
  c.put(36, 12, 'G');
  c.put(33, 14, 'M');
  c.poly([[27, 15], [32, 16], [38, 15], [37, 19], [33, 20], [29, 19]], 'o', false);
  for (const x of [28, 30, 32, 34, 36]) c.put(x, x === 32 ? 17 : 16, 'P');
  for (const x of [31, 35]) c.put(x, 19, 'P');
}

export function drawEvolution(c, stage, botched) {
  if (stage === 2) hauler(c, botched);
  else if (botched) crookedFrame(c);
  else hybrid(c);
  if (botched) porcelainHead(c);
}
