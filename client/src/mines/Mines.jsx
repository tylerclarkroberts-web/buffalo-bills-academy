import React, { useEffect, useRef, useState } from 'react';
import { api, useSession, refreshSession } from '../api.js';
import { navigate } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { makeMaze, rng, veinChain, eggSpot, FIRST_POOL_STEPS } from './maze.js';

const EGG_MS = 10000; // v30: an egg (when the server put one in this shift) lies near the start for the first 10 s
import { MineScene, MINE_REACH } from './scene.js';
import { MineAudio } from './audio.js';
import { Stalker } from './stalker.js';
import DoomRoom from './DoomRoom.jsx';
import Foreman from './Foreman.jsx';
import './mines.css';

const LINES = [
  'FOREMAN: "THE ACID WON\'T MINE ITSELF."',
  'TIP: WALKING IS FASTER THAN NOT WALKING.',
  'SAFETY NOTICE: DO NOT DRINK THE ACID. AGAIN.',
  'YOU HAVE BEEN PROMOTED TO: MINER (LEVEL 1).',
  'GRIND REPORT: SLIGHTLY CLOSER TO A NEW HAT.',
  'IT HAS BEEN 0 DAYS SINCE A TUNNEL INCIDENT.',
  'A DISTANT VOICE: "JUST ONE MORE SHIFT."',
  'YOUR HEADLAMP IS MOSTLY WORKING.',
  'THE COMPANY STORE THANKS YOU FOR YOUR SERVICE.',
  'RUMOR: SOMEONE FOUND SKELETONS DOWN HERE. THEY GOT PAID TO FORGET.',
  'SAFETY NOTICE: IF YOU SEE SOMEONE PALE IN THE TUNNELS, WAVE. HE IS SHY.',
  'XP +1. THERE IS NO XP. KEEP DIGGING.',
  'ACHIEVEMENT LOCKED: SEEING THE SUN.',
];
const ART = {
  motherlode: String.raw`
        .    *    .
     .  /\  /\  /\   .
   *   /##\/##\/##\     *
      /############\
     /##############\
  __/################\__`,
  aliens: String.raw`
   .-"""-.        ___      ___
  /  o o  \      |o o|    |o o|
  \   ^   /      | - |    | - |
   '-----'      /|___|\  /|___|\
   /|   |\       |$$$|    |   |
  (_|___|_)      /   \    /   \
`,
  diamonds: String.raw`
      _______________
     /_______________\
      ||  <>  <> <> ||
      ||<>  <>  <>  ||
      ||  <>  <>  <>||
     _||____________||_`,
  dud: String.raw`

       ~~~~~~~~~~~~~
     ~~   m u d    ~~
       ~~~~~~~~~~~~~
`,
  normal: String.raw`
         ________
        |  ____  |
        | |~~~~| |
        | |~~~~| |
        |________|
          ACID`,
};

