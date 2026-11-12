// Foff's Bachelor Party: the side quests you play with your head (packing, ordering, remembering, clapping).
// Same stage shape as stages-move.js. Lists and grids take the d-pad and the action button, or a tap on the row.
import { W, drawGolfer } from './draw.js';
import { FRIENDS, KEETCH } from './course.js';
import { R, clamp, label } from './stages-move.js';

/** A d-pad press that repeats while held, so a cursor moves a step at a time: returns [dx, dy] once per step. */
function stepper() {
  let wait = 0, last = '';
  return (dt, inp) => {
    const key = `${inp.x},${inp.y}`;
    if (key === '0,0') { last = ''; return [0, 0]; }
    if (key !== last) { last = key; wait = 0.3; return [inp.x, inp.y]; }
    if ((wait -= dt) <= 0) { wait = 0.14; return [inp.x, inp.y]; }
    return [0, 0];
  };
}
const face = (ctx, x, y, f) => drawGolfer(ctx, x, y, { ...f.look, club: false });

// ---------- The lockers: twelve men's luggage and one sasquatch's duffel into thirty squares ----------
const BAGS = [[3, 2, '#6b4a2e', 'DUFFEL'], [4, 1, '#2f6fb0', 'CLUBS'], [4, 1, '#d83a34', 'CLUBS'], [2, 2, '#3a3f4a', 'CASE'], [2, 2, '#5cb54c', 'CASE'], [2, 1, '#ffd84a', 'BAG'], [2, 1, '#b9a0e8', 'BAG']];
export const luggage = (env) => {
  const GW = 6, GH = 5, S = 56, X0 = 48, Y0 = 130, bags = BAGS.map(([w, h, c, n], i) => ({ i, w, h, c, n, at: null })), step = stepper(), cur = { x: 0, y: 0 };
  let hand = 0; // the bag being placed
  const cells = (b, x, y) => { const out = []; for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) out.push([x + i, y + j]); return out; };
  const under = (x, y) => bags.find((b) => b.at && cells(b, ...b.at).some(([i, j]) => i === x && j === y));
  const fits = (b, x, y) => cells(b, x, y).every(([i, j]) => i >= 0 && j >= 0 && i < GW && j < GH && !under(i, j));
  const nextHand = () => { hand = bags.findIndex((b) => !b.at); if (hand < 0) stage.result = 'win'; };
  function act() {
    const there = under(cur.x, cur.y), b = bags[hand];
    if (there) { there.at = null; hand = there.i; env.sfx.tick(); return; }           // take it back out
    if (!fits(b, cur.x, cur.y)) { [b.w, b.h] = [b.h, b.w]; if (!fits(b, cur.x, cur.y)) return env.sfx.nope(); } // try it the other way up
    b.at = [cur.x, cur.y]; env.sfx.thud(); nextHand();
  }
  const stage = {
    pad: 'dpad', action: 'PLACE', hint: 'Fit every bag in the lockers. A bag that will not fit turns round.', result: null,
    status: () => `BAGS LEFT ${bags.filter((b) => !b.at).length}`,
    update(dt, inp) {
      const [dx, dy] = step(dt, inp);
      cur.x = clamp(cur.x + dx, 0, GW - 1); cur.y = clamp(cur.y + dy, 0, GH - 1);
      if (inp.point) {
        const [px, py] = inp.point, x = Math.floor((px - X0) / S), y = Math.floor((py - Y0) / S);
        if (x >= 0 && y >= 0 && x < GW && y < GH) { cur.x = x; cur.y = y; act(); }
        else if (py > Y0 + GH * S + 20) { const left = bags.filter((b) => !b.at); hand = left[(left.findIndex((b) => b.i === hand) + 1) % left.length].i; env.sfx.tick(); } // next bag
      }
      if (inp.tap) act();
    },
    draw(ctx) {
      R(ctx, '#3a3f4a', 0, 0, W, 704); R(ctx, '#22242c', X0 - 10, Y0 - 10, GW * S + 20, GH * S + 20);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) R(ctx, '#5a6070', X0 + i * S + 2, Y0 + j * S + 2, S - 4, S - 4);
      for (const b of bags) if (b.at) { const [x, y] = b.at; R(ctx, '#1b1b22', X0 + x * S + 3, Y0 + y * S + 3, b.w * S - 6, b.h * S - 6); R(ctx, b.c, X0 + x * S + 6, Y0 + y * S + 6, b.w * S - 12, b.h * S - 12); label(ctx, b.n, X0 + (x + b.w / 2) * S, Y0 + (y + b.h / 2) * S + 6, 18, '#fff6e4'); }
      const b = bags[hand];
      if (b && !stage.result) { const ok = fits(b, cur.x, cur.y); R(ctx, ok ? 'rgba(255,216,74,.45)' : 'rgba(226,72,61,.4)', X0 + cur.x * S, Y0 + cur.y * S, Math.min(b.w, GW - cur.x) * S, Math.min(b.h, GH - cur.y) * S); R(ctx, '#ffd84a', X0 + cur.x * S, Y0 + cur.y * S, S, 4); R(ctx, '#ffd84a', X0 + cur.x * S, Y0 + cur.y * S, 4, S); }
      label(ctx, 'STILL ON THE BENCH', 216, Y0 + GH * S + 44, 20, '#c8ccd4');
      let x = 24;
      for (const q of bags) if (!q.at) { const y = Y0 + GH * S + 60; if (q.i === hand) R(ctx, '#ffd84a', x - 4, y - 4, q.w * 16 + 8, q.h * 16 + 8); R(ctx, q.c, x, y, q.w * 16, q.h * 16); x += q.w * 16 + 12; }
    },
  };
  return stage;
};

