// Foff's Bachelor Party: the side quests you play with your thumbs (driving, dodging, rolling, balancing).
// A stage is { pad, action, hint, status(), update(dt, inp), draw(ctx, t), result }. `inp` is { x, y } from the
// d-pad (-1, 0 or 1), `held` while the action button is down, and `tap` / `point` once each when they happen.
// `env` is { rnd, sfx, calm, say('Who: text') }. A stage sets `result` to 'win' or 'lose' and stops.
import { H, W, drawGolfer } from './draw.js';
import { FRIENDS, KEETCH } from './course.js';

export const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
export const label = (ctx, text, x, y, size = 22, color = '#fff6e4', align = 'center') => { ctx.font = `${size}px VT323, monospace`; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y)); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hearts = (n) => '♥'.repeat(Math.max(0, n)) || '—';
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.ceil(Math.max(0, s)) % 60).padStart(2, '0')}`;
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const look = (id) => FRIENDS.find((f) => f.name.toLowerCase().replace(/[^a-z]/g, '').startsWith(id)).look;
const me = (ctx, x, y, hop = 0, who = KEETCH.look) => drawGolfer(ctx, Math.round(x), Math.round(y), { ...who, club: false }, hop);
const walk = (p, inp, speed, dt) => { const n = Math.hypot(inp.x, inp.y) || 1; p.x += inp.x / n * speed * dt; p.y += inp.y / n * speed * dt; return inp.x || inp.y; };
const bob = (t, moving) => (moving ? Math.abs(Math.sin(t * 11)) * 4 : 0);

// ---------- Driving: the van through San Francisco, the coast road, the race to the airport ----------
// `speed` is where the throttle starts, in pixels a second; ▲ and ▼ move it between 0.6 and 1.7 times that. With a
// `clock`, holding the starting speed for `secs` seconds is too slow by design: they have to put their foot down.
// `lives` are lost to crashes; without them a crash costs four seconds instead. `mph` is what the dial says at the start.
const DRIVES = {
  van: { secs: 38, speed: 230, lives: 3, clock: 32, mph: 25, goal: 'BATH HOUSE', ground: '#3a3f4a', side: '#6a5a4a',
    shouts: ['Bent: *cough* Left. LEFT.', 'Korn: Cuck me, go right!', 'Squanto: Dude. Straight as can be.', 'Foff: Where were you conceived?! TURN!', 'Steeze: Run over my head. Not literally.', 'Landon: Fast break! Push it!', 'Tcut: I AM CALM. TURN LEFT.', 'Mr. Joe Jack: I know the best route. The best.'],
    hits: ['Gunt: That was a rental.', 'BMehl: F***ing cable car.', 'Kashely: Whoa there.'] },
  hmb: { secs: 44, speed: 210, lives: 3, mph: 45, goal: 'HALF MOON BAY', ground: '#4a4d55', side: '#3a8a3f', curvy: true, breath: true,
    hits: ['Bent: *cough* I breathed. I breathed it.', 'Gunt: My eyes.', 'Foff: Where was THAT conceived?!'] },
  sfo: { secs: 30, speed: 330, clock: 26, mph: 65, goal: 'SFO', ground: '#4a4d55', side: '#8a8f9a',
    shouts: ['Steeze: Run over my head, we board in forty minutes.', 'Kashely: Giddyup.', 'Landon: Two-minute drill!', 'Korn: Cuck me, floor it.'],
    hits: ['Mr. Joe Jack: Terrible driver. The worst.', 'BMehl: F***ing traffic.'] },
};
export const drive = (kind) => (env) => {
  const c = DRIVES[kind], total = c.secs * c.speed, VY = 540, van = { x: 216, vx: 0 }, items = [];
  let dist = 0, speed = c.speed, time = 0, lives = c.lives, left = c.clock, spawn = 1, cool = 0, shout = 3, air = 1, gasp = 0, toot = { in: 5, warn: 0, on: 0 }, sick = 0;
  const mid = (y) => (c.curvy ? 216 + Math.sin((dist + VY - y) / 240) * 64 : 216), HALF = c.curvy ? 120 : 160; // the road's centre at a screen height
  const hit = () => { if (cool > 0) return; cool = 1.2; env.sfx.thud(); env.say(pick(env.rnd, c.hits)); if (c.lives) lives--; else left -= 4; speed = c.speed * 0.6; }; // and it knocks the speed off
  const stage = {
    pad: 'dpad', action: c.breath ? 'HOLD BREATH' : null, result: null,
    hint: c.breath ? '◄ ► steer, ▲ ▼ faster and slower. Hold your breath through the green.' : '◄ ► steer, ▲ faster, ▼ slower. This speed will not get you there in time.',
    status: () => `${Math.max(0, Math.round((total - dist) / 100))} TO GO${c.clock ? ` · ${clock(left)}` : ''}${c.lives ? ` · ${hearts(lives)}` : ''} · ${Math.round(speed / c.speed * c.mph)} MPH`,
    update(dt, inp) {
      van.vx += inp.x * 620 * dt; van.vx *= 1 - Math.min(1, 2.4 * dt); van.x += van.vx * dt;
      speed = clamp(speed - inp.y * 200 * dt, c.speed * 0.6, c.speed * 1.7); // the throttle stays where it is put
      dist += speed * dt; cool -= dt; time += dt; if (c.clock) left -= dt;
      const m = mid(VY);
      if (Math.abs(van.x - m) > HALF - 22) { van.x = clamp(van.x, m - HALF + 22, m + HALF - 22); van.vx *= -0.3; if (c.curvy) hit(); } // the kerb, or the cliff
      spawn -= dt * speed / c.speed; // the same things per block, however fast the blocks go by
      if (spawn <= 0) { // parked cars, a stopped cable car, cones: none of it moves, so none of it runs anything over
        spawn = 0.55 + env.rnd() * 0.7;
        const x = mid(-80) + (Math.floor(env.rnd() * 4) - 1.5) * (HALF / 2), roll = env.rnd(), kind = c.curvy || roll > 0.45 ? 'car' : roll < 0.2 ? 'tram' : 'cone';
        if (!items.some((it) => it.y < 90 && Math.abs(it.x - x) < 50)) items.push({ x, y: -110, kind, w: { car: 34, tram: 44, cone: 18 }[kind], h: { car: 62, tram: 110, cone: 18 }[kind], c: pick(env.rnd, ['#d83a34', '#3f8fd0', '#ffd84a', '#5cb54c', '#c8ccd4']) });
      }
      for (const it of items) { it.y += speed * dt; if (Math.abs(it.x - van.x) < (it.w + 40) / 2 && Math.abs(it.y - VY) < (it.h + 84) / 2) { it.y = 9999; hit(); } }
      while (items.length && items[0].y > H + 120) items.shift();
      if (c.shouts && (shout -= dt) <= 0) { shout = 3.5 + env.rnd() * 3; env.say(pick(env.rnd, c.shouts)); }
      if (c.breath) {
        gasp -= dt;
        const holding = inp.held && gasp <= 0;
        air = clamp(air + (holding ? -0.2 : 0.55) * dt, 0, 1);
        if (holding && air <= 0) { gasp = 1.6; env.say('Keetch: *gasp*'); }
        if (toot.on > 0) { toot.on -= dt; if (!holding && (sick += dt) > 0.9) { sick = 0; cool = 0; hit(); } }
        else if (toot.warn > 0) { if ((toot.warn -= dt) <= 0) { toot.on = 3 + env.rnd() * 2; env.sfx.sand(); } }
        else if ((toot.in -= dt) <= 0) { toot.in = 4 + env.rnd() * 4; toot.warn = 1.4; env.say(pick(env.rnd, ['Squanto: Dude. Incoming.', 'Squanto: Fun fact: that was the abalone.', 'Squanto: Sorry as can be.'])); }
      }
      if (dist >= total) stage.result = 'win'; else if ((c.clock && left <= 0) || (c.lives && lives <= 0)) stage.result = 'lose';
    },
    draw(ctx, t) {
      R(ctx, c.side, 0, 0, W, H);
      for (let y = -8; y < H; y += 8) { const m = mid(y); if (kind === 'hmb') R(ctx, '#2f7fc0', 0, y, m - HALF - 30, 8); R(ctx, c.ground, m - HALF, y, HALF * 2, 8); R(ctx, '#fff6e4', m - HALF, y, 4, 8); R(ctx, '#fff6e4', m + HALF - 4, y, 4, 8); }
      for (let y = (dist % 80) - 80; y < H; y += 80) { const m = mid(y); for (const k of [-0.5, 0, 0.5]) R(ctx, '#ffd84a', m + k * HALF - 2, y, 4, 36); }
      if (!c.curvy) for (let i = 0; i < 7; i++) { const y = ((dist * 1 + i * 130) % (H + 130)) - 130; R(ctx, ['#8a6a5a', '#7a8a9a', '#b98a54'][i % 3], i & 1 ? 0 : W - 50, y, 50, 110); R(ctx, '#ffd84a', (i & 1 ? 12 : W - 38), y + 20, 10, 12); R(ctx, '#ffd84a', (i & 1 ? 28 : W - 22), y + 60, 10, 12); }
      for (const it of items) {
        const x = it.x - it.w / 2, y = it.y - it.h / 2, tram = it.kind === 'tram';
        R(ctx, 'rgba(0,0,0,.3)', x + 4, y + 4, it.w, it.h);
        if (it.kind === 'cone') { R(ctx, '#f08a1c', x, y, 18, 18); R(ctx, '#fff6e4', x, y + 7, 18, 4); R(ctx, '#f8b060', x + 6, y + 2, 6, 4); continue; }
        R(ctx, tram ? '#8a2a24' : it.c, x, y, it.w, it.h); R(ctx, '#1b1b22', x + 4, y + 8, it.w - 8, tram ? 90 : 14); R(ctx, '#7cc4f0', x + 6, y + it.h - 20, it.w - 12, 10);
      }
      if (cool <= 0 || Math.floor(t * 12) % 2) { // the van, nose up the screen
        const x = van.x - 20, y = VY - 42 + (env.calm ? 0 : Math.round(Math.sin(t * 18)));
        R(ctx, 'rgba(0,0,0,.3)', x + 5, y + 5, 40, 84); R(ctx, '#f3f6fa', x, y, 40, 84); R(ctx, '#7cc4f0', x + 4, y + 6, 32, 14); R(ctx, '#c8ccd4', x, y + 74, 40, 10);
        for (let i = 0; i < 4; i++) { R(ctx, '#1b1b22', x + 3, y + 26 + i * 12, 8, 8); R(ctx, '#1b1b22', x + 29, y + 26 + i * 12, 8, 8); }
        if (toot.on > 0) for (let i = 0; i < 9; i++) R(ctx, 'rgba(140,200,60,.55)', x - 14 + ((i * 37 + t * 40) % 60), y - 8 + ((i * 53 + t * 25) % 96), 14, 12);
        else if (toot.warn > 0) R(ctx, 'rgba(140,200,60,.5)', x + 12, y + 60, 16, 12);
      }
      if (c.breath) { R(ctx, 'rgba(11,28,19,.72)', 10, 90, 16, 520); R(ctx, gasp > 0 ? '#e2483d' : '#7cc4f0', 12, 92 + 516 * (1 - air), 12, 516 * air); label(ctx, 'AIR', 18, 630, 18); } // how much breath is left
      if (c.clock) R(ctx, '#e2483d', W - 26, 90 + 520 * (1 - Math.min(1, time / c.clock)), 20, 4); // where the van needs to be by now
      R(ctx, 'rgba(11,28,19,.72)', W - 22, 90, 12, 520); R(ctx, '#ffd84a', W - 22, 90 + 520 * (1 - dist / total), 12, 8); // how far there is to go
    },
  };
  return stage;
};

// ---------- The Banya: fish both flip-flops out of the cold plunge while the attendant throws towels ----------
export const banya = (env) => {
  const k = { x: 216, y: 610 }, POOL = [96, 250, 240, 190], RACK = [24, 600, 90, 80], towels = [], lady = { x: 216 };
  let life = 3, cool = 0, next = 1.5, carry = -1, done = 0, time = 0, moving = false;
    const drift = (f) => { f.x = POOL[0] + POOL[2] / 2 + Math.sin(time * 0.5 + f.i * 3) * 96; f.y = POOL[1] + POOL[3] / 2 + Math.cos(time * 0.7 + f.i * 2) * 70; return f; };
  const flops = [0, 1].map((i) => drift({ i, out: false }));
  const stage = {
    pad: 'dpad', action: 'GRAB', hint: 'Reach in for a flip-flop, then walk it to the shoe rack.', result: null,
    status: () => `FLIP-FLOPS ${done} / 2 · ${hearts(life)}`,
    update(dt, inp) {
      time += dt; cool -= dt;
      const before = { ...k }; moving = walk(k, inp, 160, dt);
      k.x = clamp(k.x, 22, W - 22); k.y = clamp(k.y, 200, H - 20);
      if (k.x > POOL[0] - 10 && k.x < POOL[0] + POOL[2] + 10 && k.y > POOL[1] - 4 && k.y < POOL[1] + POOL[3] + 16) Object.assign(k, before); // too cold to wade in
      for (const f of flops) if (!f.out) drift(f);
      if (inp.tap && carry < 0) { const f = flops.find((v) => !v.out && Math.hypot(v.x - k.x, v.y - k.y) < 64); if (f) { f.out = true; carry = f.i; env.sfx.tick(); } else env.sfx.nope(); }
      if (carry >= 0 && k.x < RACK[0] + RACK[2] && k.y > RACK[1]) { carry = -1; done++; env.sfx.cup(); if (done === 2) stage.result = 'win'; else env.say('Attendant: ONE. Where is other one.'); }
      lady.x = 216 + Math.sin(time * 0.8) * 150;
      if ((next -= dt) <= 0) { next = Math.max(0.6, 1.5 - done * 0.5); const d = Math.hypot(k.x - lady.x, k.y - 170) || 1; towels.push({ x: lady.x, y: 170, vx: (k.x - lady.x) / d * 250, vy: (k.y - 170) / d * 250 }); }
      for (const w of towels) { w.x += w.vx * dt; w.y += w.vy * dt; if (cool <= 0 && Math.hypot(w.x - k.x, w.y - (k.y - 16)) < 20) { w.y = 9999; cool = 1; life--; env.sfx.thud(); env.say(pick(env.rnd, ['Attendant: NO SHOES IN PLUNGE.', 'Attendant: You are with the hairy one.', 'Keetch: That towel was wet.'])); } }
      while (towels.length && (towels[0].y > H + 20 || towels[0].y < 0)) towels.shift();
      if (life <= 0) stage.result = 'lose';
    },
    draw(ctx, t) {
      for (let y = 0; y < H; y += 36) for (let x = 0; x < W; x += 36) R(ctx, ((x + y) / 36) & 1 ? '#d8cbb0' : '#cbbd9e', x, y, 36, 36);
      R(ctx, '#8a6038', 0, 0, W, 120); for (let x = 0; x < W; x += 24) R(ctx, '#7a5230', x, 0, 2, 120);
      R(ctx, '#8a8f9a', POOL[0] - 8, POOL[1] - 8, POOL[2] + 16, POOL[3] + 16); R(ctx, '#3f8fd0', ...POOL);
      for (let i = 0; i < 8; i++) R(ctx, '#8cc8f0', POOL[0] + 10 + ((i * 53 + t * 20) % (POOL[2] - 30)), POOL[1] + 14 + (i * 41) % (POOL[3] - 24), 16, 3);
      R(ctx, '#7a5230', ...RACK); R(ctx, '#5a3a22', RACK[0] + 6, RACK[1] + 26, RACK[2] - 12, 4); R(ctx, '#5a3a22', RACK[0] + 6, RACK[1] + 54, RACK[2] - 12, 4); label(ctx, 'SHOES', RACK[0] + RACK[2] / 2, RACK[1] + 18, 18);
      for (const f of flops) { const held = carry === f.i, x = held ? k.x - 8 : f.out ? RACK[0] + 16 + f.i * 30 : f.x, y = held ? k.y - 58 : f.out ? RACK[1] + 36 : f.y; R(ctx, f.i ? '#ffd84a' : '#f08ab0', x, y, 16, 8); R(ctx, '#1b1b22', x + 7, y + 1, 2, 5); }
      me(ctx, lady.x, 176, 0, { hair: '#c8ccd4', band: '#e2483d', shirt: '#fff6e4', pants: '#8a8f9a', long: true, w: 4 });
      for (const w of towels) { R(ctx, '#1b1b22', w.x - 9, w.y - 7, 18, 14); R(ctx, '#fff6e4', w.x - 8, w.y - 6, 16, 12); R(ctx, '#7cc4f0', w.x - 8, w.y - 1, 16, 2); }
      if (cool <= 0 || Math.floor(t * 12) % 2) me(ctx, k.x, k.y, bob(t, moving));
    },
  };
  return stage;
};

// ---------- The dessert walk: a dark sidewalk, things you do not want to step on, a shop that closes ----------
export const dessert = (env) => {
  const LEN = 2100, k = { x: 216, y: LEN - 80 }, things = [];
  for (let i = 0; i < 400 && things.length < 52; i++) { const p = { x: 100 + env.rnd() * 232, y: 220 + env.rnd() * (LEN - 420) }; if (things.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 44)) things.push(p); }
  let life = 3, left = 75, cool = 0, moving = false;
  const lit = (p) => Math.hypot(p.x - k.x, p.y - k.y) < 105 || (p.x < 190 && (p.y % 420) < 110);
  const stage = {
    pad: 'dpad', action: null, hint: 'Walk to the dessert shop. Watch where you step.', result: null,
    status: () => `CLOSES IN ${clock(left)} · ${hearts(life)}`,
    update(dt, inp) {
      left -= dt; cool -= dt; moving = walk(k, inp, 135, dt);
      k.x = clamp(k.x, 92, 340); k.y = clamp(k.y, 150, LEN - 30);
      const t = things.find((p) => Math.hypot(p.x - k.x, p.y - k.y) < 13);
      if (t && cool <= 0) { t.y = -999; life--; cool = 1; env.sfx.nope(); env.say(pick(env.rnd, ['Keetch: Don\'t look down. Don\'t look down.', 'Steeze: Run over my head. Was that sharp?', 'Squanto: Dude. Fun fact: do not touch that.'])); }
      if (k.y <= 160) stage.result = 'win'; else if (life <= 0 || left <= 0) stage.result = 'lose';
    },
    draw(ctx, t) {
      const cam = clamp(k.y - 470, 0, LEN - H);
      R(ctx, '#0b0e18', 0, 0, W, H); R(ctx, '#1a1e2a', 80, 0, 272, H);
      for (let y = -(cam % 60); y < H; y += 60) R(ctx, '#11141e', 80, y, 272, 2);
      for (let y = 0; y < LEN; y += 420) { const sy = y - cam; if (sy > -140 && sy < H) { R(ctx, 'rgba(255,216,74,.10)', 80, sy, 150, 120); R(ctx, 'rgba(255,216,74,.10)', 80, sy + 20, 110, 80); R(ctx, '#3a3f4a', 70, sy + 40, 6, 80); R(ctx, '#ffd84a', 64, sy + 34, 18, 8); } }
      R(ctx, 'rgba(255,246,228,.07)', k.x - 100, k.y - cam - 100, 200, 200); R(ctx, 'rgba(255,246,228,.07)', k.x - 70, k.y - cam - 70, 140, 140);
      const sy = -cam; R(ctx, '#f08ab0', 100, sy + 40, 232, 110); R(ctx, '#fff6e4', 110, sy + 50, 212, 34); label(ctx, 'DESSERT', 216, sy + 76, 30, '#d83a8a'); R(ctx, '#ffd84a', 190, sy + 96, 52, 54);
      for (const p of things) if (lit(p)) { const y = p.y - cam; R(ctx, '#c8ccd4', p.x - 6, y, 10, 2); R(ctx, '#f08a1c', p.x + 4, y - 1, 3, 4); }
      [look('bent'), look('gunt'), look('foff')].forEach((f, i) => me(ctx, k.x - 26 + i * 26, k.y - cam + 34 + (i & 1) * 8, bob(t + i, moving), f));
      if (cool <= 0 || Math.floor(t * 12) % 2) me(ctx, k.x, k.y - cam, bob(t, moving));
    },
  };
  return stage;
};

// ---------- Carmel-by-the-Sea: every shop sends you to another shop ----------
const SHOPS = ['GALLERY', 'CANDY', 'WINE', 'FUDGE', 'HATS', 'TEA', 'CANDLES', 'INN'];
export const carmel = (env) => {
  const shops = SHOPS.map((name, i) => ({ name, x: i & 1 ? 282 : 20, y: 110 + (i >> 1) * 142, c: ['#b5532f', '#f08ab0', '#6a1c2a', '#8a6038', '#2f6fb0', '#5cb54c', '#b9a0e8', '#e3cfa8'][i] }));
  const order = shops.map((s) => s.name).sort(() => env.rnd() - 0.5).slice(0, 6), k = { x: 216, y: 650 };
  let step = 0, left = 80, inside = null, moving = false;
  const stage = {
    pad: 'dpad', action: null, hint: 'Find a bathroom. Walk up to a shop door to ask.', result: null,
    status: () => `HOLD IT ${clock(left)} · ASK AT ${order[step]}`,
    update(dt, inp) {
      left -= dt; moving = walk(k, inp, 150 + (80 - left) * 0.6, dt); // he gets quicker as it gets urgent
      k.x = clamp(k.x, 160, 272); k.y = clamp(k.y, 120, H - 20);
      const at = shops.find((s) => Math.abs(k.y - (s.y + 70)) < 24 && (s.x < 200 ? k.x < 172 : k.x > 260));
      if (at && at !== inside) {
        if (at.name !== order[step]) env.say(`${at.name}: ${pick(env.rnd, ['Customers only.', 'We don\'t have one. Nobody here does.', 'It\'s for a painting, not for you.'])}`);
        else if (++step === order.length) { env.sfx.cup(); stage.result = 'win'; }
        else { env.sfx.tick(); env.say(`${at.name}: Customers only. Try the ${order[step].toLowerCase()} place.`); }
      }
      inside = at || null;
      if (left <= 0) stage.result = 'lose';
    },
    draw(ctx, t) {
      R(ctx, '#3a8a3f', 0, 0, W, H); R(ctx, '#b0a590', 150, 80, 132, H - 80);
      for (let y = 90; y < H; y += 26) for (let x = 154; x < 280; x += 26) R(ctx, '#9f947f', x + ((y / 26) & 1) * 10, y, 2, 2);
      for (const s of shops) {
        R(ctx, 'rgba(0,0,0,.25)', s.x + 5, s.y + 5, 130, 120); R(ctx, '#e3cfa8', s.x, s.y, 130, 120); R(ctx, s.c, s.x - 4, s.y - 6, 138, 26); R(ctx, '#5a3a22', s.x < 200 ? s.x + 118 : s.x, s.y + 54, 12, 34);
        R(ctx, '#7cc4f0', s.x + (s.x < 200 ? 18 : 40), s.y + 40, 70, 44); label(ctx, s.name, s.x + 65, s.y + 13, 20, '#fff6e4');
        if (s.name === order[step]) R(ctx, '#ffd84a', s.x < 200 ? s.x + 134 : s.x - 10, s.y + 64 + Math.round(Math.sin(t * 6) * 3), 6, 6);
      }
      me(ctx, k.x, k.y, env.calm ? 0 : Math.abs(Math.sin(t * 16)) * 3);
    },
  };
  return stage;
};

// ---------- Gunt's edibles: the hallway to bed, with controls that will not hold still ----------
export const edibles = (env) => {
  const k = { x: 216, y: 640 }, FURN = [[70, 470, 90, 50], [270, 360, 110, 44], [120, 250, 70, 60], [300, 200, 60, 60]];
  let time = 0, moving = false;
  const spin = () => Math.sin(time * 0.45) * 1.5 + Math.sin(time * 1.3) * 0.4, door = () => 216 + Math.sin(time * 0.6) * 130;
  const stage = {
    pad: 'dpad', action: null, hint: 'Get Gunt to his bedroom. The arrow is which way up is.', result: null,
    status: () => `BEDTIME IN ${clock(70 - time)}`,
    update(dt, inp) {
      time += dt;
      const a = spin(), before = { ...k }, v = { x: inp.x * Math.cos(a) - inp.y * Math.sin(a), y: inp.x * Math.sin(a) + inp.y * Math.cos(a) };
      moving = walk(k, v, 120, dt);
      k.x = clamp(k.x, 40, W - 40); k.y = clamp(k.y, 150, H - 24);
      if (FURN.some(([x, y, w, h]) => k.x > x - 8 && k.x < x + w + 8 && k.y > y && k.y < y + h + 14)) Object.assign(k, before);
      if (k.y <= 152 && Math.abs(k.x - door()) < 30) { env.sfx.cup(); stage.result = 'win'; } else if (time >= 70) stage.result = 'lose';
      else if (k.y <= 152 && inp.y < 0 && Math.floor(time * 2) % 5 === 0) env.say('Gunt: That is a wall. That is a wall wearing wallpaper.');
    },
    draw(ctx, t) {
      const hue = (i) => `hsl(${(time * 40 + i * 70) % 360},45%,${32 + i * 6}%)`, sway = env.calm ? 0 : Math.sin(time * 1.7) * 6;
      R(ctx, hue(0), 0, 0, W, H);
      for (let y = 140; y < H; y += 40) R(ctx, hue(1), 30 + sway * ((y / 40) & 1 ? 1 : -1), y, W - 60, 20);
      R(ctx, hue(3), 0, 80, W, 60);
      for (const d of [-150, 0, 150]) { const x = door() + d; R(ctx, '#3a2a1c', x - 30, 74, 60, 70); R(ctx, d ? '#5a3a22' : '#8a6038', x - 26, 78, 52, 66); R(ctx, '#ffd84a', x + 14, 110, 5, 5); if (!d) label(ctx, 'BED', x, 100, 18); }
      for (const [x, y, w, h] of FURN) { R(ctx, 'rgba(0,0,0,.3)', x + 4, y + 4, w, h); R(ctx, hue(2), x, y, w, h); R(ctx, hue(4), x + 6, y + 6, w - 12, h - 12); }
      me(ctx, k.x, k.y, bob(t, moving), look('gunt'));
      const a = -spin(); ctx.save(); ctx.translate(W - 50, 190); ctx.rotate(a); R(ctx, 'rgba(11,28,19,.7)', -26, -26, 52, 52); R(ctx, '#ffd84a', -2, -18, 4, 30); R(ctx, '#ffd84a', -8, -12, 16, 4); R(ctx, '#ffd84a', -5, -16, 10, 4); ctx.restore();
    },
  };
  return stage;
};

// ---------- The bagpiper: a man in a kilt, in the living room, at dawn. Chip golf balls at him until it stops ----------
/** Michele, half as big again as everyone else: glengarry, glasses, jacket, kilt, sporran, long socks, and a set of
 *  pipes (bag under the arm, blowpipe, chanter in the hands) with `drones` of the three still standing. */
function drawPiper(ctx, x, y, hop, drones) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(1.6, 1.6);
  drawGolfer(ctx, 0, 0, { hair: '#8a8a8a', cap: '#1b1b22', shirt: '#22242c', pants: '#2f6f7f', shorts: true, long: true, tie: '#8a8f9a', club: false }, hop);
  ctx.translate(0, -Math.round(hop)); ctx.scale(0.5, 0.5); // the same half-pixels the golfer is drawn in: feet at 0, shoulders at -52, crown at -74
  const P = (c, dx, dy, w, h) => { ctx.fillStyle = c; ctx.fillRect(dx, dy, w, h); }, sh = -52, hd = -74, ink = '#1b1b22';
  P('#2f6f7f', -12, -30, 24, 20); P('#245a68', -13, -12, 26, 2);                                           // the kilt, and its tartan
  for (const dx of [-9, -3, 3, 9]) P('#1c4a5a', dx, -30, 2, 18);
  for (const dy of [-25, -18]) P('#8cc8d0', -12, dy, 24, 1);
  P('#c8ccd4', -8, -27, 16, 1); P('#e8e0d0', -4, -25, 8, 8); P(ink, -3, -21, 2, 4); P(ink, 1, -21, 2, 4);   // sporran
  P('#f3ecd2', -10, -10, 9, 7); P('#f3ecd2', 1, -10, 9, 7); P('#d83a34', -10, -10, 3, 3); P('#d83a34', 7, -10, 3, 3); // socks and flashes
  P('#d83a34', -2, hd - 9, 4, 3); P(ink, 9, hd - 1, 2, 7); P(ink, 12, hd, 2, 6);                            // the toorie and ribbons on the cap
  for (const dx of [-7, 1]) { P(ink, dx, hd + 8, 7, 1); P(ink, dx, hd + 13, 7, 1); P(ink, dx, hd + 8, 1, 6); P(ink, dx + 6, hd + 8, 1, 6); } // glasses
  P('#1c4a5a', 9, sh + 5, 14, 20); P('#2f6f7f', 10, sh + 6, 12, 18); P('#8cc8d0', 10, sh + 12, 12, 1); P('#1c4a5a', 15, sh + 6, 2, 18); // the bag
  P('#3a2a1c', 2, hd + 15, 9, 2);                                                                           // blowpipe
  P(ink, 3, sh + 16, 3, 18); P('#f3ecd2', 2, sh + 33, 5, 2); P('#f0c8a0', 1, sh + 19, 6, 3); P('#f0c8a0', 1, sh + 26, 6, 3); // chanter, and the hands on it
  for (let i = 0; i < drones; i++) { // the bass drone is the tall one
    const dx = 11 + i * 5, top = sh - (i ? 26 : 36);
    P(ink, dx, top, 3, sh + 6 - top); P('#f3ecd2', dx - 1, top - 3, 5, 3); P('#f3ecd2', dx - 1, top + 10, 5, 2); P('#f3ecd2', dx - 1, sh - 4, 5, 2);
  }
  if (drones > 1) { P('#ffd84a', 11, sh - 14, 5 * (drones - 1) + 3, 1); P('#ffd84a', 13 + 5 * (drones - 1), sh - 14, 1, 7); } // the cord between them
  ctx.restore();
}
export const piper = (env) => {
  const k = { x: 216 }, balls = [], notes = [], NEED = 5;
  let hits = 0, life = 3, time = 0, reload = 0, next = 1.2, cool = 0, flash = 0, moving = false, px = 216;
  const stage = {
    pad: 'lr', action: 'CHIP', hint: 'Move with ◄ ►. Chip balls at the bagpipes. Mind the notes.', result: null,
    status: () => `PIPES ${'▮'.repeat(NEED - hits)} · ${hearts(life)}`,
    update(dt, inp) {
      time += dt; reload -= dt; cool -= dt; flash -= dt;
      moving = !!inp.x; k.x = clamp(k.x + inp.x * 210 * dt, 30, W - 30);
      px = 216 + Math.sin(time * (0.9 + hits * 0.28)) * 160;
      if (inp.tap && reload <= 0) { reload = 0.4; balls.push({ x: k.x, y: 600 }); env.sfx.thwack(); }
      for (const b of balls) { b.y -= 440 * dt; if (Math.abs(b.x - px) < 32 && Math.abs(b.y - 170) < 46) { b.y = -99; hits++; flash = 0.3; env.sfx.wow(); env.say(hits < NEED ? pick(env.rnd, ['Michele: BWAAAAAP.', 'Michele: *a wounded drone*', 'Bent: *cough* Hit him again.']) : 'Michele: ...'); } }
      while (balls.length && balls[0].y < 60) balls.shift();
      if ((next -= dt) <= 0) { next = Math.max(0.45, 1.1 - hits * 0.13); notes.push({ x: px, y: 230, vx: (env.rnd() - 0.5) * 120 }); }
      for (const n of notes) { n.y += (190 + hits * 22) * dt; n.x += n.vx * dt; if (cool <= 0 && Math.abs(n.x - k.x) < 16 && Math.abs(n.y - 610) < 22) { n.y = 9999; cool = 1; life--; env.sfx.nope(); env.say(pick(env.rnd, ['Keetch: It\'s so loud.', 'Foff: Who let him IN?!', 'Tcut: I WAS ASLEEP.'])); } }
      while (notes.length && notes[0].y > H) notes.shift();
      if (hits >= NEED) stage.result = 'win'; else if (life <= 0) stage.result = 'lose';
    },
    draw(ctx, t) {
      R(ctx, '#e3cfa8', 0, 0, W, 240); R(ctx, '#3a2a1c', 120, 90, 192, 150); for (let i = 0; i < 4; i++) R(ctx, '#f8c080', 128 + i * 46, 98, 38, 142);
      R(ctx, '#b38c67', 0, 240, W, H - 240); for (let y = 240; y < H; y += 44) R(ctx, '#a07a58', 0, y, W, 2);
      R(ctx, '#6a1c2a', 40, 420, 352, 150); R(ctx, '#7a2a36', 52, 432, 328, 126);
      if (flash <= 0 || Math.floor(t * 20) % 2) drawPiper(ctx, px, 222, env.calm ? 0 : Math.abs(Math.sin(t * 8)) * 2, Math.ceil((NEED - hits) * 3 / NEED));
      for (const n of notes) { R(ctx, '#1b1b22', n.x - 5, n.y, 9, 7); R(ctx, '#1b1b22', n.x + 2, n.y - 14, 2, 16); R(ctx, '#1b1b22', n.x + 2, n.y - 14, 8, 3); }
      for (const b of balls) { R(ctx, '#1b1b22', b.x - 4, b.y - 4, 8, 8); R(ctx, '#ffffff', b.x - 3, b.y - 3, 6, 6); }
      if (cool <= 0 || Math.floor(t * 12) % 2) drawGolfer(ctx, Math.round(k.x), 640, KEETCH.look, bob(t, moving));
    },
  };
  return stage;
};

// ---------- The Mystery Spot: three boards where down is somewhere else, and nothing round the edge ----------
// The ball falls the way `g` says until a wall stops it; off the edge of the board and the room starts again. The
// first two holes sit against a wall the ball can come to rest on. In the third, down moves every few seconds.
const SPIN = [[-120, -120], [170, 0], [0, 170], [120, -120], [-170, 0]], TURN = 4.5;
const ROOMS = [
  { g: () => [0, -170], from: [216, 600], hole: [216, 172], walls: [[120, 380, 192, 16], [146, 146, 140, 14]], sign: 'DOWN IS UP', how: 'In here the ball falls UP.' },
  { g: () => [170, 0], from: [80, 600], hole: [360, 200], walls: [[200, 560, 16, 90], [250, 380, 16, 180], [370, 150, 16, 240]], sign: 'DOWN IS RIGHT', how: 'In here the ball falls to the RIGHT.' },
  { g: (t) => SPIN[Math.floor(t / TURN) % SPIN.length], from: [216, 560], hole: [216, 395], sign: 'DOWN IS UNDECIDED', how: 'In here down keeps moving. Watch the arrows.',
    walls: [[80, 150, 272, 14], [80, 636, 272, 14], [44, 190, 14, 420], [374, 190, 14, 420], [150, 300, 132, 14], [150, 480, 132, 14]] },
];
export const mystery = (env) => {
  let n = 0, left = 120, time = 0, falls = 0, b = { x: 0, y: 0, vx: 0, vy: 0 };
  const enter = (i) => { n = i; time = 0; const [x, y] = ROOMS[i].from; b = { x, y, vx: 0, vy: 0 }; };
  enter(0);
  const stage = {
    pad: 'dpad', action: null, result: null,
    get hint() { return `${ROOMS[n].how} Push it round the walls into the hole. Off the edge and it starts again.`; },
    status: () => `ROOM ${n + 1} / 3 · ${clock(left)}`,
    update(dt, inp) {
      left -= dt; time += dt;
      const r = ROOMS[n], g = r.g(time);
      if (g !== r.g(time - dt)) env.sfx.tick(); // down just moved
      b.vx += (g[0] + inp.x * 340) * dt; b.vy += (g[1] + inp.y * 340) * dt; b.vx *= 1 - 1.5 * dt; b.vy *= 1 - 1.5 * dt; // heavy enough to stop when you let go
      for (const ax of ['x', 'y']) {
        const v = ax === 'x' ? 'vx' : 'vy', was = b[ax]; b[ax] += b[v] * dt;
        if (r.walls.some(([x, y, w, h]) => b.x > x - 7 && b.x < x + w + 7 && b.y > y - 7 && b.y < y + h + 7)) { b[ax] = was; b[v] *= -0.45; if (Math.abs(b[v]) > 60) env.sfx.thud(); }
      }
      if (b.x < 36 || b.x > W - 36 || b.y < 142 || b.y > 658) { // over the edge
        env.sfx.nope(); enter(n);
        if (falls++ % 3 === 0) env.say(pick(env.rnd, ['Squanto: Dude. Fun fact: it fell up.', 'Keetch: A horse would not have gone over the edge.', 'Mr. Joe Jack: Rigged. The whole spot.']));
      } else if (Math.hypot(b.x - r.hole[0], b.y - r.hole[1]) < 13 && Math.hypot(b.vx, b.vy) < 260) { env.sfx.cup(); if (n === 2) stage.result = 'win'; else enter(n + 1); }
      if (left <= 0) stage.result = 'lose';
    },
    draw(ctx, t) {
      const r = ROOMS[n], g = r.g(time), soon = r.g(time + 1) !== g; // about to change: the arrows go red
      R(ctx, '#1a120c', 0, 0, W, H); R(ctx, '#2a1c12', 28, 150, W - 56, 516); R(ctx, '#b98a54', 36, 142, W - 72, 516);
      for (let y = 142; y < 658; y += 30) R(ctx, '#a07a48', 36, y + ((y / 30) & 1) * 4, W - 72, 2);
      label(ctx, r.sign, 216, 122, 26, '#ffd84a');
      for (let i = 0; i < 9; i++) { // arrows that drift the way the ball will fall
        const x = 80 + (i % 3) * 136, y = 220 + Math.floor(i / 3) * 190, s = env.calm ? 0 : (t * 40) % 24;
        for (let j = 0; j < 3; j++) R(ctx, soon ? `rgba(226,72,61,${0.4 + j * 0.2})` : `rgba(255,246,228,${0.25 + j * 0.2})`, x + Math.sign(g[0]) * (j * 12 + s) - 3 - j * 2, y + Math.sign(g[1]) * (j * 12 + s) - 3 - j * 2, 6 + j * 4, 6 + j * 4);
      }
      for (const [x, y, w, h] of r.walls) { R(ctx, 'rgba(0,0,0,.3)', x + 4, y + 4, w, h); R(ctx, '#3a2a1c', x, y, w, h); }
      R(ctx, '#1b1b22', r.hole[0] - 11, r.hole[1] - 6, 22, 12); R(ctx, '#f3ecd2', r.hole[0] - 1, r.hole[1] - 34, 2, 34); R(ctx, '#e2483d', r.hole[0] + 1, r.hole[1] - 34, 14, 9);
      R(ctx, 'rgba(0,0,0,.35)', b.x - 5, b.y + 2, 12, 5); R(ctx, '#1b1b22', b.x - 7, b.y - 7, 14, 14); R(ctx, '#ffffff', b.x - 6, b.y - 6, 12, 12); R(ctx, '#dfe3ea', b.x, b.y, 6, 6);
    },
  };
  return stage;
};

// ---------- The Sardine Factory: an abalone that will not stay on the plate ----------
export const sardine = (env) => {
  let p = 0, v = 0, tilt = 0, time = 0, bump = 3;
  const stage = {
    pad: 'lr', action: null, hint: 'Tip the plate with ◄ ► to keep the abalone on it.', result: null,
    status: () => `KEEP IT ON THE PLATE ${clock(30 - time)}`,
    update(dt, inp) {
      time += dt;
      tilt = clamp(tilt + inp.x * 2.6 * dt - tilt * 0.8 * dt, -1, 1);
      v += (tilt * 2.4 - v * 0.5) * dt; p += v * dt;
      if ((bump -= dt) <= 0) { bump = Math.max(1.3, 3.4 - time * 0.06); v += (env.rnd() < 0.5 ? -1 : 1) * (0.45 + time * 0.012); env.sfx.thud(); env.say(pick(env.rnd, ['Korn: Cuck me, was that the table?', 'Waiter: Fresh pepper?', 'Tcut: WHO BUMPED IT.', 'Squanto: Fun fact: abalone is a snail, dude.', 'Kashely: Steady, now.'])); }
      if (Math.abs(p) > 1.05) { env.sfx.splash(); stage.result = 'lose'; } else if (time >= 30) stage.result = 'win';
    },
    draw(ctx, t) {
      R(ctx, '#3a2a1c', 0, 0, W, H); R(ctx, '#fff6e4', 20, 250, W - 40, 330); for (let x = 20; x < W - 20; x += 40) R(ctx, '#e8dcc0', x, 250, 20, 330);
      R(ctx, '#ffd84a', 60, 120, 14, 60); R(ctx, '#ffd84a', 358, 120, 14, 60); R(ctx, '#f8c080', 52, 100, 30, 26); R(ctx, '#f8c080', 350, 100, 30, 26);
      ctx.save(); ctx.translate(216, 420); ctx.rotate(tilt * 0.22);
      R(ctx, 'rgba(0,0,0,.25)', -146, 14, 300, 16); R(ctx, '#c8ccd4', -150, -4, 300, 16); R(ctx, '#f3f6fa', -150, -8, 300, 10); R(ctx, '#8a8f9a', -40, 12, 80, 8);
      const x = p * 130; R(ctx, '#5a4030', x - 26, -30, 52, 22); R(ctx, '#8a6a58', x - 22, -34, 44, 8); R(ctx, '#b9a0e8', x - 16, -26, 12, 6); R(ctx, '#7cc4f0', x - 2, -24, 12, 6); R(ctx, '#f08ab0', x + 10, -26, 8, 5);
      ctx.restore();
      R(ctx, '#c8ccd4', 40, 380, 6, 120); R(ctx, '#c8ccd4', 386, 380, 6, 120); R(ctx, '#c8ccd4', 382, 380, 14, 30);
    },
  };
  return stage;
};
