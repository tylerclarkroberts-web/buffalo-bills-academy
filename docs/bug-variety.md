# Bug variety

**Only Stage II bugs wear it.** Stage I (larvae and grown Stage I bugs) and Stage III are drawn exactly as they were
before variety existed, pixel for pixel; `test/bug-variety.test.js` pins that with a fingerprint of every species at
Lv 1, 3 and 10 on the 1x, 2x and 4x grids.

Every bug is still given its look once, from its id (`server/engine/variety.js`), stored on its pen as `pen.variety`,
so a bug already has its look the day it evolves. When it is a Stage II bug it shows:

- **Base**: wheels, hover rotor, tank tracks or slug foot (a quarter each), instead of the iron legs its machine body
  had. Every Stage II bug has one; a look stored with the old `legs` value is given one of the four from its seed.
- **Ailments**: one, sometimes two (about 30%), each with a small cartoon visual and a one-line flavour: Bug Pox, Warty
  Wobbles, Itchy Rash, Banged Up, The Sniffles, Hot Head, Eye Twitch, Side-Eye, Nervous Sweats, Big Grin, Little Rain
  Cloud, Neat Freak, Night Owl, Dizzy Spells.
- **Fruit and veg accent**: a few faint pixels toned into the body (leaf sprig, strawberry seeds, cherry stem, pea pod,
  lemon peel, carrot top, pumpkin rib, grape cluster).
- **Colouring**: a turn of the colour wheel (about a third stay near their species' colours, the rest go anywhere) and
  a tone, plus usually a morph: two-tone, inverted, melanic (dark, accent still bright), pale or vivid.
- **Shell pattern**, bold, inked in a colour that stands out from the body: stripes, spots, chevrons, camo, checker,
  bands, freckles (or plain, rarely).
- **Plating**: what its metal is finished in (its base and tool, and a botched bug's machine body): iron, brass, copper,
  gunmetal, gold, or painted red, teal, olive or cream.
- **Mining tool**: fixed per species (`server/engine/tools.js`), held, big and turned up, in its right hand (each Stage II
  design says where that is: `hand` in `stageTwoArt.js`); named with a line on its Stage II card and in the Bugdex.

The Bugdex's Stage II tile and card show a sample look for the species. Stall quirk lines and card notes appear only on
a Stage II bug. The photo bug (steeze) is never changed.

None of it is read by fights, the gym or the mines. Live bugs are assigned on the next boot (`Barn.migrate`), with
exactly the look the formula gives, and nothing else on the pen changes; a stored variety always wins over the formula
after that. Drawing is in `client/src/barn/varietyArt.js`, called from `sprite.js` (`spriteArt`, Stage II only), and
reaches every surface through the bug's `style.variety` (`Barn.looksOf`, rooms, the mine's other-miner view).