export default function Mines() {
  const { me, loading } = useSession();
  const [phase, setPhase] = useState('intro'); // intro | play | result
  const [shift, setShift] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [sound, setSound] = useState(false);
  const [lecture, setLecture] = useState(null); // v45: the foreman's pending rant + problem (server-held)
  const audio = useRef(null);
  if (!audio.current) audio.current = new MineAudio();

  useEffect(() => {
    document.title = 'ACID MINES · SHIFT OFFICE';
    document.body.classList.add('in-mines');
    return () => { document.body.classList.remove('in-mines'); audio.current?.dispose(); };
  }, []);
  useEffect(() => { if (me) api('GET', '/mines/foreman').then((v) => v?.pending && setLecture(v.pending)).catch(() => {}); }, [!!me]);
  async function quit() { // v45: leaving a shift with no acid ends it unpaid, and the foreman storms in
    const id = shift?.shiftId; setPhase('intro');
    try { const v = await api('POST', '/mines/quit', { shiftId: id }); if (v?.pending) setLecture(v.pending); } catch (e) { setErr(e.message); }
  }
  const toggleSound = () => { if (sound) { audio.current.stop(); setSound(false); } else if (audio.current.start()) setSound(true); };

  async function start() {
    setErr('');
    try {
      const s = await api('POST', '/mines/start');
      setShift({ ...s, localStart: Date.now() - (s.serverNow - s.startedAt) });
      setPhase('play');
    } catch (e) {
      if (e.code === 'foreman') { const v = await api('GET', '/mines/foreman').catch(() => null); if (v?.pending) { setLecture(v.pending); return; } }
      setErr(e.message);
    }
  }
  async function finish() {
    try {
      const r = await api('POST', '/mines/finish', { shiftId: shift.shiftId });
      setResult(r); setPhase('result'); refreshSession(); if (r.foreman) setLecture(r.foreman);
      return true;
    } catch (e) {
      if (e.status === 425) return false;
      setErr(e.message); setPhase('intro'); return true;
    }
  }

  return (
    <div className="mines">
      <div className="crt" aria-hidden="true" />
      <header className="m-top">
        <button className="m-link" onClick={() => (phase === 'play' && shift ? quit() : navigate('/'))}>◄ SURFACE</button>
        <span className="m-brand">ACID MINE CO.<span className="m-dim m-shaft"> · SHAFT 7</span></span>
        <span className="m-right">
          {me && <span className="m-bank">${me.bankroll.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
          <button className="m-link" onClick={toggleSound} aria-pressed={sound}>{sound ? '♪ ON' : '♪ OFF'}<span className="sr-only"> sound</span></button>
        </span>
      </header>
      {err && <div className="m-err" role="alert" onClick={() => setErr('')}>! {err}</div>}
      {phase === 'intro' && <Intro me={me} loading={loading} onStart={start} />}
      {phase === 'play' && shift && <Shift shift={shift} audio={audio.current} sound={sound} onFinish={finish} onQuit={quit} />}
      {phase === 'result' && result && <Result r={result} onAgain={start} />}
      {lecture && <Foreman key={lecture.id} pending={lecture} sound={sound} onDone={() => { setLecture(null); navigate('/'); }} />}
    </div>
  );
}

function Intro({ me, loading, onStart }) {
  // Signed out: the sign-in form takes the place of the orientation, so the page still fits one screen.
  const [signing, setSigning] = useState(false);
  if (signing && !me) {
    return (
      <main className="m-intro m-intro-signin">
        <section className="m-box">
          <h2>&gt; PAYROLL OFFICE</h2>
          <p>Sign in so payroll knows where to send your money.</p>
          <SignIn compact next="/mines" />
          <button className="m-link" onClick={() => setSigning(false)}>◄ BACK TO ORIENTATION</button>
        </section>
      </main>
    );
  }
  return (
    <main className="m-intro">
      <div className="hazard-bar" />
      <h1 className="m-title glitch" data-text="THE ACID MINES">THE ACID MINES</h1>
      <p className="m-sub">NOW HIRING · ALL SHIFTS · NO EXPERIENCE · NO QUESTIONS</p>
      <div className="m-cols">
        <section className="m-box">
          <h2>&gt; SHIFT ORIENTATION</h2>
          <ol>
            <li>Descend. Walk the tunnels. <span className="m-dim">WASD / arrows · on phones, the stick</span></li>
            <li>Follow the clicks. The closer the acid, the faster they come.</li>
            <li>Find the glowing pool. Dry? The vein moved deeper. Hold <b>MINE</b> when it's in.</li>
            <li>Get paid. Clock in again. Repeat for weeks.</li>
          </ol>
          <p className="m-dim">Shifts last at least 20 seconds. Some last a lot longer. One shift at a time. Pay goes straight into your bankroll.</p>
          {loading ? null : me ? <button className="m-btn" onClick={onStart}>[ CLOCK IN ]</button> : <div className="m-signin"><p>Sign in so payroll knows where to send your money.</p><button className="m-btn" onClick={() => setSigning(true)}>[ SIGN IN TO CLOCK IN ]</button></div>}
        </section>
        <section className="m-box">
          <h2>&gt; WHAT'S DOWN THERE</h2>
          <ul className="m-finds">
            <li><b>ACID.</b> Buckets of it. This is the job.</li>
            <li><b>MUD.</b> Some days it is just mud.</li>
            <li><b>???</b> Old-timers whisper about a motherlode, a well full of something shiny, and things that are not from here.</li>
          </ul>
          <p className="m-dim">Nobody knows the odds. Payroll will not say. Every shift pays something.</p>
        </section>
      </div>
    </main>
  );
}

const DRY_LINES = [
  'DRY. SOMEONE GOT HERE FIRST, OR NOBODY EVER DID.',
  'A CRATER AND A SMELL. THE ACID MOVED ON.',
  'THE FOREMAN SAYS THE VEIN IS "MIGRATORY." HE SAYS IT LIKE THAT.',
  'EMPTY. THE CLICKS ARE COMING FROM DEEPER IN.',
  'DRIED UP. YOUR BUCKET JUDGES YOU.',
  'NOTHING BUT DAMP ROCK. KEEP WALKING.',
];

function Shift({ shift, audio, sound, onFinish, onQuit }) {
  const canvas = useRef(null);
  const sceneRef = useRef(null);
  const [near, setNear] = useState(false);
  const [dist, setDist] = useState(99);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [line, setLine] = useState(LINES[shift.seed % LINES.length]);
  const [status, setStatus] = useState('FIND THE ACID POOL');
  const done = useRef(false);
  const cells = FIRST_POOL_STEPS[shift.cells] ? shift.cells : 7;
  const maze = useRef(makeMaze(shift.seed, cells, FIRST_POOL_STEPS[cells])).current;
  const chain = useRef(veinChain(maze, shift.seed)).current;
  const vein = useRef({ i: 0, flowing: false, asking: false, waitUntil: 0 });
  const dreadEl = useRef(null);
  const visitorHere = useRef(false);
  const [visitor, setVisitor] = useState(false);
  const [doorNear, setDoorNear] = useState(false);
  const [doom, setDoom] = useState(false);
  const doomRef = useRef(false);
  const soundWas = useRef(false);
  const [eggNear, setEggNear] = useState(false);
  const eggRef = useRef(shift.egg ? 'there' : null); // there | taking | taken | gone
  const grabEgg = useRef(null);

  const doorRef = useRef(false);
  // The door behind the start (v27). Opening it only changes this page: the music pauses, the mine stops drawing,
  // the controls go to the game. The shift clock is the server's; it keeps running and nothing here can stop it.
  const openDoor = useRef(null);
  openDoor.current = () => {
    if (doomRef.current) return;
    doomRef.current = true; setDoom(true); setHolding(false);
    const s = sceneRef.current; if (s) { s.input.f = s.input.s = s.input.t = 0; s.mining = false; s.setPaused(true); }
    soundWas.current = !!audio?.on; if (audio?.on) audio.stop();
  };
  const closeDoor = () => {
    doomRef.current = false; setDoom(false);
    sceneRef.current?.setPaused(false);
    if (soundWas.current && sound) audio?.start();
    window.focus();
  };
  useEffect(() => {
    let lastNear = false, lastD = 99;
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // At a pool: ask the server if the acid is in yet (it alone knows when). Dry: the vein moves on to the next
    // pool in the chain and this one stays behind as a crater. Seeping (or no pools left): wait here and ask again.
    const askVein = async () => {
      const v = vein.current;
      if (v.asking || v.flowing || Date.now() < v.waitUntil) return;
      v.asking = true;
      try {
        const r = await api('POST', '/mines/probe', { shiftId: shift.shiftId });
        if (r.flowing) { v.flowing = true; setStatus('FIND THE ACID POOL'); setLine('THE ACID IS IN. FILL THE BUCKET.'); return; }
        if (r.seeping || v.i >= chain.length - 1) { v.waitUntil = Date.now() + 2500; setStatus('IT\'S SEEPING IN. WAIT FOR IT.'); setLine('THE POOL IS DAMP. THE GEIGER SAYS SOON. THE GEIGER LIES.'); return; }
        v.i += 1; const p = chain[v.i];
        maze.pool = p; stalker.pool = p; sceneRef.current?.setPool(p.x, p.y);
        setStatus('DRY. THE VEIN MOVED DEEPER. FOLLOW THE CLICKS.');
        setLine(DRY_LINES[(v.i + shift.seed) % DRY_LINES.length]);
      } catch { v.waitUntil = Date.now() + 3000; } finally { v.asking = false; }
    };
    // The server decided at clock-in whether he's on shift today (shift.scare); when and where he shows is up to how you move.
    const stalker = new Stalker(maze, { armed: !!shift.scare, afterMs: shift.scare?.afterMs, rand: rng((shift.seed ^ 0x5eed) >>> 0) });
    const scene = new MineScene(canvas.current, maze, {
      onNear: (d) => {
        const at = d < MINE_REACH;
        if (at && !vein.current.flowing) askVein();
        const n = at && vein.current.flowing;
        if (n) stalker.acidFound();
        if (n !== lastNear) { lastNear = n; setNear(n); }
        if (Math.abs(d - lastD) > 0.4) { lastD = d; setDist(d); }
      },
      stalker, localStart: shift.localStart, reduceMotion: reduce,
      onDread: (level) => { dreadEl.current?.style.setProperty('--dread', level.toFixed(2)); },
      onEvent: (e) => {
        if (e === 'appear') { visitorHere.current = true; setVisitor(true); audio?.dread(true); setLine('SOMEONE ELSE IS ON SHIFT TODAY.'); }
        if (e === 'vanish') { visitorHere.current = false; setVisitor(false); audio?.dread(false); setLine('THE ACID GLOWS. HE\'S GONE.'); dreadEl.current?.style.setProperty('--dread', '0'); }
      },
    });
    sceneRef.current = scene;
    if (eggRef.current) { const spot = eggSpot(maze, shift.seed); if (spot && Date.now() - shift.localStart < EGG_MS) scene.addEgg(spot); else eggRef.current = null; }
    grabEgg.current = async () => {
      if (eggRef.current !== 'there') return;
      eggRef.current = 'taking'; setEggNear(false);
      try {
        await api('POST', '/mines/egg', { shiftId: shift.shiftId });
        eggRef.current = 'taken'; scene.removeEgg('take'); audio?.chunk();
        setLine('YOU POCKET THE EGG. IT IS WARM. IT KICKED. IT LIVES IN YOUR BARN NOW.');
      } catch { eggRef.current = 'gone'; scene.removeEgg('sink'); }
    };
    window.__acidMine = scene; // handy for debugging and automated screenshots; the server still decides everything
    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);
    const keys = new Set();
    const sync = () => {
      scene.input.f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      scene.input.s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      scene.input.t = (keys.has('arrowright') || keys.has('e') ? 1 : 0) - (keys.has('arrowleft') || keys.has('q') ? 1 : 0);
    };
    const down = (e) => { if (doomRef.current) return; const k = e.key.toLowerCase(); if (k === 'f' && doorRef.current) { openDoor.current(); return; } if (k === 'g' && eggRef.current === 'there') { grabEgg.current(); return; } if (k === ' ' || k === 'enter') { setHolding(true); e.preventDefault(); return; } if (k.startsWith('arrow')) e.preventDefault(); keys.add(k); sync(); };
    const up = (e) => { if (doomRef.current) return; const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter') { setHolding(false); return; } keys.delete(k); sync(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    // mouse / touch look: drag anywhere on the view
    let drag = null;
    const c = canvas.current;
    let tap = null;
    const pd = (e) => { drag = { x: e.clientX, y: e.clientY }; tap = { x: e.clientX, y: e.clientY }; c.setPointerCapture?.(e.pointerId); };
    const pm = (e) => { if (!drag) return; scene.yaw -= (e.clientX - drag.x) * 0.006; scene.pitch = Math.max(-0.6, Math.min(0.6, scene.pitch - (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; };
    const pu = (e) => { drag = null; if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8) { if (scene.hitsEgg(e.clientX, e.clientY)) grabEgg.current(); else if (scene.hitsDoor(e.clientX, e.clientY)) openDoor.current(); } tap = null; };
    c.addEventListener('pointerdown', pd); c.addEventListener('pointermove', pm); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu);
    const tick = setInterval(() => {
      setElapsed(Date.now() - shift.localStart);
      const dv = scene.doorView(); const n = dv.dist < 2.1 && dv.facing > 0.75;
      if (n !== doorRef.current) { doorRef.current = n; setDoorNear(n); }
      if (eggRef.current === 'there') {
        if (Date.now() - shift.localStart > EGG_MS) { eggRef.current = 'gone'; scene.removeEgg('sink'); setEggNear(false); }
        else { const ev = scene.eggView(); setEggNear(ev.dist < 1.9 && ev.facing > 0.4); }
      }
    }, 250);
    const flavor = setInterval(() => { if (!visitorHere.current) setLine(LINES[Math.floor(Math.random() * LINES.length)]); }, 6500);
    return () => {
      scene.dispose(); delete window.__acidMine; window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      clearInterval(tick); clearInterval(flavor);
      audio?.dread(false); // clocking out: the normal music comes back
    };
  }, []);

  // while he follows: a quiet heartbeat, quicker the closer he is
  useEffect(() => {
    if (!visitor || !audio) return;
    let id;
    const beat = () => {
      if (doomRef.current) { id = setTimeout(beat, 1000); return; }
      const level = parseFloat(dreadEl.current?.style.getPropertyValue('--dread') || '0.3') || 0.3;
      audio.heartbeat(level);
      id = setTimeout(beat, 60000 / (58 + 52 * level));
    };
    id = setTimeout(beat, 1200);
    return () => clearTimeout(id);
  }, [visitor, audio]);

  // geiger clicks: faster as you get closer
  useEffect(() => {
    if (!audio) return;
    const ms = Math.max(90, Math.min(1400, dist * 90));
    const id = setInterval(() => { if (!doomRef.current) audio.tick(dist < MINE_REACH ? 1.4 : 0.8); }, ms);
    return () => clearInterval(id);
  }, [dist, audio]);

  // mining: hold to fill the bucket (about 4 seconds), then wait out the shift minimum
  useEffect(() => {
    const s = sceneRef.current; if (s) s.mining = holding && near;
    if (!holding || !near || done.current) return;
    const id = setInterval(() => {
      setProgress((p) => {
        const np = Math.min(1, p + 0.025);
        if (Math.random() < 0.3) audio?.chunk();
        return np;
      });
    }, 100);
    return () => clearInterval(id);
  }, [holding, near]);
  useEffect(() => {
    if (progress < 1 || done.current) return;
    const left = shift.minMs + 400 - (Date.now() - shift.localStart);
    if (left > 0) { setStatus('BUCKET FULL. FOREMAN SAYS THE SHIFT ISN\'T OVER. KEEP SCRAPING.'); }
    const go = async () => {
      if (done.current) return;
      setStatus('WEIGHING YOUR BUCKET…');
      const ok = await onFinish();
      if (ok) done.current = true; else setTimeout(go, 800);
    };
    const id = setTimeout(go, Math.max(0, left));
    return () => clearTimeout(id);
  }, [progress >= 1]);

  const secs = Math.floor(elapsed / 1000);
  return (
    <div className="m-play">
      <canvas ref={canvas} className="m-canvas" aria-label="First-person view of the mine tunnels" />
      <div className="m-hud tl"><div>SHIFT TIME {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</div><div className="m-dim">{near && progress < 1 && status === 'FIND THE ACID POOL' ? 'ACID FOUND. FILL THE BUCKET.' : status}</div></div>
      <div className="m-hud tr"><div className={`geiger ${dist < 4 ? 'hot' : dist < 9 ? 'warm' : ''}`}>ACID {'▮'.repeat(Math.max(1, Math.min(10, Math.round(11 - dist))))}{'▯'.repeat(Math.max(0, 10 - Math.max(1, Math.min(10, Math.round(11 - dist)))))}</div><button className="m-link" onClick={onQuit}>CLOCK OUT</button></div>
      <div className="m-ticker" aria-live="polite">{line}</div>
      {near && (
        <div className="m-mine">
          <div className="m-bucket"><div style={{ width: `${progress * 100}%` }} /></div>
          <button className={`m-btn big ${holding ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); setHolding(true); }} onPointerUp={() => setHolding(false)} onPointerLeave={() => setHolding(false)} onContextMenu={(e) => e.preventDefault()}>
            {progress >= 1 ? 'BUCKET FULL' : holding ? 'MINING…' : 'HOLD TO MINE'}
          </button>
          <div className="m-dim small">or hold SPACE</div>
        </div>
      )}
      {eggNear && !doom && !near && (
        <div className="m-door-prompt" data-test="egg-prompt">
          <span className="m-dim">AN EGG. STILL WARM.</span>
          <button className="m-btn" onClick={() => grabEgg.current()} data-test="egg-take">[ PICK IT UP ]</button>
          <span className="m-dim small">or press G</span>
        </div>
      )}
      {doorNear && !doom && !near && !eggNear && (
        <div className="m-door-prompt" data-test="door-prompt">
          <span className="m-dim">A DOOR. WARM AIR UNDER IT.</span>
          <button className="m-btn" onClick={() => openDoor.current()} data-test="door-open">[ OPEN THE DOOR ]</button>
          <span className="m-dim small">or press F</span>
        </div>
      )}
      <div ref={dreadEl} className={`m-dread ${visitor ? 'on' : ''}`} aria-hidden="true" />
      {doom && <DoomRoom elapsedMs={elapsed} onExit={closeDoor} />}
      <MovePad apply={(f, t) => { const s = sceneRef.current; if (!s || doomRef.current) return; s.input.f = f; s.input.t = t; s.input.s = 0; }} />
    </div>
  );
}

/** v51: phone mine controls. Stick for walk + gentle turn; dedicated L/R buttons for a clean 90° snap so
 *  you can hold forward and tap a turn without fighting the deadzone. Curve softens diagonals. */
function MovePad({ apply }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stick = useRef({ x: 0, y: 0 });
  const turn = useRef(0); // -1 / 0 / +1 from the side buttons
  const active = useRef(false);
  const push = () => {
    let { x, y } = stick.current;
    // wider forward corridor: small sideways drift while walking doesn't yank you around
    if (Math.abs(y) > 0.35 && Math.abs(x) < 0.45) x *= 0.35;
    const f = Math.abs(y) < 0.12 ? 0 : -Math.sign(y) * Math.min(1, (Math.abs(y) - 0.12) / 0.88) ** 0.85;
    const fromStick = Math.abs(x) < 0.18 ? 0 : Math.sign(x) * Math.min(1, (Math.abs(x) - 0.18) / 0.82);
    const t = turn.current || fromStick * 0.9;
    apply(f, t);
  };
  const move = (e) => {
    if (!active.current) return;
    const r = base.current.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    stick.current = { x, y }; setKnob({ x, y }); push();
  };
  const end = () => { active.current = false; stick.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 }); push(); };
  const hold = (dir) => (e) => { e.preventDefault(); turn.current = dir; e.currentTarget.setPointerCapture?.(e.pointerId); push(); };
  const release = () => { turn.current = 0; push(); };
  return (
    <div className="m-pad" data-test="mine-pad">
      <button type="button" className="m-turn" aria-label="Turn left" data-test="mine-turn-l"
        onPointerDown={hold(-1)} onPointerUp={release} onPointerCancel={release} onPointerLeave={release}>◂</button>
      <div className="m-stick" ref={base} onPointerDown={(e) => { active.current = true; base.current.setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="Walk">
        <div className="m-knob" style={{ transform: `translate(${knob.x * 38}px, ${knob.y * 38}px)` }} />
      </div>
      <button type="button" className="m-turn" aria-label="Turn right" data-test="mine-turn-r"
        onPointerDown={hold(1)} onPointerUp={release} onPointerCancel={release} onPointerLeave={release}>▸</button>
    </div>
  );
}

function Result({ r, onAgain }) {
  const big = r.amount >= 10000;
  return (
    <main className={`m-result o-${r.outcome} ${big ? 'jackpot' : ''}`}>
      <div className="hazard-bar" />
      <p className="m-sub">SHIFT REPORT</p>
      <pre className="m-art" aria-hidden="true">{ART[r.outcome]}</pre>
      <h1 className="m-title">{r.title}</h1>
      <p className="m-story">{r.text}</p>
      <div className="m-pay">+${r.amount.toLocaleString()}</div>
      <p className="m-dim">BANKROLL NOW ${r.bankroll.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
      <div className="m-actions">
        <button className="m-btn" onClick={onAgain}>[ ANOTHER SHIFT ]</button>
        <button className="m-btn ghost" onClick={() => navigate('/')}>[ BACK TO THE CARD ROOM ]</button>
      </div>
    </main>
  );
}
