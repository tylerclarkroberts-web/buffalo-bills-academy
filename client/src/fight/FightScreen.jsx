// "Fight Guntrad": a Mortal Kombat-style side game for whoever posts the big blind. The arena is the card
// table itself, with everyone seated watching from the rail. The fight runs the same pure simulation the
// server re-runs to check it (server/engine/fight.js), so the client only ever sends its button presses.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { money } from '../util.js';
import { Bust, avatarSrc } from '../avatar/Bust.jsx';
import { useSize } from '../ui.jsx';
import * as F from '../../../server/engine/fight.js';
import { makeRenderer, genHeadImage } from './draw.js';
import { lowPower } from './fatal.js';
import * as sfx from './sfx.js';
import { guntradSays } from '../guntrad.js';
import { goreEnabled } from '../table/fx.js';
import { FATALITIES, FATALITY_NAMES, pickFatality, GAGS, GAG_NAMES } from '../../../server/engine/fatality.js';
import { GAG_MS } from './gag.js';
import { FREEZE_MS, ACT_MS, FLEX_MS } from './fatal.js';
import './fight.css';

const STEP = 1000 / F.FPS;
// v29: after a verified win, any attack inside this window (no instructions) sets off the finisher gag
const PROMPT_MS = 4000, WATCH_WAIT_MS = 9000, BANNER_MS = 1800, ATTACK = F.BTN.P | F.BTN.K | F.BTN.S;
// Arrows move. A punch · S kick · D block · F special (home row), plus the older J K L I / Z X C V / Shift Space.
export const KEYS = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'P', A: 'P', s: 'K', S: 'K', d: 'B', D: 'B', f: 'S', F: 'S', j: 'P', J: 'P', z: 'P', Z: 'P', k: 'K', K: 'K', x: 'K', X: 'K', l: 'B', L: 'B', c: 'B', C: 'B', Shift: 'B', i: 'S', I: 'S', ' ': 'S', v: 'S', V: 'S' };
const TEXT = { thrust: 'HIP CHECK!', fight: 'FIGHT!', finishhim: 'FINISH HIM!', recover: 'HE SHOOK IT OFF!', finished: 'GUNTRAD FOLDS!', ko: 'K.O.', time: 'TIME!' };

/**
 * mode 'play': the big blind's own fight (starts straight away → fight → verdict). mode 'watch': read-only replay of
 * someone else's fight as it happens. mode 'practice': the same engine with nothing on the line (no server calls),
 * opened by typing "practice fight" in the speech-bubble box. No instructions anywhere: players work him out.
 * fight: the table view's fight (status, stake). offer: {refund, stake}.
 */