// ---------- Burma Love: Steeze will eat exactly one thing on this menu ----------
const DISHES = [['Tea leaf salad', 'sour', 'crunchy'], ['Samusa soup', 'spicy', 'sour'], ['Coconut noodles', 'sweet', 'garlicky'], ['Garlic noodles', 'garlicky', 'crunchy'], ['Fish chowder', 'fishy', 'sour'], ['Chili lamb', 'spicy', 'garlicky'], ['Mango chicken', 'sweet', 'spicy'], ['Fried fish', 'fishy', 'crunchy']];
export const burma = (env) => {
  const safe = Math.floor(env.rnd() * DISHES.length), hates = (tag) => !DISHES[safe].includes(tag), tried = {}, step = stepper();
  let cur = 0, sent = 0;
  function order(i) {
    if (tried[i] || stage.result) return;
    const bad = DISHES[i].slice(1).filter(hates);
    if (!bad.length) { env.sfx.cup(); env.say('Steeze: Fine. This one. Run over my head, it\'s good.'); stage.result = 'win'; return; }
    tried[i] = bad[Math.floor(env.rnd() * bad.length)]; sent++; env.sfx.nope();
    env.say(`Steeze: Too ${tried[i]}. Run over my head.`);
    if (sent >= 5) stage.result = 'lose';
  }
  const stage = {
    pad: 'dpad', action: 'ORDER', hint: 'Order until Steeze eats one. Squanto gets the rejects, and he is filling up.', result: null,
    status: () => `SQUANTO HAS EATEN ${sent} / 5`,
    update(dt, inp) {
      cur = clamp(cur + step(dt, inp)[1], 0, DISHES.length - 1);
      if (inp.point) { const i = Math.floor((inp.point[1] - 140) / 58); if (i >= 0 && i < DISHES.length) { cur = i; order(i); } }
      if (inp.tap) order(cur);
    },
    draw(ctx) {
      R(ctx, '#6a1c2a', 0, 0, W, 704); R(ctx, '#f3ecd2', 24, 90, W - 48, 530); label(ctx, 'MENU', 216, 126, 30, '#6a1c2a');
      DISHES.forEach(([name, a, b], i) => {
        const y = 140 + i * 58;
        if (i === cur) R(ctx, '#ffd84a', 30, y, W - 60, 54);
        label(ctx, name.toUpperCase(), 44, y + 24, 24, tried[i] ? '#8a8f9a' : '#16241b', 'left');
        [a, b].forEach((tag, k) => label(ctx, tag, 44 + k * 110, y + 46, 20, tried[i] === tag ? '#d83a34' : tried[i] ? '#8a8f9a' : '#6a5a4a', 'left'));
        if (tried[i]) R(ctx, '#8a8f9a', 40, y + 16, 250, 2);
      });
      face(ctx, 70, 690, FRIENDS.find((f) => f.name === 'Steeze')); face(ctx, 360, 690, FRIENDS.find((f) => f.name === 'Squanto'));
      for (let i = 0; i < sent; i++) R(ctx, '#f3f6fa', 300 - i * 22, 676, 18, 6);
    },
  };
  return stage;
};

