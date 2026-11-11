// Foff's Bachelor Party: one match of golf, start to scorecard. The rules live in golf-sim.js and the pixels in
// draw.js; this file is the turn order, the swing meter, the camera and who says what. It owns the canvas and
// calls emit(snapshot) whenever the React HUD needs to change (never per frame).
import { KEETCH, MATCHES, OBAMA } from './course.js';
import { LINES } from './lines.js';
import { INTRO, OUTRO } from './scenes.js';
import { DONE, NOPE, QUESTS } from './quests.js';
import { BOOST, CLUBS, DT, aiStroke, angleTo, foeApply, foeSwing, applyShot, dist, lieAt, pickClub, powerFor, shoot, swingSpec, teeUp, windFor } from './golf-sim.js';
import { H, SWEET, W, WILD, camFor, drawAim, drawBall, drawGolfer, drawHole, drawMark, drawMeter, drawSwing, drawPinPointer, drawWind, paintHole, toScreen, toWorld } from './draw.js';
import { sfx } from './sfx.js';
import { makeSayer } from '../guntrad-core.js';
import { rng } from '../mines/maze.js';

const UP = 1, SWAY = 1.6;     // meter speeds: power in bars a second, the needle in half-widths a second
/** How far off line a needle position sends it: nothing inside the gold, 1 (a full miss) at WILD, a shank beyond. */
const strike = (x) => Math.sign(x) * Math.max(0, Math.abs(x) - SWEET) / (WILD - SWEET);
const OFFSET = [-14, 16, 34];   // where each golfer stands beside their ball, in pixels
const SAVE = 'bba.foff.save', SS = 2; // SS: canvas pixels per unit of the view
export const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
export const patchSave = (change) => { const s = loadSave(); change(s); try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch { /* private mode: it still counts today */ } };
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const ease = (u) => 1 - (1 - u) ** 2;