export function FightScreen({ mode, code, view, offer, onClose, onView, myId }) {
  const fight = view.fight;
  const practiceRun = () => ({ id: `practice-${Date.now()}`, seed: (Math.random() * 4294967296) >>> 0, playerId: myId, gHp: F.G_HP });
  const resuming = mode === 'play' && fight?.status === 'running' && fight.playerId === myId;
  const [phase, setPhase] = useState(mode === 'play' && !resuming ? 'starting' : 'run');
  const [run, setRun] = useState(() => (mode === 'watch' || resuming ? fight : mode === 'practice' ? practiceRun() : null)); // the fight being played or watched
  const [banner, setBanner] = useState('');
  const [verdict, setVerdict] = useState(null); // server's {status, paid, stake, reason}
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);
  const [sound, setSoundState] = useState(sfx.soundOn());
  const [meterFull, setMeterFull] = useState(false);
  const [talk, setTalk] = useState(null); // Guntrad's trash talk bubble {text, n}
  const [lastWord, setLastWord] = useState('');
  const [fin, setFin] = useState(null); // the KO ending overlay: {stage: 'finish'|'act'|'fatality'|'ko', name}
  const [gagUi, setGagUi] = useState(null); // v29 finisher overlay: {stage: 'prompt'|'go'|'banner', kind, name}
  const fatRef = useRef(null); // which fatality: from the server's settle (play/watch) or picked locally (practice)
  if (mode === 'watch' && fatRef.current == null && Number.isInteger(view.fight?.fatality) && view.fight?.id === run?.id) fatRef.current = view.fight.fatality;
  const practice = mode === 'practice';
  const arenaRef = useRef(null); const size = useSize(arenaRef);
  const canvasRef = useRef(null);
  const lensRef = useRef(null); // v28: blood drops on the screen itself, over the HUD
  const hud = { p: useRef(null), g: useRef(null), t: useRef(null), m: useRef(null), c: useRef(null) };
  const maskRef = useRef(0);
  const fighterId = run?.playerId || myId;
  const fighterAvatar = view.avatars?.[fighterId];
  const fighterName = mode === 'watch' ? (run?.name || 'Player') : 'You';
  const stakeNow = offer?.stake ?? fight?.stake ?? null;
  const refund = offer?.refund ?? fight?.refund ?? view.settings.bigBlind;

  async function start() {
    setErr('');
    if (practice) { setVerdict(null); setLastWord(''); setTalk(null); setFin(null); fatRef.current = null; setRun(practiceRun()); setPhase('run'); return; }
    try {
      const v = await api('POST', `/tables/${code}/fight/start`); onView(v);
      setRun(v.fight); setPhase('run');
    } catch (e) { setErr(e.message); setPhase('failed'); }
  }
  // the offer bar's Fight button is the only step: no how-to, straight into the ring
  const startedRef = useRef(false);
  useEffect(() => { if (phase === 'starting' && !startedRef.current) { startedRef.current = true; start(); } }, [phase]);
  async function forfeit() {
    if (!run) return onClose();
    try { const v = await api('POST', `/tables/${code}/fight/forfeit`, { id: run.id }); onView(v); setVerdict(v.fight); setBanner('FORFEIT'); setPhase('over'); }
    catch (e) { setErr(e.message); }
  }

  // ---- the game loop (play or watch) ----
  useEffect(() => {
    if (phase !== 'run' || !run || !canvasRef.current) return undefined;
    const gImg = new Image(); gImg.src = '/api/dealer.png?v=guntrad';
    const src = avatarSrc(fighterId, fighterAvatar);
    let pImg; if (src) { pImg = new Image(); pImg.src = src; } else pImg = genHeadImage(fighterAvatar?.seed || fighterId);
    const gore = goreEnabled();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const R = makeRenderer(canvasRef.current, { gImg, pImg, pSeed: fighterAvatar?.seed || fighterId, gore, reduced, low: lowPower(), lens: lensRef.current });
    R.setSound(sfx.gore);
    // The KO ending runs after the result is already decided; it never touches the simulation. The verdict waits for it.
    const F2 = { on: false, t0: 0, act: 0, kind: null, stage: '', done: false, pending: null };
    const overNow = (v) => { if (!alive) return; if (v) setVerdict(v); setPhase('over'); };
    const whenDone = (v) => { if (!F2.on || F2.done) overNow(v); else F2.pending = { v }; };
    const finStage = (stage, name = '') => { if (F2.stage === stage) return; F2.stage = stage; setFin({ stage, name, kind: F2.kind || '' }); };
    const finStart = (now) => {
      F2.on = true; F2.t0 = now; setBanner(''); curBanner = ''; bannerUntil = Infinity;
      if (practice) { let prev = -1; try { prev = Number(localStorage.getItem('bba.lastFatal') ?? -1); } catch { /* */ } fatRef.current = pickFatality(run.seed, prev); try { localStorage.setItem('bba.lastFatal', String(fatRef.current)); } catch { /* */ } }
      sfx.gore('finish');
      finStage('finish');
      if (!reduced) R.finisher.start(st, now);
    };
    const finTick = (now) => {
      if (!F2.on || F2.done) return;
      const t = now - F2.t0;
      if (!F2.kind) {
        const known = Number.isInteger(fatRef.current);
        if (t < FREEZE_MS || (!known && t < FREEZE_MS + 2500)) return;
        F2.kind = !gore ? 'ko' : FATALITIES[known ? fatRef.current : pickFatality(run.seed, -1)];
        F2.act = now;
        if (reduced) { finStage(gore ? 'fatality' : 'ko', gore ? FATALITY_NAMES[F2.kind] : ''); R.goreStill(st); return; }
        R.finisher.act(F2.kind, now); finStage('act');
        return;
      }
      const ta = now - F2.act;
      const D = reduced ? 0 : ACT_MS[F2.kind];
      if (ta >= D) finStage(gore ? 'fatality' : 'ko', gore ? FATALITY_NAMES[F2.kind] : '');
      if (ta >= D + (reduced ? 1300 : FLEX_MS)) { F2.done = true; if (F2.pending) overNow(F2.pending.v); }
    };
    // v29: the player's hidden finisher (after the server has already checked and paid the win; cosmetic only)
    R.gag.setSound(sfx.gag);
    const GG = { on: false, done: false, stage: '', kind: null, v: null, t0: 0, go: 0, b: 0, prev: 0 };
    const gagStage = (stage) => { GG.stage = stage; setGagUi({ stage, kind: GG.kind, name: GAG_NAMES[GG.kind] }); };
    const gagPrompt = (idx, v, now) => {
      GG.on = true; GG.kind = GAGS[idx] || GAGS[0]; GG.v = v; GG.t0 = now; GG.prev = maskRef.current;
      setBanner(''); curBanner = ''; bannerUntil = Infinity; setTalk(null);
      sfx.gag('prompt'); gagStage('prompt');
    };
    const gagGo = (now) => {
      GG.go = now; gagStage('go'); R.gag.start(GG.kind, st, now);
      if (mode === 'play') api('POST', `/tables/${code}/fight/finish-him`, { id: run.id }).catch(() => { /* cosmetic: watchers just miss it */ });
    };
    const gagEnd = () => { GG.done = true; setGagUi(null); overNow(GG.v); };
    const gagTick = (now) => {
      if (!GG.on || GG.done) return;
      if (GG.stage === 'prompt') {
        if (mode === 'watch') {
          if (feed.finale) gagGo(now);
          else if (now - GG.t0 > WATCH_WAIT_MS || (!feed.finaleOpen && now - GG.t0 > 800)) gagEnd();
        } else {
          const m = maskRef.current;
          if (m & ATTACK & ~GG.prev) gagGo(now);
          else if (now - GG.t0 > PROMPT_MS) gagEnd();
          GG.prev = m;
        }
      } else if (GG.stage === 'go') { if (now - GG.go > (reduced ? 1800 : GAG_MS)) { GG.b = now; gagStage('banner'); sfx.gag('tada'); } }
      else if (GG.stage === 'banner' && now - GG.b > BANNER_MS) gagEnd();
    };
    const st = F.createFight(run.seed, { gHp: run.gHp || F.G_HP });
    const rec = F.recorder();
    let raf = 0, last = performance.now(), acc = 0, ended = false, alive = true, lastP = st.p.x, lastG = st.g.x;
    let lastFull = false;
    let bannerUntil = 0; let curBanner = 'ROUND 1';
    setBanner('ROUND 1');
    const say = (t, ms) => { curBanner = t; bannerUntil = ms ? performance.now() + ms : Infinity; setBanner(t); };
    // watch-mode feed
    const feed = { log: [], k: 0, mask: 0, frame: 0, done: false, finalFrames: null, status: 'running' };
    let sent = 0, busy = false;

    const updateHud = () => {
      const p = Math.max(0, st.p.hp) / F.P_HP, g = Math.max(0, st.g.hp) / st.gMax;
      if (hud.p.current) hud.p.current.style.transform = `scaleX(${p})`;
      if (hud.g.current) hud.g.current.style.transform = `scaleX(${g})`;
      if (hud.t.current) hud.t.current.textContent = st.phase === 'finish' ? '!!' : String(Math.ceil(st.clock / F.FPS));
      if (hud.m.current) hud.m.current.style.transform = `scaleX(${st.p.meter / 100})`;
      if (hud.c.current) {
        const n = st.combo.n; const lc = st.lastCombo && st.f - st.lastCombo.f < 70 ? st.lastCombo : null;
        hud.c.current.textContent = n >= 2 ? `${n} HITS` : lc ? `${lc.n} HIT COMBO` : '';
        hud.c.current.className = `fx-combo ${n >= F.COMBO_REAL ? 'hot' : ''}`;
      }
      const full = st.p.meter >= 100; if (full !== lastFull) { lastFull = full; setMeterFull(full); }
    };
    // Guntrad's trash talk: an intro line, now and then when he lands a hit, on a combo breaker, and a last word.
    let talkAt = -1e9, talkN = 0, talkTimer = 0;
    const gSay = (set, now, { keep = false, mix = 0 } = {}) => {
      const text = guntradSays(set, { maxLen: 72, mix }); talkAt = now; talkN++;
      setTalk({ text, n: talkN }); clearTimeout(talkTimer);
      if (keep) setLastWord(text); else talkTimer = setTimeout(() => alive && setTalk(null), 2800);
    };
    const onEvents = (now) => {
      if (st.ev.length) R.events(st, st.ev, now);
      for (const e of st.ev) {
        if (e.k !== 'swing' || e.who === 'g') sfx.play(e);
        if (e.k === 'ko' && st.result !== 'win') continue; // the KO ending has its own banners
        if (TEXT[e.k]) say(TEXT[e.k], e.k === 'fight' || e.k === 'recover' || e.k === 'thrust' ? 900 : 0);
        if (e.k === 'hit' && e.who === 'p' && now - talkAt > 3500 && Math.random() < 0.6) gSay('fightHit', now);
        else if (e.k === 'thrust') gSay('fightThrust', now);
        else if (e.k === 'breaker' && now - talkAt > 1500) gSay('fightBreak', now);
        else if (e.k === 'finished') gSay('fightLose', now, { keep: true });
        else if ((e.k === 'ko' || e.k === 'time') && st.result !== 'win') gSay('fightWin', now, { keep: true });
      }
      if (st.phase === 'intro' && st.f === 20) say('GUNTRAD THE PIT BOSS', 0);
      if (st.phase === 'intro' && st.f === F.RIP_AT) say('OFF THE CLOCK!', 1300);
      if (st.phase === 'intro' && st.f === F.RIP_AT + 40) gSay('fightIntro', now);
    };
    const stepOnce = (mask, now) => { if (mode === 'play') rec.push(st.f, mask); F.stepFight(st, mask); onEvents(now); window.__bbaFightF = st.f; }; // (frame counter: read-only, for the e2e driver)
    const finish = async () => {
      if (ended) return; ended = true;
      if (mode === 'watch') return;
      if (practice) {
        const v = { status: st.result === 'win' ? 'won' : 'lost', practice: true, best: st.best, hits: st.hits, gHp: Math.max(0, st.g.hp), gMax: st.gMax, reason: st.result === 'win' ? null : (st.p.hp <= 0 ? 'knocked out' : 'ran out of time') };
        if (F2.on) whenDone(v); else setTimeout(() => overNow(v), 1100);
        return;
      }
      try {
        await flush(true);
        const v = await api('POST', `/tables/${code}/fight/submit`, { id: run.id, log: rec.log, frames: st.f });
        if (Number.isInteger(v.fight?.fatality)) fatRef.current = v.fight.fatality;
        onView(v);
        if (alive && v.fight?.status === 'won' && Number.isInteger(v.fight.gag) && !v.fight.finale) { gagPrompt(v.fight.gag, v.fight, performance.now()); return; }
        whenDone(v.fight);
      } catch (e) { if (alive) { setErr(`The house could not check that fight: ${e.message}`); whenDone({ status: 'unknown' }); } }
    };
    async function flush(force) {
      if (mode !== 'play' || (busy && !force)) return;
      busy = true;
      try {
        while (sent < rec.log.length || !force) {
          const r = await api('POST', `/tables/${code}/fight/stream`, { id: run.id, from: sent, log: rec.log.slice(sent, sent + 600), frame: st.f });
          sent = r.next; if (!force) break;
        }
      } catch { /* watchers just fall behind */ } finally { busy = false; }
    }
    const streamId = mode === 'play' ? setInterval(() => { if (!ended) flush(false); }, 500) : 0;
    // watchers poll for the fighter's inputs
    let pollId = 0;
    if (mode === 'watch') {
      const poll = async () => {
        try {
          const r = await api('GET', `/tables/${code}/fight/watch?since=${feed.log.length}`);
          if (!r.fight || r.fight.id !== run.id) { feed.done = true; feed.status = 'gone'; return; }
          if (r.from === feed.log.length) feed.log.push(...r.log);
          if (Number.isInteger(r.fight.fatality)) fatRef.current = r.fight.fatality;
          feed.frame = r.frame; feed.done = r.done; feed.finalFrames = r.finalFrames; feed.status = r.fight.status;
          feed.gag = r.fight.gag; feed.finale = !!r.fight.finale; feed.finaleOpen = !!r.fight.finaleOpen;
          if (r.next > feed.log.length) poll();
        } catch { /* try again */ }
      };
      poll(); pollId = setInterval(poll, 700);
    }

    const loop = (now) => {
      acc += Math.min(250, now - last); last = now;
      let n = 0;
      if (mode !== 'watch') {
        while (acc >= STEP && n < 8 && st.phase !== 'over') { stepOnce(maskRef.current, now); acc -= STEP; n++; }
        if (acc > STEP * 8) acc = 0;
      } else {
        const target = feed.done ? (feed.finalFrames ?? feed.frame) : feed.frame - 30;
        const behind = target - st.f; const speed = behind > 240 ? 4 : behind > 90 ? 2 : 1;
        while (acc >= STEP && n < 8) {
          for (let s = 0; s < speed && st.f < target && st.phase !== 'over'; s++) {
            while (feed.k < feed.log.length && feed.log[feed.k][0] <= st.f) { feed.mask = feed.log[feed.k][1]; feed.k++; }
            stepOnce(feed.mask, now);
          }
          acc -= STEP; n++;
        }
        if (acc > STEP * 8) acc = 0;
        // (start the KO ending first, so the verdict waits for it like it does for the fighter)
        if (st.phase === 'over' && st.result !== 'win' && st.p.hp <= 0 && !F2.on) finStart(now);
        if (feed.done && (st.phase === 'over' || st.f >= target) && !ended) {
          ended = true;
          if (feed.status === 'won' && Number.isInteger(feed.gag) && (feed.finale || feed.finaleOpen)) gagPrompt(feed.gag, null, now);
          else if (F2.on) whenDone(null); else setTimeout(() => overNow(null), 900);
        }
      }
      if (bannerUntil !== Infinity && now > bannerUntil && curBanner) { curBanner = ''; setBanner(''); }
      if (st.phase === 'fight' && curBanner === 'GUNTRAD THE PIT BOSS') { curBanner = ''; setBanner(''); }
      // walking legs: the renderer just needs to know who moved this frame
      const P = { ...st.p, walking: st.p.x !== lastP && st.p.st === 'idle' }, G2 = { ...st.g, walking: st.g.x !== lastG && st.g.st === 'idle' };
      lastP = st.p.x; lastG = st.g.x;
      if (st.phase === 'over' && st.result !== 'win' && st.p.hp <= 0 && !F2.on) finStart(now);
      finTick(now); gagTick(now);
      R.draw({ ...st, p: P, g: G2 }, now);
      updateHud();
      if (mode !== 'watch' && st.phase === 'over' && !ended) finish();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; R.finisher.stop(); R.gag.stop(); cancelAnimationFrame(raf); clearInterval(streamId); clearInterval(pollId); clearTimeout(talkTimer); };
  }, [phase, run?.id]);

  // keyboard
  useEffect(() => {
    if (mode === 'watch') return undefined;
    const set = (e, on) => {
      const b = KEYS[e.key]; if (!b || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      maskRef.current = on ? maskRef.current | F.BTN[b] : maskRef.current & ~F.BTN[b];
    };
    const dn = (e) => set(e, true), up = (e) => set(e, false), blur = () => { maskRef.current = 0; };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [mode]);
  // Escape closes a watch / the how-to
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && (mode === 'watch' || phase !== 'run')) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [mode, phase]);

  // the table people see in the background: everyone seated except the fighter, along the far rail
  const spectators = view.seats.filter((s) => s && s.playerId !== fighterId);
  // the felt: in portrait you see the near end of a long table, sideways you see the whole width
  const tall = size.w > 0 && size.w < size.h;
  const geo = tall ? { l: -16, r: -16, t: 34, b: -44 } : { l: 4, r: 4, t: 40, b: -34 };
  const rx = (100 - geo.l - geo.r) / 2, cy = (geo.t + 100 - geo.b) / 2, ry = (100 - geo.b - geo.t) / 2;
  const bust = Math.round(Math.max(30, Math.min(size.h > 560 ? 92 : 66, size.h * 0.15, size.w / Math.max(4.5, spectators.length + 1.5))));
  const span = Math.acos(Math.min(1, 40 / rx));
  const a0 = 2 * Math.PI - (Math.PI - span), a1 = 2 * Math.PI - span; // the far rail, kept on screen
  const specPos = spectators.map((s, i) => {
    const n = spectators.length; const a = n === 1 ? 1.5 * Math.PI - 0.5 : a0 + ((a1 - a0) * (i + 0.5)) / n;
    return { s, left: 50 + Math.cos(a) * rx, top: cy + Math.sin(a) * ry };
  });
  const v = verdict || (mode === 'watch' && phase === 'over' ? view.fight : null);
  const result = v && v.practice ? (v.status === 'won'
    ? { cls: 'won', title: 'You beat Guntrad!', line: 'Practice: no money moved.' }
    : { cls: 'lost', title: 'Guntrad wins', line: `Practice: no money moved.${v.reason ? ` ${cap(v.reason)}.` : ''}` })
    : v && (v.status === 'won'
    ? { cls: 'won', title: mode === 'watch' ? `${run?.name} beat Guntrad!` : 'You beat Guntrad!', line: `The house covers the ${money(v.paid ?? refund)} big blind.` }
    : v.status === 'lost' ? { cls: 'lost', title: mode === 'watch' ? `Guntrad beat ${run?.name}` : 'Guntrad wins', line: `${money(v.stake ?? 0)} (5% of ${mode === 'watch' ? 'their' : 'your'} cash) ${v.into === 'house' ? 'went to the house (the hand had ended)' : 'went into the pot'}.${v.reason ? ` ${cap(v.reason)}.` : ''}` }
    : v.status === 'running' ? { cls: '', title: 'Still deciding…', line: 'The house is checking the replay.' }
    : v.status === 'cancelled' ? { cls: '', title: 'Fight called off', line: 'The table closed. No money moved.' }
    : { cls: 'lost', title: 'Fight not counted', line: 'If it is not settled, it counts as a loss when its clock runs out.' });

  return (
    <div className={`fx-screen ${mode}`} role="dialog" aria-modal="true" aria-label={mode === 'watch' ? `Watching ${run?.name} fight Guntrad` : practice ? 'Practice fight against Guntrad' : 'Fight Guntrad the Pit Boss'}>
      <canvas ref={lensRef} className="fx-lens" aria-hidden="true" />
      <div className="fx-hud">
        <div className="fx-side me">
          <div className="fx-name"><span>{fighterName}</span><b>{mode === 'watch' ? 'LIVE' : ''}</b></div>
          <div className="fx-bar"><i ref={hud.p} /></div>
          <div className={`fx-meter ${meterFull ? 'full' : ''}`} aria-hidden="true"><i ref={hud.m} /><span><Icon k="bolt" /></span></div>
        </div>
        <div className="fx-timer" ref={hud.t} aria-label="Round clock">{Math.round(F.ROUND / F.FPS)}</div>
        <div className="fx-side him">
          <div className="fx-name"><span>Guntrad</span></div>
          <div className="fx-bar big"><i ref={hud.g} /></div>
          <div className="fx-tools">
            <button className="fx-mini" onClick={() => { sfx.setSound(!sound); setSoundState(!sound); }} aria-label={sound ? 'Mute fight sounds' : 'Fight sounds on'}>{sound ? '🔊' : '🔇'}</button>
            {mode === 'watch' || phase !== 'run' ? <button className="fx-mini" onClick={onClose} aria-label="Close">✕</button>
              : practice ? <button className="fx-mini" onClick={onClose}>Quit</button>
              : sure ? <button className="fx-mini danger" onClick={forfeit}>Lose {stakeNow != null ? money(stakeNow) : '5%'}?</button>
              : <button className="fx-mini" onClick={() => { setSure(true); setTimeout(() => setSure(false), 3000); }}>Forfeit</button>}
          </div>
        </div>
      </div>

      <div className="fx-arena" ref={arenaRef}>
        <div className="felt fx-felt" style={{ left: `${geo.l}%`, right: `${geo.r}%`, top: `${geo.t}%`, bottom: `${geo.b}%` }}><span className="felt-logo">Buffalo Bill's Academy</span></div>
        {specPos.map(({ s, left, top }) => (
          <div key={s.playerId} className="fx-spec" style={{ left: `${left}%`, top: `${top}%` }}>
            <Bust id={s.playerId} avatar={view.avatars?.[s.playerId]} size={bust} title={`${s.name} is watching`} />
            <span>{s.name}</span>
          </div>
        ))}
        {view.hand && <div className="fx-pot" style={{ top: `${geo.t + 7}%` }}>Hand #{view.hand.number} · pot {money(view.hand.pot)}</div>}
        {fin && phase === 'run' && <div className={`fx-dread ${fin.stage}`} aria-hidden="true" />}
        <canvas ref={canvasRef} className="fx-canvas" aria-hidden="true" />
        {fin && phase === 'run' && (
          <div className={`fx-fin ${fin.stage}`} role="status" aria-live="assertive" data-stage={fin.stage} data-kind={fin.kind}>
            {fin.stage === 'finish' && <b>FINISH HIM</b>}
            {fin.stage === 'fatality' && <><b>FATALITY</b>{fin.name && <span>{fin.name}</span>}</>}
            {fin.stage === 'ko' && <><b>K.O.</b><span>Out cold</span></>}
          </div>
        )}
        {gagUi && phase === 'run' && gagUi.stage !== 'go' && (
          <div className={`fx-fin fx-gag ${gagUi.stage === 'prompt' ? 'finish' : 'fatality'}`} role="status" aria-live="assertive" data-gag-stage={gagUi.stage} data-gag={gagUi.kind}>
            {gagUi.stage === 'prompt' ? <><b>FINISH HIM</b><span>(for real this time)</span></> : <><b>FATALITY…?</b><span>{gagUi.name}</span></>}
          </div>
        )}
        {gagUi && phase === 'run' && gagUi.stage === 'go' && <div className="fx-gag-tag" data-gag-stage="go" data-gag={gagUi.kind} aria-hidden="true" />}
        <div className="fx-combo" ref={hud.c} aria-live="polite" />
        {talk && phase === 'run' && <div key={talk.n} className="fx-talk" role="status" aria-live="polite"><b>Guntrad:</b> {talk.text}</div>}
        {banner && phase === 'run' && <div className={`fx-banner ${banner === 'FINISH HIM!' ? 'finish' : ''} ${banner === 'GUNTRAD THE PIT BOSS' || banner === 'OFF THE CLOCK!' || banner === 'HIP CHECK!' ? 'intro' : ''}`}>{banner}</div>}

        {phase === 'failed' && (
          <div className="fx-card fx-result lost" role="alert">
            <h2 className="western">No fight</h2>
            <p>{err || 'The offer has passed.'}</p>
            <button className="btn primary" onClick={onClose}>Back to the table</button>
          </div>
        )}
        {phase === 'over' && result && (
          <div className={`fx-card fx-result ${result.cls}`} role="status">
            <h2 className="western">{result.title}</h2>
            {lastWord && <p className="fx-quote">“{lastWord}” <span>· Guntrad</span></p>}
            <p>{result.line}</p>
            {v?.best != null && v.status !== 'running' && <p className="muted small">Best combo {v.best} · {v.hits ?? 0} hits</p>}
            {err && <p className="error" role="alert">{err}</p>}
            {practice ? (
              <div className="fx-row"><button className="btn primary" onClick={start}>Again</button><button className="btn ghost" onClick={onClose}>Done</button></div>
            ) : <button className="btn primary" onClick={onClose}>Back to the table</button>}
          </div>
        )}
        {phase === 'run' && mode === 'watch' && <div className="fx-watchtag">Watching {run?.name} · read-only</div>}
        {phase === 'run' && err && <p className="error float" role="alert">{err}</p>}
      </div>

      {mode !== 'watch' && <Controls maskRef={maskRef} meterFull={meterFull} disabled={phase !== 'run'} />}
    </div>
  );
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Touch controls: an 8-way pad you can slide your thumb around, and four buttons. Mouse works too. */
function Controls({ maskRef, meterFull, disabled }) {
  const padRef = useRef(null); const padPtr = useRef(null);
  const [dir, setDir] = useState(0);
  const [held, setHeld] = useState(0);
  const DIRS = F.BTN.L | F.BTN.R | F.BTN.U | F.BTN.D;
  const setDirMask = (m) => { maskRef.current = (maskRef.current & ~DIRS) | m; setDir(m); };
  const fromPoint = (e) => {
    const r = padRef.current.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    let m = 0; if (Math.hypot(dx, dy) < 0.22) return 0;
    if (dx < -0.38) m |= F.BTN.L; if (dx > 0.38) m |= F.BTN.R; if (dy < -0.42) m |= F.BTN.U; if (dy > 0.42) m |= F.BTN.D;
    return m;
  };
  const pad = {
    onPointerDown: (e) => { e.preventDefault(); padPtr.current = e.pointerId; padRef.current.setPointerCapture?.(e.pointerId); setDirMask(fromPoint(e)); },
    onPointerMove: (e) => { if (padPtr.current === e.pointerId) setDirMask(fromPoint(e)); },
    onPointerUp: (e) => { if (padPtr.current === e.pointerId) { padPtr.current = null; setDirMask(0); } },
    onPointerCancel: () => { padPtr.current = null; setDirMask(0); },
  };
  const btn = (b) => {
    const bit = F.BTN[b];
    const off = () => { maskRef.current &= ~bit; setHeld((h) => h & ~bit); };
    return {
      onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); maskRef.current |= bit; setHeld((h) => h | bit); },
      onPointerUp: off, onPointerCancel: off, onLostPointerCapture: off, onContextMenu: (e) => e.preventDefault(),
    };
  };
  useEffect(() => () => { maskRef.current = 0; }, []);
  const on = (bit) => ((dir | held) & bit ? 'on' : '');
  return (
    <div className={`fx-controls ${disabled ? 'off' : ''}`} onContextMenu={(e) => e.preventDefault()}>
      <div className="fx-pad" ref={padRef} {...pad} role="group" aria-label="Move">
        <span className={`u ${on(F.BTN.U)}`}>▲</span><span className={`l ${on(F.BTN.L)}`}>◀</span><span className={`r ${on(F.BTN.R)}`}>▶</span><span className={`d ${on(F.BTN.D)}`}>▼</span>
      </div>
      <div className="fx-btns">
        <button className={`fx-b blk ${on(F.BTN.B)}`} {...btn('B')} aria-label="Block"><Icon k="shield" /></button>
        <button className={`fx-b sp ${meterFull ? 'ready' : ''} ${on(F.BTN.S)}`} {...btn('S')} aria-label="Special"><Icon k="bolt" /></button>
        <button className={`fx-b pun ${on(F.BTN.P)}`} {...btn('P')} aria-label="Punch"><Icon k="fist" /></button>
        <button className={`fx-b kik ${on(F.BTN.K)}`} {...btn('K')} aria-label="Kick"><Icon k="boot" /></button>
      </div>
    </div>
  );
}