// ---------- The bakery: six orders to carry in your head, and Korn changes his ----------
// Six things a bakery sells, each a different shape so they can be told apart at a glance.
const PASTRY = ['DONUT', 'MUFFIN', 'ECLAIR', 'COOKIE', 'DANISH', 'BAGEL'];
function pastry(ctx, i, x, y, s = 1) {
  const P = (c, dx, dy, w, h) => R(ctx, c, x + dx * s, y + dy * s, w * s, h * s), ring = (c) => { P('#1b1b22', -13, -9, 26, 18); P(c, -12, -8, 24, 16); P('#1b1b22', -4, -3, 8, 6); };
  if (i === 0) { ring('#f08ab0'); P('#fff6e4', -8, -6, 4, 2); P('#ffd84a', 4, 3, 4, 2); }
  else if (i === 1) { P('#1b1b22', -11, -13, 22, 26); P('#7a5230', -10, -12, 20, 12); P('#fff6e4', -8, 0, 16, 12); for (const dx of [-5, 0, 5]) P('#c8ccd4', dx - 1, 0, 2, 12); }
  else if (i === 2) { P('#1b1b22', -17, -7, 34, 14); P('#5a3a22', -16, -6, 32, 12); P('#fff6e4', -14, 0, 28, 3); }
  else if (i === 3) { P('#1b1b22', -11, -11, 22, 22); P('#d8a860', -10, -10, 20, 20); for (const [dx, dy] of [[-6, -5], [3, -3], [-2, 4], [5, 5]]) P('#3a2a1c', dx, dy, 3, 3); }
  else if (i === 4) { P('#1b1b22', -12, -12, 24, 24); P('#ffd84a', -11, -11, 22, 22); P('#d83a34', -5, -5, 10, 10); }
  else ring('#d8b070');
}
export const bakery = (env) => {
  const crowd = FRIENDS.filter((f) => ['Korn', 'Foff', 'Bent', 'Gunt', 'Landon', 'Tcut'].includes(f.name)).sort(() => env.rnd() - 0.5);
  const wants = crowd.map(() => Math.floor(env.rnd() * PASTRY.length)), korn = crowd.findIndex((f) => f.name === 'Korn'), step = stepper();
  const asks = crowd.map((_, i) => i).sort(() => env.rnd() - 0.5).slice(0, 4);
  if (!asks.includes(korn)) asks[0] = korn; // he is always on the test
  let time = 0, asking = false, q = 0, right = 0, cur = 0, swapped = false;
  function answer(i) {
    if (!asking || stage.result) return;
    if (i === wants[asks[q]]) { right++; env.sfx.cup(); } else { env.sfx.nope(); env.say(`${crowd[asks[q]].name}: That is not what I said.`); }
    if (++q === asks.length) stage.result = right >= 3 ? 'win' : 'lose';
  }
  const stage = {
    pad: 'lr', result: null,
    get action() { return asking ? 'THAT ONE' : 'ORDER UP'; },
    get hint() { return asking ? 'Pick what they asked for.' : 'Take as long as you like to learn who wants what. Then ORDER UP.'; },
    status: () => (asking ? `RIGHT ${right} · ${Math.min(q + 1, asks.length)} OF ${asks.length}` : swapped ? 'SIX ORDERS' : 'SIX ORDERS · KORN IS STILL DECIDING'),
    update(dt, inp) {
      time += dt;
      if (!asking && !swapped && time > 3) { swapped = true; wants[korn] = (wants[korn] + 1 + Math.floor(env.rnd() * (PASTRY.length - 1))) % PASTRY.length; env.say('Korn: Cuck me. Actually, the other one.'); }
      if (asking) cur = clamp(cur + step(dt, inp)[0], 0, PASTRY.length - 1);
      if (asking && inp.point && inp.point[1] > 430) { const i = Math.floor((inp.point[0] - 12) / 68); if (i >= 0 && i < PASTRY.length) { cur = i; answer(i); } }
      if (inp.tap) { if (asking) answer(cur); else { asking = true; env.sfx.tick(); } }
    },
    draw(ctx) {
      R(ctx, '#f8e8c8', 0, 0, W, 704); R(ctx, '#b5532f', 0, 0, W, 86); R(ctx, '#8a6038', 0, 400, W, 304); R(ctx, '#7cc4f0', 20, 420, W - 40, 150);
      if (!asking) crowd.forEach((f, i) => { const x = 72 + (i % 3) * 144, y = 230 + Math.floor(i / 3) * 150; face(ctx, x, y, f); pastry(ctx, wants[i], x, y - 70, 1.6); label(ctx, f.name.toUpperCase(), x, y + 22, 20, '#16241b'); });
      else if (q < asks.length) { const f = crowd[asks[q]]; ctx.save(); ctx.translate(216, 300); ctx.scale(3, 3); face(ctx, 0, 0, f); ctx.restore(); label(ctx, `WHAT DID ${f.name.toUpperCase()} WANT?`, 216, 350, 26, '#16241b'); }
      PASTRY.forEach((name, i) => { const x = 46 + i * 68; if (asking && i === cur) R(ctx, '#ffd84a', x - 32, 452, 64, 96); pastry(ctx, i, x, 486, 1.4); label(ctx, name, x, 536, 18, '#16241b'); });
    },
  };
  return stage;
};

