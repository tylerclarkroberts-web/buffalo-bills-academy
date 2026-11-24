# Bug variety

Every bug gets its own look, once, from its id (`server/engine/variety.js`), stored on its pen as `pen.variety`:

- **Base**: legs (about 30%), wheels, hover rotor, tank tracks or slug foot. A grown bug in its hatched form is drawn on its base instead of its legs. Larvae and evolved bodies (Stage II/III) keep their own.
- **Ailments**: one, sometimes two (about 30%), each with a small cartoon visual and a one-line flavour: Bug Pox, Warty Wobbles, Itchy Rash, Banged Up, The Sniffles, Hot Head, Eye Twitch, Side-Eye, Nervous Sweats, Big Grin, Little Rain Cloud, Neat Freak, Night Owl, Dizzy Spells.
- **Fruit and veg accent**: a few faint pixels toned into the body (leaf sprig, strawberry seeds, cherry stem, pea pod, lemon peel, carrot top, pumpkin rib, grape cluster).
- **Colouring and pattern**: a small hue and tone turn (about one in eight is a colour morph), plain, freckled or banded.

Every species also carries a fixed **mining tool** in its right hand (`server/engine/tools.js`), with a name and line on its card and in the Bugdex.

None of it is read by fights, the gym or the mines. Live bugs are assigned on the next boot (`Barn.migrate`), with exactly the look the formula gives, and nothing else on the pen changes; a stored variety always wins over the formula after that. Drawing is in `client/src/barn/varietyArt.js`, called from `sprite.js`, and reaches every surface through the bug's `style.variety` (`Barn.looksOf`, rooms, the mine's other-miner view).
