// Mine gear and shaft permits. Sold in the General Store; the Acid Mines read ownership at clock-in (server/mines.js).
// Deliberately expensive: the mines are the only faucet, so everything that raises a haul is priced in weeks.
//   cap    bucket size in units (the biggest one you own counts)
//   rate   fill-speed multiplier (the fastest one you own counts)
//   lamp   see farther; deeper shafts are darker
//   rod    points the way and never leads you to a dry pool
const item = (x) => ({ ...x, kind: 'mine', cat: 'mine' });
export const MINE_ITEMS = [
  { id: 'mine-bucket2', name: 'Second Bucket', price: 15000, emoji: '🪣', cap: 200, desc: 'A second bucket. You carry two now. That is the whole invention. Holds 200.' },
  { id: 'mine-yoke', name: 'Bucket Yoke', price: 80000, emoji: '⚖️', cap: 400, desc: 'Four buckets on a stick across your shoulders. Granny had one. Granny had opinions. Holds 400.' },
  { id: 'mine-cooler', name: 'Picnic Cooler', price: 200000, emoji: '🧊', cap: 600, desc: 'Keeps acid crisp. Still smells faintly of potato salad. Holds 600.' },
  { id: 'mine-kiddiepool', name: 'Kiddie Pool on a Rope', price: 300000, emoji: '🛟', cap: 800, desc: 'Inflatable. Dinosaur print. Dragged behind you with a dignity only you can see. Holds 800.' },
  { id: 'mine-goldbucket', name: 'Golden Bucket', price: 1000000, emoji: '🏆', cap: 1000, desc: 'The same size as a normal bucket. Bigger on the inside. Payroll has stopped asking. Holds 1,000.' },
  { id: 'mine-straw', name: 'Bendy Straw', price: 10000, emoji: '🥤', rate: 2, desc: 'Fills the bucket twice as fast. Directly violates the safety notice. Again.' },
  { id: 'mine-shopvac', name: 'Shop-Vac', price: 100000, emoji: '🌪️', rate: 10, desc: 'Fills the bucket ten times as fast. Dale says it is cheating. Dale also owns one.' },
  { id: 'mine-headlamp', name: 'Headlamp Helmet', price: 25000, emoji: '⛑️', lamp: true, desc: 'A helmet with a real flashlight taped to it. You can see down the tunnel. The tunnel can see you.' },
  { id: 'mine-rod', name: 'Dowsing Rod', price: 60000, emoji: '🪄', rod: true, desc: 'A forked stick that points the way to acid and refuses, on principle, to visit a dry hole.' },
  { id: 'mine-permit8', name: 'Shaft 8 Permit', price: 40000, emoji: '🎫', desc: 'Laminated. Lets you ride the elevator to Shaft 8: same as 7, but damper, with pools four times the size.' },
  { id: 'mine-permit12', name: 'Shaft 12 Permit', price: 150000, emoji: '🎟️', desc: 'Shafts 9 through 11 are not discussed. Shaft 12 has pools eight times the size and very little light.' },
  { id: 'mine-permitearl', name: 'Earl\'s Level Permit', price: 500000, emoji: '🗝️', desc: 'Nobody has met Earl. This is his level. The pools are enormous. Wipe your feet.' },
].map(item);

/** Shafts in elevator order. `scale` multiplies every deposit, `max` is the most a bucket can bring up from there,
 *  `fare` is charged at clock-in and never refunded. Shaft 7 is free and stays exactly what it always was. */
export const SHAFTS = [
  { id: '7', name: 'SHAFT 7', scale: 1, max: 100, fare: 0, dark: 0 },
  { id: '8', name: 'SHAFT 8', scale: 4, max: 400, fare: 40, dark: 1, permit: 'mine-permit8' },
  { id: '12', name: 'SHAFT 12', scale: 8, max: 800, fare: 80, dark: 2, permit: 'mine-permit12' },
  { id: 'earl', name: 'EARL\'S LEVEL', scale: 10, max: 1000, fare: 100, dark: 3, permit: 'mine-permitearl' },
];