// ---------- The Chinese restaurant: one lazy Susan, twelve men, a budget ----------
const FOOD = [['Orange chicken', 18, 2, ''], ['Kung pao chicken', 17, 2, 'spicy'], ['Mapo tofu', 14, 2, 'spicy veg'], ['Beef and broccoli', 19, 2, ''], ['Fried rice', 12, 3, 'veg'], ['Chow mein', 13, 3, ''], ['Peking duck', 38, 4, ''], ['Hot and sour soup', 11, 2, 'spicy'], ['Green beans', 12, 1, 'veg']];
export const chinese = (env) => {
  const on = FOOD.map(() => false), step = stepper(), sum = (k) => FOOD.reduce((s, f, i) => s + (on[i] ? f[k] : 0), 0), count = (tag) => FOOD.filter((f, i) => on[i] && f[3].includes(tag)).length;
  const rules = () => [
    [`FEEDS ${sum(2)} OF 12`, sum(2) >= 12, 'Landon: I\'m still hungry. It\'s a four-quarter game.'],
    [`$${sum(1)} OF $85`, sum(1) <= 85, 'Mr. Joe Jack: Too expensive. I know a guy. Much cheaper.'],
    [`${on.filter(Boolean).length} OF 6 DISHES`, on.filter(Boolean).length <= 6, 'Gunt: The lazy Susan is full. It has a silhouette to keep.'],
    ['SOMETHING GREEN', count('veg') >= 1, 'Gunt: One vegetable. For the look of the table.'],
    ['TWO SPICY AT MOST', count('spicy') <= 2, 'Bent: *cough* No more spicy. *cough*'],
    ['KORN\'S ORANGE CHICKEN', on[0], 'Korn: Cuck me, where\'s the orange chicken?'],
  ];
  let cur = 0;
  function press(i) {
    if (i < FOOD.length) { on[i] = !on[i]; env.sfx.tick(); return; }
    const bad = rules().find((r) => !r[1]);
    if (bad) { env.sfx.nope(); env.say(bad[2]); } else { env.sfx.cup(); stage.result = 'win'; }
  }
  const stage = {
    pad: 'dpad', action: 'PICK', hint: 'Tick dishes until every rule is gold, then send the order.', result: null,
    status: () => `$${sum(1)} · FEEDS ${sum(2)}`,
    update(dt, inp) {
      cur = clamp(cur + step(dt, inp)[1], 0, FOOD.length);
      if (inp.point) { const i = Math.floor((inp.point[1] - 96) / 40); if (i >= 0 && i <= FOOD.length) { cur = i; press(i); } }
      if (inp.tap) press(cur);
    },
    draw(ctx) {
      R(ctx, '#8a1c1c', 0, 0, W, 704); R(ctx, '#f3ecd2', 16, 86, W - 32, 414);
      FOOD.forEach(([name, cost, feeds, tags], i) => {
        const y = 96 + i * 40;
        if (i === cur) R(ctx, '#ffd84a', 20, y, W - 40, 38);
        R(ctx, '#16241b', 28, y + 8, 22, 22); R(ctx, on[i] ? '#5cb54c' : '#f3ecd2', 31, y + 11, 16, 16);
        label(ctx, name.toUpperCase(), 60, y + 26, 22, '#16241b', 'left'); label(ctx, `$${cost} · ${feeds}${tags.includes('spicy') ? ' · HOT' : ''}${tags.includes('veg') ? ' · VEG' : ''}`, W - 28, y + 26, 20, '#6a5a4a', 'right');
      });
      const y = 96 + FOOD.length * 40; R(ctx, cur === FOOD.length ? '#ffd84a' : '#16241b', 20, y, W - 40, 38); label(ctx, 'SEND THE ORDER', 216, y + 27, 24, cur === FOOD.length ? '#16241b' : '#fff6e4');
      rules().forEach(([text, ok], i) => label(ctx, `${ok ? '+' : 'x'} ${text}`, 30 + (i % 2) * 200, 540 + Math.floor(i / 2) * 34, 20, ok ? '#ffd84a' : '#f1a0a0', 'left'));
    },
  };
  return stage;
};