export function createGame(canvas, emit) {
  canvas.width = W * SS; canvas.height = H * SS;
  const ctx = canvas.getContext('2d');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = rng(Date.now()), g = { talk: [], turn: 0, held: 0 };
  let m, L, say, who; // the match being played, its lines, and Keetch (always index 0) plus whoever he is up against
  let raf = 0, last = performance.now(), barkTimer = 0, cardTimer = 0, restTimer = 0, dead = false;
  // Hard pixel edges only where the screen has at least two pixels for each of ours; otherwise let it smooth.
  const fit = () => { canvas.style.imageRendering = canvas.clientWidth * devicePixelRatio < canvas.width * 2 ? 'auto' : 'pixelated'; };
  fit(); window.addEventListener('resize', fit);
  const reach = () => g.spec.max * (g.armed && !g.spec.putt ? BOOST : 1); // how far a full swing goes right now
  const along = (d) => { const p = g.st[0].pos; return [p[0] + Math.sin(g.aim) * d, p[1] + Math.cos(g.aim) * d]; };
  /** The meter power that reaches the flag over flat ground, or null when this club cannot get there. */
  const ideal = () => { const p = powerFor(g.hole, g.st[0].pos, g.spec, g.hole.pin) / (reach() / g.spec.max); return p <= 1 ? p : null; };

  function push() {
    if (dead) return;
    if (g.scene != null) return emit({ screen: 'scene', talk: g.talk[0] || null });
    if (g.q) {
      const { def, stage, over } = g.q;
      return emit({ screen: over && !g.talk.length ? 'qend' : 'quest', id: def.id, title: def.title, status: g.q.status, hint: stage.hint, pad: stage.pad, action: stage.action, result: stage.result, line: g.q.line, talk: g.talk[0] || null, bark: g.bark || null });
    }
    const me = g.st[0], onGreen = me.lie === 'green', toPin = dist(me.pos, g.hole.pin);
    const far = (v) => (g.spec.putt ? `${Math.round(v * 3)} FT` : `${Math.round(v)} YD`);
    emit({
      screen: g.phase === 'card' || g.phase === 'end' ? g.phase : 'play', phase: g.phase,
      hole: g.hi + 1, par: g.hole.par, shot: me.strokes + 1, lie: me.lie,
      toPin: onGreen ? `${Math.max(1, Math.round(toPin * 3))} FT` : `${Math.round(toPin)} YD`,
      club: g.club.putt ? 'PUTTER' : g.spec.chip ? 'CHIP' : g.club.name.toUpperCase(), canClub: g.bag.length > 1,
      putt: !!g.spec.putt, ticks: [far(reach() / 2), far(reach())], inReach: ideal() != null,
      wind: { mph: Math.round(Math.hypot(...g.wind)), deg: Math.round(Math.atan2(g.wind[0], g.wind[1]) * 180 / Math.PI) },
      charge: g.charge, armed: g.armed, talk: g.talk[0] || null, bark: g.bark || null,
      card: { names: who.map((w) => w.name), pars: m.holes.map((h) => h.par), rows: g.card.map((r) => r.slice()) }, result: g.result, next: L.next,
      match: m.id, finale: !!m.finale,
    });
  }
  function talk(lines, then) {
    if (!lines.length) return then ? then() : push(); // nothing to say
    g.talk = lines.map(([name, text]) => ({ who: name, text })); g.after = then; push();
  }
  const shout = (line) => { // a one-off line in the bubble, for the side quests
    const cut = line.indexOf(': '); g.bark = { who: line.slice(0, cut), text: line.slice(cut + 2) };
    clearTimeout(barkTimer); barkTimer = setTimeout(() => { g.bark = null; push(); }, 2600); push();
  };
  const inp = { x: 0, y: 0, held: false, tap: false, point: null }; // what the side quests read
  /** Start a side quest: its speeches, then its stage until the stage says how it went. */
  function quest(id, again) {
    const def = QUESTS.find((q) => q.id === id);
    clearTimeout(barkTimer); clearTimeout(cardTimer); clearTimeout(restTimer);
    Object.assign(inp, { x: 0, y: 0, held: false, tap: false, point: null });
    Object.assign(g, { hole: null, scene: null, bark: null, q: { def, stage: def.make({ rnd, sfx, calm, say: shout }), over: false, status: '' } });
    g.q.status = g.q.stage.status();
    if (again) push(); else talk(def.intro);
  }
  function questFrame(dt, t) {
    const { stage, def } = g.q;
    if (!g.talk.length && !g.q.over) {
      stage.update(dt, inp); inp.tap = false; inp.point = null;
      const status = stage.status();
      if (status !== g.q.status) { g.q.status = status; push(); }
      if (stage.result) {
        g.q.over = true;
        if (stage.result === 'win') { sfx.win(); save((s) => { s.quests = { ...s.quests, [def.id]: true }; }); } else sfx.nope();
        const any = (list) => list[Math.floor(rnd() * list.length)], won = stage.result === 'win'; // a different thing gets said each time
        g.q.line = any(won ? DONE : NOPE);
        talk(any(won ? def.win : def.lose) || []);
      }
    }
    ctx.imageSmoothingEnabled = false; stage.draw(ctx, t);
  }
  function advance() {
    g.talk.shift();
    if (!g.talk.length) { const then = g.after; g.after = null; then?.(); }
    push();
  }
  function bark(set) {
    if (!L.barks[set]) return;
    const line = say(set), cut = line.indexOf(': ');
    g.bark = { who: line.slice(0, cut), text: line.slice(cut + 2) };
    clearTimeout(barkTimer); barkTimer = setTimeout(() => { g.bark = null; push(); }, 2800);
  }

  const save = patchSave;
  /** The opening cutscene, one picture and its narration at a time, then whatever comes `after`. */
  function story(after, i = 0, scenes = INTRO) {
    const told = () => save((s) => { s[scenes === INTRO ? 'seen' : 'ended'] = true; });
    if (i >= scenes.length) { g.scene = null; told(); return after(); }
    Object.assign(g, { scene: i, scenes, hole: null, q: null, onSkip: () => { told(); after(); } });
    talk(scenes[i].lines.map((text) => ['', text]), () => story(after, i + 1, scenes));
  }
  /** Start a match from its first tee. A retry skips the speeches; the very first visit gets the story first. */
  function begin(id, again) {
    if (id === 1 && !again && !loadSave().seen && g.scene == null) return story(() => begin(1));
    g.q = null;
    m = MATCHES.find((x) => x.id === id) || MATCHES[0]; L = LINES[m.id]; say = makeSayer(L.barks); who = [KEETCH, ...m.foes];
    clearTimeout(barkTimer); clearTimeout(cardTimer); clearTimeout(restTimer);
    Object.assign(g, { phase: 'aim', talk: [], charge: 0, armed: false, first: !!L.firstGood, result: null, bark: null, guest: false, anim: null,
      card: who.map(() => []), q: who.map(() => ({ mulligans: 3 })) });
    tee(0);
    if (!again) talk(L.intro);
  }
  function tee(i) {
    g.hi = i; g.hole = m.holes[i]; g.tex = paintHole(g.hole); g.wind = windFor(rnd, m.wind);
    g.st = who.map(() => teeUp(g.hole)); g.shown = g.st.map((s) => s.pos.slice()); g.cam = null; g.aim = 0;
    address();
  }
  function setClub(ix) {
    const me = g.st[0];
    g.ci = Math.max(0, Math.min(g.bag.length - 1, ix)); g.club = g.bag[g.ci];
    g.spec = swingSpec(g.club, me.lie, dist(me.pos, g.hole.pin));
  }
  /** Keetch stands over the ball with a club that fits the distance. Where to point it is the player's problem. */
  function address() {
    const me = g.st[0];
    g.bag = CLUBS; setClub(g.bag.indexOf(pickClub(me.lie, dist(me.pos, g.hole.pin))));
    g.phase = 'aim'; g.meter = null; push();
  }
  const target = () => along(reach());
  const canAim = () => g.phase === 'aim' && !g.talk.length;

  function swing(e) {
    const me = g.st[0], boost = g.armed, err = boost ? 0 : Math.max(-1.5, Math.min(1.5, e));
    const res = shoot(g.hole, me.pos, g.spec, { aim: g.aim, power: g.meter.power, err, wind: g.wind, boost });
    if (boost) { g.charge = 0; g.armed = false; sfx.gallop(); } else if (Math.abs(err) <= 0.2) g.charge = Math.min(1, g.charge + 1 / 3);
    if (g.spec.putt) sfx.putt(); else sfx.thwack(g.meter.power > 0.8);
    fly(0, res, g.spec, boost, () => landed(res));
  }
  function fly(ix, res, spec, glow, done) {
    const from = g.st[ix].pos.slice(), end = res.curve.at(-1), d = dist(from, res.land), quick = ix && g.fast ? 0.3 : 1;
    g.anim = { ix, from, res, end, glow, done, quick, t: 0, peak: d * 0.22, scale: Math.min(camFor(from, end).s, spec.putt ? 18 : 7),
      soft: ['sand', 'water', 'ob'].includes(lieAt(g.hole, res.land)),
      air: spec.putt ? 0 : (0.5 + d / 220) * quick, run: Math.max(0.2, (res.curve.length - 1) * DT) * quick };
    g.phase = ix ? 'foes' : 'fly'; push();
  }
  /** Through the air on a path the wind bends, then a couple of bounces, then along the ground the way the sim rolled it. */
  function ballAt(a) {
    if (a.t < a.air) {
      const u = a.t / a.air, { land, drift } = a.res;
      return { p: [0, 1].map((i) => a.from[i] + (land[i] - drift[i] - a.from[i]) * u + drift[i] * u * u), lift: Math.sin(Math.PI * u) * a.peak };
    }
    const c = a.res.curve, s = a.t - a.air, f = Math.min(c.length - 1, s / (DT * a.quick)), i = Math.min(c.length - 2, Math.floor(f));
    const hop = a.air && !a.soft && s < 0.5 ? Math.abs(Math.sin(s * 14)) * a.peak * 0.1 * (1 - s / 0.5) : 0;
    return { p: c.length > 1 ? mix(c[i], c[i + 1], f - i) : c[0], lift: hop };
  }
  function thump(a) {
    if (!a.air || (a.ix && g.fast)) return;
    const lie = lieAt(g.hole, a.res.land);
    if (lie === 'water') sfx.splash(); else if (lie === 'sand') sfx.sand(); else if (lie === 'trees' || lie === 'ob') sfx.timber(); else sfx.thud();
  }

  function landed(res) {
    const me = g.st[0], from = me.pos, offGreen = me.lie !== 'green', far = dist(from, g.hole.pin);
    applyShot(me, res);
    const wow = res.holed ? offGreen || far > 5 : !res.hazard && ((me.lie === 'fairway' && dist(from, me.pos) >= 260) || (far > 60 && dist(me.pos, g.hole.pin) <= 4));
    if (res.holed) sfx.cup(); else if (wow) sfx.wow();
    const go = () => { push(); if (me.holed) holeOut(); else restTimer = setTimeout(foes, 1500); }; // a moment to see where it finished
    if (g.first) { g.first = false; return talk(wow || me.lie === 'fairway' || me.lie === 'green' ? L.firstGood : L.firstBad, go); }
    if (res.hazard) bark('hazard'); else if (wow) bark('amazed');
    go();
  }
  /** Everyone still playing the hole takes one swing, then it is Keetch again. */
  function foes() { g.fast = false; g.queue = who.map((_, i) => i).filter((i) => i && !g.st[i].holed); nextFoe(); }
  function nextFoe() {
    const i = g.queue.shift();
    if (i == null) return address();
    const out = foeSwing(g.hole, g.st[i], who[i], rnd, g.wind, g.q[i]);
    if (!g.fast) { if (out.spec.putt) sfx.putt(); else sfx.thwack(); }
    fly(i, out.res, out.spec, false, () => {
      foeApply(g.st[i], out, g.q[i]);
      if (out.res.holed && !g.fast) sfx.cup();
      if (out.mulligan) { bark('mulligan'); g.queue.unshift(i); } // that one never happened, and he is up again
      else if ((out.res.hazard || out.mad || g.st[i].pickedUp) && !g.bark && rnd() < 0.7) bark(who[i].id);
      if (g.fast) nextFoe(); else restTimer = setTimeout(nextFoe, 600);
    });
  }
  function holeOut() {
    g.st.forEach((s, i) => { if (i) while (!s.holed) aiStroke(g.hole, s, who[i], rnd, g.wind, g.q[i]); g.card[i][g.hi] = s.strokes; }); // nobody waits for Landon
    push();
    cardTimer = setTimeout(() => { g.phase = 'card'; push(); }, 1100);
  }
  function next() {
    if (g.phase === 'end') return g.result === 'win' && !m.finale ? begin(m.id + 1) : begin(m.id, true);
    if (g.phase !== 'card') return;
    if (g.hi + 1 < m.holes.length) return tee(g.hi + 1);
    const tot = g.card.map((r) => r.reduce((a, b) => a + b, 0)), best = Math.min(...tot.slice(1));
    g.result = tot[0] < best ? 'win' : tot[0] === best ? 'tie' : 'loss';
    if (g.result === 'win') {
      sfx.win();
      save((s) => { s.best = { ...s.best, [m.id]: Math.min(tot[0], s.best?.[m.id] ?? 99) }; });
    } else sfx.nope();
    g.phase = 'end'; g.guest = g.result === 'win' && !!m.finale; talk(L[g.result]);
  }

  function tap() {
    if (g.talk.length) return advance();
    if (g.q) { inp.tap = true; return; }
    const now = performance.now();
    if (g.phase === 'aim') { g.phase = 'power'; g.meter = { t0: now, v: 0 }; sfx.tick(); push(); }
    else if (g.phase === 'power') {
      g.meter.power = Math.max(0.05, g.meter.v);
      if (g.armed) return swing(0); // the Chosen One shot does not need steering
      g.meter.t1 = now; g.meter.x = -1; g.phase = 'acc'; sfx.tick(); push();
    } else if (g.phase === 'acc') swing(strike(g.meter.x));
    else if (g.phase === 'foes') g.fast = true;
  }
  const turn = (dir) => { g.turn = dir; if (!dir) g.held = 0; };
  const nudge = (dir) => { if (canAim()) g.aim += dir * (g.spec.putt ? 0.01 : 0.03); };
  const club = (d) => { if (canAim() && g.bag.length > 1) { setClub(g.ci - d); push(); } }; // +1 is the longer club
  const giddyup = () => { if (canAim() && g.charge >= 1) { g.armed = !g.armed; push(); } };
  function point(clientX, clientY) {
    if (g.q) { const r = canvas.getBoundingClientRect(); inp.point = [(clientX - r.left) / r.width * W, (clientY - r.top) / r.height * H]; return; }
    if (!g.hole || !canAim() || !g.cam) return;
    const r = canvas.getBoundingClientRect(), p = toWorld(g.cam, (clientX - r.left) / r.width * W, (clientY - r.top) / r.height * H);
    if (dist(p, g.st[0].pos) > 1) g.aim = angleTo(g.st[0].pos, p);
  }
  const onKey = (e) => {
    if ((!g.hole && g.scene == null && !g.q) || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase(), down = e.type === 'keydown', press = k === ' ' || k === 'enter';
    if (press && e.target.closest?.('button, a')) return; // the focused button gets its own click
    if (g.q) { // side quests: arrows or WASD to move, space for the action
      const axis = { arrowleft: ['x', -1], a: ['x', -1], arrowright: ['x', 1], d: ['x', 1], arrowup: ['y', -1], w: ['y', -1], arrowdown: ['y', 1], s: ['y', 1] }[k];
      if (axis) { if (down) inp[axis[0]] = axis[1]; else if (inp[axis[0]] === axis[1]) inp[axis[0]] = 0; }
      else if (press) { inp.held = down; if (down && !e.repeat) tap(); }
      else return;
      return e.preventDefault();
    }
    if (k === 'arrowleft' || k === 'a') turn(down ? -1 : 0);
    else if (k === 'arrowright' || k === 'd') turn(down ? 1 : 0);
    else if (!down) return;
    else if (press) { if (!e.repeat) tap(); }
    else if (k === 'arrowup' || k === 'w') club(1);
    else if (k === 'arrowdown' || k === 's') club(-1);
    else if (k === 'g') giddyup();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);

  function update(dt, now) {
    const me = g.st[0], mt = g.meter;
    if (g.turn && canAim()) { // fine at first, then it swings round faster the longer it is held
      g.held += dt; g.aim += g.turn * dt * Math.min(2.5, (g.spec.putt ? 0.2 : 0.5) * Math.min(1, 0.25 + g.held * 1.5) * (1 + Math.max(0, g.held - 0.7) * 5));
    }
    if (g.phase === 'power') { const v = ((now - mt.t0) / 1000 * UP) % 2; mt.v = v > 1 ? 2 - v : v; } // up and down until it is tapped
    else if (g.phase === 'acc') { const u = ((now - mt.t1) / 1000 * SWAY) % 4; mt.x = u < 2 ? u - 1 : 3 - u; } // left to right and back until it is tapped
    const a = g.anim;
    if (a) {
      a.t += dt * (a.ix && g.fast && a.quick === 1 ? 4 : 1); // SKIP hurries the swing already in the air too
      if (!a.hit && a.t >= a.air) { a.hit = true; thump(a); }
      if (a.t >= a.air + a.run) {
        if (a.res.hazard && a.res.curve.length > 1 && !(a.ix && g.fast)) (a.res.hazard === 'water' ? sfx.splash : sfx.timber)(); // it rolled in
        g.anim = null; a.done();
      }
    }
    const k = 1 - Math.exp(-dt * 5);
    g.st.forEach((s, i) => { const p = g.shown[i]; p[0] += (s.pos[0] - p[0]) * k; p[1] += (s.pos[1] - p[1]) * k; });
    const aiming = g.phase === 'aim' || g.phase === 'power' || g.phase === 'acc';
    const want = g.anim ? { ...camFor(ballAt(g.anim).p, g.anim.end), s: g.anim.scale } : camFor(me.pos, aiming && !g.spec.putt ? target() : g.hole.pin);
    if (!g.cam || calm) g.cam = want; else for (const f of ['x', 'y', 's']) g.cam[f] += (want[f] - g.cam[f]) * k;
  }
  function draw(t) {
    const { hole, cam } = g, me = g.st[0], aiming = g.phase === 'aim' || g.phase === 'power' || g.phase === 'acc';
    drawHole(ctx, g.tex, hole, cam, t, calm);
    if (aiming) {
      drawAim(ctx, cam, me.pos, target(), t, calm);
      const far = g.meter && reach() * (g.meter.power ?? Math.max(0, g.meter.v)), off = (e) => { const a = g.aim + e * g.spec.spread; return [me.pos[0] + Math.sin(a) * far, me.pos[1] + Math.cos(a) * far]; };
      if (g.phase === 'acc') drawSwing(ctx, cam, me.pos, off(strike(g.meter.x)), [off(-1), off(1)]); else if (g.meter) drawMark(ctx, cam, along(far));
    }
    for (let i = who.length - 1; i >= 0; i--) {
      const s = g.st[i], [bx, by] = toScreen(cam, s.pos), [gx, gy] = toScreen(cam, g.shown[i]);
      if (g.anim?.ix !== i && !s.holed) drawBall(ctx, bx, by, who[i].ball, 0, !i && g.armed);
      const walking = !i && !calm && Math.hypot(gx - bx, gy - by) > 4; // Keetch bounces when he walks
      drawGolfer(ctx, gx + OFFSET[i], gy + 4, who[i].look, walking ? Math.abs(Math.sin(t * 11)) * 8 : 0);
    }
    if (g.guest) { const [x, y] = toScreen(cam, hole.pin); drawGolfer(ctx, x - 30, y + 6, OBAMA); } // he was in the neighbourhood
    if (g.anim) { const b = ballAt(g.anim), [x, y] = toScreen(cam, b.p); drawBall(ctx, x, y, who[g.anim.ix].ball, Math.min(96, b.lift * cam.s), g.anim.glow); }
    if (!calm && !(aiming && g.spec.putt)) drawWind(ctx, g.wind, t); // nothing blows a putt about
    drawPinPointer(ctx, cam, hole.pin);
    if (aiming) drawMeter(ctx, { v: g.meter?.v, power: g.meter?.power, ideal: ideal(), needle: g.phase === 'acc' ? g.meter.x : null });
  }
  function frame(now) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(SS, 0, 0, SS, 0, 0);
    if (g.scene != null) { ctx.imageSmoothingEnabled = false; g.scenes[g.scene].draw(ctx, now / 1000, calm); }
    else if (g.q) questFrame(dt, now / 1000);
    else if (g.hole) { update(dt, now); draw(now / 1000); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const api = {
    start: begin,
    menu() { clearTimeout(barkTimer); clearTimeout(cardTimer); clearTimeout(restTimer); g.hole = null; g.scene = null; g.q = null; g.talk = []; emit(null); },
    quest, again() { if (g.q) quest(g.q.def.id, true); },
    move(x, y) { inp.x = x; inp.y = y; }, hold(v) { inp.held = v; if (v) tap(); },
    story() { story(() => api.menu()); },
    ending() { story(() => api.menu(), 0, OUTRO); },
    skip() { if (g.scene != null) { g.scene = null; g.talk = []; g.onSkip(); } },
    tap, turn, nudge, club, giddyup, point, next,
    dispose() { dead = true; cancelAnimationFrame(raf); clearTimeout(barkTimer); clearTimeout(cardTimer); clearTimeout(restTimer); window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); },
  };
  return api;
}
