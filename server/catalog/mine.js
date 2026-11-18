// Mine gear and shaft permits. Sold in the General Store; the Acid Mines read ownership at clock-in (server/mines.js).
// Deliberately expensive: the mines are the only faucet, so what raises a cheque (a permit to a shaft with better acid)
// is priced in weeks. Everyone carries the same 100-unit bucket; the tools only save time.
//   rate   fill-speed multiplier (the fastest one you own counts)
//   lamp   see farther; deeper shafts are darker
//   rod    points along the shortest walk to the current pool (it does not change what the pool holds)
//   nephew works one small shift a day on his own (Mines.sendNephew)
const item = (x) => ({ ...x, kind: 'mine', cat: 'mine' });
export const MINE_ITEMS = [
  { id: 'mine-straw', name: 'Bendy Straw', price: 2500, emoji: '🥤', rate: 2, desc: 'Fills the bucket twice as fast. Directly violates the safety notice. Again.' },
  { id: 'mine-shopvac', name: 'Shop-Vac', price: 10000, emoji: '🌪️', rate: 10, desc: 'Fills the bucket ten times as fast. Dale says it is cheating. Dale also owns one.' },
  { id: 'mine-headlamp', name: 'Headlamp Helmet', price: 8000, emoji: '⛑️', lamp: true, desc: 'A helmet with a real flashlight taped to it. You can see down the tunnel. The tunnel can see you.' },
  { id: 'mine-rod', name: 'Dowsing Rod', price: 15000, emoji: '🪄', rod: true, desc: 'A forked stick that points down the shortest tunnel to the next pool. It knows the way. It will not say how much is there.' },
  { id: 'mine-nephew', name: 'The Foreman\'s Nephew', price: 5000, emoji: '🧒', pix: 'nephew', nephew: true, desc: 'Works one shift a day for you, on his own. He is twelve. He is not good at it. The Foreman keeps the hiring fee.' },
  { id: 'mine-permit8', name: 'Shaft 8 Permit', price: 15000, emoji: '🎫', desc: 'Laminated. Lets you ride the elevator to Shaft 8: bigger than 7 and damper, with acid payroll rates at ×4, and richer still the farther in you go. $20 a ride. The roof is not included in the warranty.' },
  { id: 'mine-permit12', name: 'Shaft 12 Permit', price: 50000, emoji: '🎟️', desc: 'Shafts 9 through 11 are not discussed. Shaft 12 goes on a long way, has very little light, and its acid pays ×8. $80 a ride.' },
  { id: 'mine-permitearl', name: 'Earl\'s Level Permit', price: 100000, emoji: '🗝️', desc: 'Nobody has met Earl. This is his level, and nobody has found the end of it. The acid down there pays ×16. $160 a ride. Wipe your feet.' },
].map(item);

/** Shafts in elevator order. `quality` is what its acid is worth next to Shaft 7's (it multiplies every pool's richness,
 *  see richAt in server/mines.js; the bucket is 100 units everywhere),
 *  `fare` is charged at clock-in and never refunded, `caveIn` is the percent chance that reaching a pool brings the
 *  roof down (the shaft's average: see Mines.start for how it grows with distance from the lift), `cells` how many cells a side its
 *  tunnels are bigger than the day's tier size, `pools` how many acid spots it has, `twin` the percent chance that the other faun is waiting at the elevator (see Mines.settle). Shaft 7 is free and safe. Every shaft digs its own tunnels each day (engine/daily-maze.js). */
export const SHAFTS = [
  { id: '7', name: 'SHAFT 7', quality: 1, fare: 0, dark: 0, cells: 2, pools: 8 },
  { id: '8', name: 'SHAFT 8', quality: 4, fare: 20, dark: 1, caveIn: 4, twin: 10, cells: 6, pools: 10, permit: 'mine-permit8' },
  { id: '12', name: 'SHAFT 12', quality: 8, fare: 80, dark: 2, caveIn: 7, twin: 20, cells: 10, pools: 12, permit: 'mine-permit12' },
  { id: 'earl', name: 'EARL\'S LEVEL', quality: 16, fare: 160, dark: 3, caveIn: 10, twin: 30, cells: 16, pools: 14, permit: 'mine-permitearl' },
];
