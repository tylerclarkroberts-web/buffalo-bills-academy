import React, { useEffect, useRef, useState } from 'react';
import { api, useSession, refreshSession } from '../api.js';
import { navigate } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { makeMaze, rng, veinChain, eggSpot, rodHeading, geigerBars, FIRST_POOL_STEPS } from './maze.js';
import { stickTurn } from './controls.js';
import { createMiningClient, readMineReceipt, rememberMineReceipt } from './miningClient.js';

const EGG_MS = 30000; // an egg (when the server put one in this shift) lies near the start for the first 30 s
import { MineScene, MINE_REACH, TILE } from './scene.js';
import { MineAudio } from './audio.js';
import { Stalker } from './stalker.js';
import DoomRoom from './DoomRoom.jsx';
import Foreman from './Foreman.jsx';
import TiltControls from './TiltControls.jsx';
import { paidFarewell } from './paidFarewell.js';
import { SHAFTS } from '../../../server/catalog/mine.js';
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
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const exitShift = useRef(null);
  const [sound, setSound] = useState(false);
  const [lecture, setLecture] = useState(null); // server-held quiz, or a local paid-shift farewell
  const [office, setOffice] = useState(null); // gear and shaft permits (server/mines.js office)
  const [shaft, setShaft] = useState(null); // null = the deepest shaft your permits open
  const open = office?.shafts.filter((s) => s.open) || [];
  const going = open.find((s) => s.id === shaft) || open[open.length - 1] || null;
  const audio = useRef(null);
  if (!audio.current) audio.current = new MineAudio();

  useEffect(() => {
    document.title = 'ACID MINES · SHIFT OFFICE';
    document.body.classList.add('in-mines');
    return () => { document.body.classList.remove('in-mines'); audio.current?.dispose(); };
  }, []);
  useEffect(() => { if (me) api('GET', '/mines/office').then(setOffice).catch(() => {}); }, [!!me]);
  useEffect(() => { if (me) api('GET', '/mines/foreman').then((v) => v?.pending && setLecture(v.pending)).catch(() => {}); }, [!!me]);
  useEffect(() => { if (phase === 'result') rememberMineReceipt(me?.id, result?.shiftId); }, [phase, me?.id, result?.shiftId]);
  function complete(v) {
    if (v.result) {
      setResult(v.result); setPhase('result'); refreshSession();
      if (v.result.foreman) setLecture(v.result.foreman);
    } else if (Object.hasOwn(v, 'pending')) {
      setPhase('intro'); if (v.pending) setLecture(v.pending);
    }
  }
  async function quit() {
    if (leaving) return;
    setLeaving(true);
    try { complete(await api('POST', '/mines/quit', { shiftId: shift?.shiftId })); }
    catch (e) { setErr(e.message); }
    finally { setLeaving(false); }
  }
  function leave() {
    if (lecture || starting || leaving) return;
    if (phase === 'play' && shift) return exitShift.current ? exitShift.current() : quit();
    const farewell = phase === 'result' ? paidFarewell(result) : null;
    if (farewell) setLecture(farewell);
    else navigate('/');
  }
  const toggleSound = () => { if (sound) { audio.current.stop(); setSound(false); } else if (audio.current.start()) setSound(true); };

  async function start() {
    if (lecture || starting) return;
    setStarting(true);
    setErr('');
    try {
      const afterShiftId = result?.shiftId || readMineReceipt(me?.id);
      const s = await api('POST', '/mines/start', { rulesVersion: 2, ...(going ? { shaft: going.id } : {}), ...(afterShiftId ? { afterShiftId } : {}) });
      if (s.result || Object.hasOwn(s, 'pending')) { complete(s); return; }
      setShift({ ...s, localStart: Date.now() - (s.serverNow - s.startedAt) });
      setResult(null);
      setPhase('play');
      if (going?.fare) refreshSession(); // the elevator fare just left the bankroll in the header
    } catch (e) {
      if (e.code === 'foreman') { const v = await api('GET', '/mines/foreman').catch(() => null); if (v?.pending) { setLecture(v.pending); return; } }
      setErr(e.message);
    } finally { setStarting(false); }
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
    <div className={`mines${lecture ? ' has-foreman' : ''}`}>
      <div className="crt" aria-hidden="true" />
      <div inert={lecture ? '' : undefined} aria-hidden={!!lecture || undefined}>
        <header className="m-top">
          <button className="m-link" disabled={starting || leaving} onClick={leave}>◄ SURFACE</button>
          <span className="m-brand">ACID MINE CO.<span className="m-dim m-shaft"> · {(phase === 'play' && office?.shafts.find((s) => s.id === shift?.shaft) || going)?.name || 'SHAFT 7'}</span></span>
          <span className="m-right">
            {me && <span className="m-bank">${me.bankroll.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
            <button className="m-link" onClick={toggleSound} aria-pressed={sound}>{sound ? '♪ ON' : '♪ OFF'}<span className="sr-only"> sound</span></button>
          </span>
        </header>
        {err && <div className="m-err" role="alert" onClick={() => setErr('')}>! {err}</div>}
        {phase === 'intro' && <Intro me={me} loading={loading} onStart={start} starting={starting} office={office} open={open} going={going} onShaft={setShaft} />}
        {phase === 'play' && shift && <Shift key={shift.shiftId} shift={shift} audio={audio.current} sound={sound} onFinish={finish} onQuit={quit} onComplete={complete} exitShift={exitShift} onLeaving={setLeaving} />}
        {phase === 'result' && result && <Result r={result} onAgain={start} onLeave={leave} starting={starting} fare={going?.fare} />}
      </div>
      {lecture && <Foreman key={lecture.id} pending={lecture} sound={sound} onDone={() => { setLecture(null); navigate('/'); }} />}
    </div>
  );
}

/** Once a day the Foreman's nephew works a shift for whoever hired him at the General Store. */
function Nephew({ hired }) {
  const [state, setState] = useState(hired), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const send = async () => {
    setBusy(true); setErr('');
    try { setState((await api('POST', '/mines/nephew')).nephew); refreshSession(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="m-nephew">
      {state.ready ? <button className="m-btn ghost" disabled={busy} onClick={send} data-test="nephew-send">[ SEND THE NEPHEW ]</button>
        : <p className="m-dim" data-test="nephew">THE NEPHEW BROUGHT BACK ${state.today.amount}. {state.today.line}</p>}
      {state.days > 0 && <details className="m-dim" data-test="nephew-record">
        <summary>HIS RECORD · {state.days} {state.days === 1 ? 'DAY' : 'DAYS'} · ${state.total.toLocaleString('en-US')}</summary>
        <p>BEST DAY ${state.best}{state.raise ? ` · RAISE +$${state.raise} A DAY` : ''}</p>
        <p>{Object.entries(state.tally).map(([name, n]) => `${name} ${n}`).join(' · ')}</p>
      </details>}
      {err && <p role="alert">{err}</p>}
    </div>
  );
}

function Intro({ me, loading, onStart, starting, office, open, going, onShaft }) {
  const units = Math.min(office?.capacity || 100, going?.max || 100);
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
            <li>Descend. Walk the tunnels. <span className="m-dim">WASD / arrows · phones: stick to walk and steer, hold ◂/▸ to turn, drag the view to look.</span></li>
            <li>Want motion controls? Tap <b>TILT</b>, hold the phone comfortably, and use <b>Recenter</b> to reset your neutral position. <b>Use touch</b> switches back.</li>
            <li>Follow the clicks. The closer the acid, the faster they come.</li>
            <li>Hold <b>MINE</b> at a wet pool. Drain it, then follow the clicks to the next one.</li>
            <li>One bucket. {units.toLocaleString('en-US')} units. Clock out with what you've got, or fill it for automatic pay.</li>
          </ol>
          <p className="m-dim">Acid seeps in over time. Later finds tend to be fuller. Payroll weighs the bucket when you finish.</p>
          {me && open.length > 1 && <div className="m-shafts" role="group" aria-label="Which shaft">
            {open.map((s) => <button key={s.id} className={`m-btn ${s === going ? '' : 'ghost'}`} aria-pressed={s === going} onClick={() => onShaft(s.id)}>{s.name}<span className="small"> · {s.fare ? `$${s.fare} FARE` : 'FREE'}</span></button>)}
          </div>}
          <div className="m-go">
          {loading ? null : me ? <button className="m-btn" disabled={starting} onClick={onStart}>[ CLOCK IN ]</button> : <div className="m-signin"><p>Sign in so payroll knows where to send your money.</p><button className="m-btn" onClick={() => setSigning(true)}>[ SIGN IN TO CLOCK IN ]</button></div>}
          {me && office?.nephew && <Nephew hired={office.nephew} />}
          </div>
        </section>
        <section className="m-box">
          <h2>&gt; WHAT'S DOWN THERE</h2>
          <ul className="m-finds">
            <li><b>ACID.</b> Buckets of it. This is the job.</li>
            <li><b>MUD.</b> Some days it is just mud.</li>
            <li><b>???</b> Old-timers whisper about a motherlode, a well full of something shiny, and things that are not from here.</li>
          </ul>
          <p className="m-dim">Nobody knows the odds. Payroll will not say. Every shift pays something.</p>
          {me && <button className="m-link" onClick={() => navigate('/store')}>BIGGER BUCKETS AND DEEPER SHAFTS: GENERAL STORE ►</button>}
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

function Shift({ shift, audio, sound, onFinish, onQuit, onComplete, exitShift, onLeaving }) {
  const bucketShift = shift.rulesVersion === 2;
  const canvas = useRef(null);
  const sceneRef = useRef(null);
  const client = useRef(null);
  const [bucket, setBucket] = useState(shift);
  const bucketRef = useRef(shift);
  const [mineError, setMineError] = useState(null);
  const errorRef = useRef(null);
  const [clockingOut, setClockingOut] = useState(false);
  const closing = useRef(false);
  const [near, setNear] = useState(false);
  const [rod, setRod] = useState(null); // dowsing rod: eighths of a turn toward the current pool
  const [bars, setBars] = useState(1);
  const [legacyProgress, setProgress] = useState(0);
  const progress = bucketShift ? bucket.collected / bucket.capacity : legacyProgress;
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);
  const hold = value => { holdingRef.current = value; setHolding(value); };
  const release = () => { hold(false); client.current?.stop().catch(() => {}); };
  const [elapsed, setElapsed] = useState(0);
  const [line, setLine] = useState(LINES[shift.seed % LINES.length]);
  const [status, setStatus] = useState('FIND THE ACID POOL');
  const done = useRef(false);
  const cells = FIRST_POOL_STEPS[shift.cells] ? shift.cells : 7;
  const maze = useRef(makeMaze(shift.seed, cells, FIRST_POOL_STEPS[cells])).current;
  const eggLocation = useRef(eggSpot(maze, shift.seed)).current;
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
  const [tiltActive, setTiltActive] = useState(false);
  const tiltActiveRef = useRef(false);
  const keys = useRef(new Set()).current;
  const accept = state => {
    if (state.result || Object.hasOwn(state, 'pending')) {
      done.current = true; hold(false); onComplete(state); return;
    }
    const previous = bucketRef.current;
    bucketRef.current = state; setBucket(state); errorRef.current = null; setMineError(null);
    if (state.collected > previous.collected) audio?.chunk();
    sceneRef.current?.setDeposits(state.pools, state.currentPoolId);
    const pool = state.pools.find(p => p.id === state.currentPoolId);
    vein.current.flowing = !!pool?.remaining;
    if (state.currentPoolId !== previous.currentPoolId) {
      hold(false); setNear(false);
      const dry = state.pools.find(p => p.id === previous.currentPoolId)?.quantity === 0;
      setStatus(dry ? 'DRY. FOLLOW THE CLICKS.' : 'POOL DRAINED. FOLLOW THE CLICKS.');
      setLine(dry ? DRY_LINES[state.pools.findIndex(p => p.id === state.currentPoolId) % DRY_LINES.length] : 'YOU HAVE REMOVED THE WET FROM THIS HOLE.');
    } else if (pool?.remaining) {
      setStatus('FIND THE ACID POOL');
      if (previous.pools.find(p => p.id === pool.id)?.quantity == null) setLine(pool.quantity >= state.capacity ? 'A GUSHER. ONE HOLE, ONE WHOLE BUCKET. TELL NOBODY.'
        : pool.quantity <= 10 * (SHAFTS.find(s => s.id === state.shaft)?.scale || 1) ? 'A PUDDLE. IT IS STILL, TECHNICALLY, ACID.' : 'THE ACID IS IN. TAKE WHAT YOU CAN CARRY.');
    } else {
      setStatus('IT\'S SEEPING IN. WAIT FOR IT.');
      vein.current.waitUntil = Date.now() + Math.max(250, Math.min(2500, state.readyAt - state.serverNow));
    }
    if (state.spill && state.spill.poolId !== previous.spill?.poolId) {
      setStatus('CAVE-IN.'); setLine('THE ROOF CAME DOWN. A QUARTER OF YOUR BUCKET IS NOW FLOOR. THE REST IS STILL YOURS.');
    }
  };
  const fail = error => {
    errorRef.current = error; setMineError(error); hold(false);
    if (sceneRef.current) sceneRef.current.mining = false;
  };
  async function clockOut() {
    if (!bucketShift) return onQuit();
    if (closing.current || done.current) return;
    closing.current = true; hold(false); setClockingOut(true); onLeaving(true);
    try { await client.current.clockOut(); } catch { /* the request lane keeps the error and confirmed bucket */ }
    finally { closing.current = false; setClockingOut(false); onLeaving(false); }
  }
  const retry = async () => {
    if (closing.current || done.current) return;
    try { await client.current.probe(bucketRef.current.currentPoolId); } catch { /* keep the recovery control visible */ }
  };
  const move = (f, t) => {
    const s = sceneRef.current;
    if (!s || doomRef.current) return;
    s.input.f = f; s.input.t = t; s.input.s = 0;
  };
  const setTiltMode = (active) => {
    tiltActiveRef.current = active; setTiltActive(active); keys.clear();
    move(0, 0);
  };

  const doorRef = useRef(false);
  // The door behind the start (v27). Opening it only changes this page: the music pauses, the mine stops drawing,
  // the controls go to the game. The shift clock is the server's; it keeps running and nothing here can stop it.
  const openDoor = useRef(null);
  openDoor.current = () => {
    if (doomRef.current) return;
    doomRef.current = true; setDoom(true); release();
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
    let lastNear = false, lastBars = 1;
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (bucketShift) {
      client.current = createMiningClient({
        send: (path, body) => api('POST', path, { rulesVersion: 2, shiftId: shift.shiftId, ...body }),
        onState: accept, onError: fail,
      });
      exitShift.current = clockOut;
      const pool = shift.pools.find(p => p.id === shift.currentPoolId);
      if (pool) maze.pool = pool;
      vein.current.flowing = !!pool?.remaining;
    }
    // At a pool: ask the server if the acid is in yet (it alone knows when). Dry: the vein moves on to the next
    // pool in the chain and this one stays behind as a crater. Seeping (or no pools left): wait here and ask again.
    const askVein = async () => {
      const v = vein.current;
      if (v.asking || v.flowing || Date.now() < v.waitUntil || closing.current || done.current || errorRef.current || doomRef.current) return;
      v.asking = true;
      try {
        if (bucketShift) { await client.current.probe(bucketRef.current.currentPoolId); return; }
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
    const dark = Math.max(0, ['7', '8', '12', 'earl'].indexOf(shift.shaft));
    const stalker = new Stalker(maze, { armed: !!shift.scare, afterMs: shift.scare?.afterMs, rand: rng((shift.seed ^ 0x5eed) >>> 0) });
    const scene = new MineScene(canvas.current, maze, {
      onNear: (d, path) => {
        const at = d < MINE_REACH;
        if (at && !vein.current.flowing) askVein();
        const n = at && vein.current.flowing && !done.current;
        if (n) stalker.acidFound();
        if (n !== lastNear) { lastNear = n; setNear(n); if (!n) release(); }
        const b = geigerBars(path);
        if (b !== lastBars) { lastBars = b; setBars(b); }
      },
      stalker, localStart: shift.localStart, reduceMotion: reduce,
      fogFar: [17, 13, 10, 8][dark] + (shift.lamp ? 8 : 0), lampReach: shift.lamp ? 18 : [11, 9, 7.5, 6.5][dark],
      onDread: (level) => { dreadEl.current?.style.setProperty('--dread', level.toFixed(2)); },
      onEvent: (e) => {
        if (e === 'appear') { visitorHere.current = true; setVisitor(true); audio?.dread(true); setLine('SOMEONE ELSE IS ON SHIFT TODAY.'); }
        if (e === 'vanish') { visitorHere.current = false; setVisitor(false); audio?.dread(false); setLine('THE ACID GLOWS. HE\'S GONE.'); dreadEl.current?.style.setProperty('--dread', '0'); }
      },
    });
    sceneRef.current = scene;
    if (bucketShift) scene.setDeposits(shift.pools, shift.currentPoolId);
    if (eggRef.current) { if (eggLocation && Date.now() - shift.localStart < EGG_MS) scene.addEgg(eggLocation); else eggRef.current = null; }
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
    const sync = () => {
      if (tiltActiveRef.current) return;
      scene.input.f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      scene.input.s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      scene.input.t = (keys.has('arrowright') || keys.has('e') ? 1 : 0) - (keys.has('arrowleft') || keys.has('q') ? 1 : 0);
    };
    const down = (e) => {
      if (doomRef.current || closing.current || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if ((k === ' ' || k === 'enter') && e.target.closest?.('button, a')) return;
      if (k === 'f' && doorRef.current) { openDoor.current(); return; }
      if (k === 'g' && eggRef.current === 'there') { grabEgg.current(); return; }
      if (k === ' ' || k === 'enter') { if (!errorRef.current) hold(true); e.preventDefault(); return; }
      if (k.startsWith('arrow')) e.preventDefault();
      keys.add(k); sync();
    };
    const up = (e) => { if (doomRef.current) return; const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter') { release(); return; } keys.delete(k); sync(); };
    const stopInput = () => { release(); keys.clear(); scene.input.f = scene.input.s = scene.input.t = 0; };
    const hidden = () => { if (document.hidden) stopInput(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', stopInput); document.addEventListener('visibilitychange', hidden);
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
      if (shift.rod) {
        const to = bucketRef.current.pools.find((p) => p.id === bucketRef.current.currentPoolId);
        setRod(to ? rodHeading(maze.grid, { x: Math.round(scene.pos.x / TILE), y: Math.round(scene.pos.y / TILE) }, to, scene.yaw) : null);
      }
      const dv = scene.doorView(); const n = dv.dist < 2.1 && dv.facing > 0.75;
      if (n !== doorRef.current) { doorRef.current = n; setDoorNear(n); }
      if (eggRef.current === 'there') {
        if (Date.now() - shift.localStart > EGG_MS) { eggRef.current = 'gone'; scene.removeEgg('sink'); setEggNear(false); }
        else { const ev = scene.eggView(); setEggNear(ev.dist < 1.9 && ev.facing > 0.4); }
      }
    }, 250);
    const flavor = setInterval(() => { if (!visitorHere.current) setLine(LINES[Math.floor(Math.random() * LINES.length)]); }, 6500);
    return () => {
      client.current?.dispose(); exitShift.current = null;
      scene.dispose(); sceneRef.current = null; delete window.__acidMine; window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', stopInput); document.removeEventListener('visibilitychange', hidden);
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

  // geiger clicks: one rate per bar (1400 ms at one bar down to 90 ms at ten), so walking doesn't keep restarting the timer
  useEffect(() => {
    if (!audio) return;
    const ms = Math.round(1400 * (90 / 1400) ** ((bars - 1) / 9));
    const id = setInterval(() => { if (!doomRef.current) audio.tick(bars === 10 ? 1.4 : 0.8); }, ms);
    return () => clearInterval(id);
  }, [bars, audio]);

  useEffect(() => {
    const s = sceneRef.current; if (s) s.mining = holding && near && !mineError && !clockingOut;
    if (bucketShift) {
      if (holding && holdingRef.current && near && !mineError && !clockingOut && !done.current) {
        client.current.start(bucketRef.current.currentPoolId); setLine('MINING ACID. SOMEHOW.');
      }
      return () => { client.current?.stop().catch(() => {}); };
    }
    // Legacy shifts retain their original four-second collection rule.
    if (!holding || !near || done.current) return;
    const id = setInterval(() => {
      setProgress((p) => {
        const np = Math.min(1, p + 0.025);
        if (Math.random() < 0.3) audio?.chunk();
        return np;
      });
    }, 100);
    return () => clearInterval(id);
  }, [holding, near, mineError, clockingOut]);
  useEffect(() => {
    if (bucketShift || progress < 1 || done.current) return;
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
      <div className="m-hud tr">
        <div className={`geiger ${bars >= 8 ? 'hot' : bars >= 5 ? 'warm' : ''}`}>ACID {'▮'.repeat(bars)}{'▯'.repeat(10 - bars)}</div>
        {rod != null && <div className="m-rod" data-test="rod">ROD <b aria-label={['ahead', 'ahead and right', 'right', 'behind and right', 'behind', 'behind and left', 'left', 'ahead and left'][rod]}>{'↑↗→↘↓↙←↖'[rod]}</b></div>}
        {bucketShift && <div className="m-bucket-status" data-test="bucket-status">
          <span>{bucket.capacity > 100 ? 'HAUL' : 'BUCKET'} {Math.floor(bucket.collected)} / {bucket.capacity}</span>
          <div className="m-bucket" role="progressbar" aria-label="Acid collected" aria-valuemin={0} aria-valuemax={bucket.capacity} aria-valuenow={bucket.collected}><div style={{ width: `${progress * 100}%` }} /></div>
        </div>}
        <button className="m-link" disabled={clockingOut} onClick={clockOut}>{clockingOut ? 'WEIGHING…' : 'CLOCK OUT'}</button>
      </div>
      {mineError && <div className="m-recovery" role="alert">
        <span>{mineError.message}</span>
        <button className="m-btn" disabled={clockingOut} onClick={mineError.code === 'mine_reload' ? () => window.location.reload() : retry}>{mineError.code === 'mine_reload' ? 'RELOAD' : 'RETRY'}</button>
      </div>}
      <div className="m-ticker" aria-live="polite">{line}</div>
      {near && (
        <div className="m-mine">
          {!bucketShift && <div className="m-bucket"><div style={{ width: `${progress * 100}%` }} /></div>}
          <button className={`m-btn big ${holding ? 'on' : ''}`} disabled={!!mineError || clockingOut} onPointerDown={(e) => { e.preventDefault(); hold(true); }} onPointerUp={release} onPointerCancel={release} onPointerLeave={release} onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }} onBlur={release}>
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
      <div className="m-movement" inert={doom ? '' : undefined} aria-hidden={doom || undefined}>
        <TiltControls onInput={move} onActiveChange={setTiltMode} paused={holding || doom} />
        {!tiltActive && <MovePad apply={move} />}
      </div>
    </div>
  );
}

/** Phone controls: stick for walking and gentle steering; hold the arrows to turn. */
function MovePad({ apply }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stick = useRef({ x: 0, y: 0 });
  const turn = useRef(0); // -1 / 0 / +1 from the side buttons
  const active = useRef(false);
  const push = () => {
    const { x, y } = stick.current;
    const f = Math.abs(y) < 0.12 ? 0 : -Math.sign(y) * Math.min(1, (Math.abs(y) - 0.12) / 0.88) ** 0.85;
    const t = turn.current || stickTurn(x);
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

function Result({ r, onAgain, onLeave, starting, fare }) {
  const big = ['motherlode', 'aliens', 'diamonds'].includes(r.outcome);
  return (
    <main className={`m-result o-${r.outcome} ${big ? 'jackpot' : ''}`}>
      <div className="hazard-bar" />
      <p className="m-sub">SHIFT REPORT</p>
      <pre className="m-art" aria-hidden="true">{ART[r.outcome]}</pre>
      <h1 className="m-title">{r.title}</h1>
      <p className="m-story">{r.text}</p>
      <div className="m-pay">+${r.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
      {r.twin && <p className="m-twin" data-test="twin">THE OTHER FAUN WAS WAITING AT THE ELEVATOR. HE TOOK ${r.twin.took.toLocaleString('en-US', { maximumFractionDigits: 2 })} AND SAID THANK YOU.</p>}
      {r.capacity != null && <p className="m-dim">{r.collected.toLocaleString('en-US', { maximumFractionDigits: 2 })} / {r.capacity} UNITS COLLECTED</p>}
      <p className="m-dim">BANKROLL NOW ${r.bankroll.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
      <div className="m-actions">
        <button className="m-btn" disabled={starting} onClick={onAgain}>[ ANOTHER SHIFT{fare ? ` · $${fare} FARE` : ''} ]</button>
        <button className="m-btn ghost" disabled={starting} onClick={onLeave}>[ BACK TO THE CARD ROOM ]</button>
      </div>
    </main>
  );
}