// ---------- Dametra Cafe: the whole restaurant is clapping and Keetch does not know the song ----------
export const dametra = (env) => {
  const beats = [];
  for (let i = 0, t = 2; i < 24; i++) { beats.push({ t, hit: null }); t += [0.6, 0.6, 0.3, 0.9][i % 4]; }
  const SPEED = 230, MARK = 110, last = beats.at(-1).t + 1.2;
  let time = 0, hits = 0, flash = 0;
  const stage = {
    pad: 'none', action: 'CLAP', hint: 'Clap as each tambourine crosses the ring.', result: null,
    status: () => `CLAPS ${hits} · NEED 16 OF 24`,
    update(dt, inp) {
      time += dt; flash -= dt;
      for (const b of beats) if (b.hit == null && time - b.t > 0.16) b.hit = false; // it went by
      if (inp.tap) { const b = beats.find((v) => v.hit == null && Math.abs(v.t - time) <= 0.16); if (b) { b.hit = true; hits++; flash = 0.12; env.sfx.cup(); } else env.sfx.nope(); }
      if (time >= last) stage.result = hits >= 16 ? 'win' : 'lose';
    },
    draw(ctx, t) {
      R(ctx, '#2f6fb0', 0, 0, W, 704); R(ctx, '#fff6e4', 0, 250, W, 220); R(ctx, '#e8dcc0', 0, 356, W, 8);
      for (let i = 0; i < 5; i++) drawGolfer(ctx, 50 + i * 82, 230, { hair: '#2a1c14', shirt: '#ffffff', pants: '#22242c', long: true, club: false }, env.calm ? 0 : Math.abs(Math.sin(t * 5.2 + i)) * 6);
      R(ctx, flash > 0 ? '#ffd84a' : '#16241b', MARK - 26, 334, 52, 52); R(ctx, '#fff6e4', MARK - 20, 340, 40, 40);
      for (const b of beats) { const x = MARK + (b.t - time) * SPEED; if (x < -30 || x > W + 30 || b.hit) continue; R(ctx, '#1b1b22', x - 15, 345, 30, 30); R(ctx, b.hit === false ? '#8a8f9a' : '#e2483d', x - 13, 347, 26, 26); R(ctx, '#ffd84a', x - 5, 355, 10, 10); }
      drawGolfer(ctx, 216, 620, { ...KEETCH.look, club: false }, flash > 0 ? 6 : 0); label(ctx, 'OPA!', 216, 540, 40, flash > 0 ? '#ffd84a' : '#fff6e4');
    },
  };
  return stage;
};