/** Button icons, no words: a fist, a boot, a shield and a lightning bolt (the special meter shows the same bolt). */
const ICONS = {
  fist: 'M6 11V8a1.6 1.6 0 0 1 3.2 0v2M9.2 8.6V6.8a1.6 1.6 0 0 1 3.2 0V10M12.4 7.4a1.6 1.6 0 0 1 3.2 0V10.5M15.6 9a1.6 1.6 0 0 1 3.2 0v4.6A6.4 6.4 0 0 1 12.4 20h-1.2A6.2 6.2 0 0 1 5 13.8V12a1.8 1.8 0 0 1 3.6 0v1.4',
  boot: 'M7 3h6v9l6.2 2.4a2.6 2.6 0 0 1 1.8 2.5V19H4.5a1.5 1.5 0 0 1-1.5-1.5V16l4-2zM3 19v1.5h18V19',
  shield: 'M12 3l7.5 3v5.2c0 4.6-3.2 8.3-7.5 9.8-4.3-1.5-7.5-5.2-7.5-9.8V6z',
  bolt: 'M13.5 2.5L5 13.5h6l-1.5 8 8.5-11h-6z',
};
function Icon({ k }) {
  return <svg className={`fx-ico ${k}`} viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[k]} fill={k === 'bolt' || k === 'shield' ? 'currentColor' : 'none'} fillOpacity={k === 'shield' ? 0.35 : 1} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** For other players: a small "watch" call-out while someone at the table is fighting. */
export function useFightWatchPill(view, myId) {
  const f = view?.fight;
  const [hidden, setHidden] = useState(() => new Set());
  const live = f && f.status === 'running' && f.playerId !== myId && !hidden.has(f.id) ? f : null;
  return { live, hide: (id) => setHidden((h) => new Set([...h, id])) };
}
