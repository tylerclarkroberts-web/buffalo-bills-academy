import React, { useEffect, useRef, useState } from 'react';
import Bout, { mergeFight } from '../barn/Bout.jsx';
import BugCard from '../barn/BugCard.jsx';
import { createPvpClient, minerHint, pvpAmbush, pvpForfeit, pvpMove, pvpWild, pvpJar } from './pvpClient.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { api, useSession, refreshSession } from '../api.js';
import { navigate } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { rng, veinChain, eggSpot, findSpots, rodHeading, geigerBars, farthest, RUBBLE } from '../../../server/engine/maze.js';
import { shiftMaze, tierInfo, tierLight } from '../../../server/engine/mine-tiers.js';
import { WormSwarm } from './worms.js';
import Worms from './Worms.jsx';
import { stickTurn } from './controls.js';
import { createMiningClient, readMineReceipt, rememberMineReceipt } from './miningClient.js';
import MineMap, { wildWhat } from './MineMap.jsx';
import { markWild, readExploration, rememberExploration, revealExploration } from './exploration.js';
import { TYPES, typeOf, edge } from '../../../server/engine/bug-types.js';

// The BUG menu: what you can tell your guide. It leads to the acid unasked; the rest are orders.
const HEESHEE_GONE = 'Your bug is nowhere to be found. The Heeshee Mazode took it.';
const HEESHEE_NO_BATTLE = "You can't battle a bug, your bug is lost.";
const BUG_ORDERS = [
  { id: 'come', icon: '🫳', name: 'COME HERE', line: (n) => `${n} TURNS ROUND AND COMES TO HEEL.` },
  { id: 'acid', icon: '🧪', name: 'FIND ACID', line: (n) => `${n} IS AFTER THE ACID AGAIN. FOLLOW IT.` },
  { id: 'someone', icon: '👤', name: 'FIND SOMEONE', line: (n) => `${n} HAS SOMEBODY'S SCENT. FOLLOW IT. QUIETLY.` },
  { id: 'lift', icon: '🛗', name: 'TO THE LIFT', line: (n) => `${n} KNOWS THE WAY OUT. FOLLOW IT TO THE LIFT.` },
];
const EGG_MS = 30000; // an egg (when the server put one in this shift) lies near the start for the first 30 s
import { MineScene, TILE } from './scene.js';
import { MineAudio } from './audio.js';
import StickIntro, { stickIntroSeen } from './StickIntro.jsx';
import { Stalker } from './stalker.js';
import { FaunFollower } from './faunFollower.js';
import { BugGuide } from './bugGuide.js';
import { HeesheeMazode, panOf, proximity } from './heeshee.js';
import { VeinTracker } from './vein.js';
import DoorHall from './DoorHall.jsx';
import Foreman from './Foreman.jsx';
import TiltControls from './TiltControls.jsx';
import { paidFarewell } from './paidFarewell.js';
import { SHAFTS } from '../../../server/catalog/mine.js';
import { DANCES, DANCE_BY_ID } from '../../../server/engine/dances.js';
import { Crew, CREW, Flicker, ScareGate } from './horror.js';
import JumpScare from './JumpScare.jsx';
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
  'SAFETY NOTICE: THE HILLS DO NOT HAVE EYES. STOP ASKING.',
  'TIP: THE BUCKET GOES UNDER THE ACID.',
  'NEAREST TOWN: WENDOVER. NEAREST HELP: NO.',
  'FOREMAN: "LESS LOOKING AROUND, MORE ACID, SPORT."',
  'THE CANARY QUIT. IT LEFT A NOTE. THE NOTE WAS SCREAMING.',
  'RUMOR: THE LAST CREW IS STILL ON THE CLOCK.',
  'SAFETY NOTICE: THE ACID IS NOT FOR YOUR SKIN, EYES, OR CURIOSITY.',
  'IT HAS BEEN 0 DAYS SINCE SOMEONE COUNTED THE MINERS.',
  'THIS MINE HAS BEEN IN OPERATION SINCE 1966. B.C.',
  'FOREMAN: "I DON\'T PAY YOU TO WALK. I BARELY PAY YOU TO MINE."',
  'COMPANY POLICY: TEETH FOUND ON SHIFT BELONG TO THE COMPANY.',
  'GRIND REPORT: YOU ARE 0.3% CLOSER TO A SECOND HAT.',
  'A CHILD IS LAUGHING DOWN THE TUNNEL. NO CHILDREN ARE ON PAYROLL.',
  'SOMEONE SCRATCHED TALLY MARKS BY THE DOOR. THEY STOP AT 4,000.',
  'YOUR HEADLAMP FLICKERED. IT IS FINE. IT SAW SOMETHING, IS ALL.',
  'THE WALLS ARE SWEATING. DO NOT TAKE IT PERSONALLY.',
  'WORKERS\' COMP IS A TOWEL. THE TOWEL IS MISSING.',
  'FOREMAN: "I HAVE SEEN MUD WITH MORE HUSTLE."',
  'ACHIEVEMENT LOCKED: ALL ORIGINAL FINGERS.',
  'SAFETY NOTICE: THE EMERGENCY EXIT IS A PAINTING OF AN EMERGENCY EXIT.',
  'TIP: LEFT IS THE OTHER RIGHT.',
  'RUMOR: A MINER TOOK A WRONG TURN IN \'87. HE STILL CASHES HIS CHECKS.',
  'SOMEONE DREW A FAMILY ON THE WALL. THERE ARE TOO MANY OF THEM.',
  'THE COMPANY STORE NOW SELLS EYEWASH. ONE EYE PER CUSTOMER.',
  'XP +0. SOMETHING ELSE LEVELED UP.',
  'NOTICE: THE BREAK ROOM IS BEING USED BY SOMETHING ELSE.',
  'THE "0 DAYS" SIGN HAS NEVER NEEDED CHANGING.',
  'FOREMAN: "YOU CALL THAT WALKING?"',
  'TIP: ACID BURNS. THIS HAS BEEN YOUR TRAINING.',
  'SAFETY NOTICE: BOOTS FOUND IN THE TUNNELS ARE OCCUPIED.',
  'THE MINE CART WENT BY AGAIN. THERE ARE NO TRACKS.',
  'YOUR BUCKET HAS A SMALL HOLE. SO DOES YOUR CONTRACT.',
  'TIP: IF YOU ARE READING THIS, YOU ARE NOT MINING.',
  'FOREMAN: "THAT BUCKET BETTER COME BACK HEAVIER THAN IT LEFT."',
  'THERE IS A LAWN CHAIR DOWN HERE. IT IS FACING YOU.',
  'PAYROLL REMINDER: HAZARD PAY IS A FEELING.',
  'SAFETY NOTICE: DO NOT WHISTLE. SOMETHING DOWN HERE KNOWS THE HARMONY.',
  'NOTICE: THE VENDING MACHINE ONLY TAKES TEETH.',
  'RUMOR: THE FOREMAN HAS NEVER BEEN SEEN LEAVING.',
  'EMPLOYEE OF THE MONTH: [REDACTED]. THIRD MONTH RUNNING. STILL MISSING.',
  'YOU FOUND A HARD HAT. IT IS WARM. PUT IT BACK.',
  'TIP: DEAD ENDS ARE WHERE THE TUNNEL STOPS.',
  'A DISTANT VOICE: "IS IT LUNCH?" IT HAS NOT BEEN LUNCH IN YEARS.',
  'THE AIR DOWN HERE IS 40% AIR.',
  'FOREMAN: "BREAKS ARE A SURFACE THING."',
  'GRIND REPORT: PRODUCTIVITY UP. HEADCOUNT DOWN. UNRELATED.',
  'THE PREVIOUS MINER LEFT YOU A NOTE. IT SAYS "DON\'T."',
  'MORALE IS HIGH. MORALE IS MANDATORY.',
  'YOU FOUND A CASINO CHIP. THE CASINO BURNED DOWN IN 1962.',
  'REMINDER: SUNLIGHT IS A PERK, NOT A RIGHT.',
  'TIP: HOLD THE BUCKET BY THE HANDLE. THAT IS WHAT IT IS FOR.',
  'THE ACID LOOKED AT YOU FIRST.',
  'A DISTANT VOICE: "HEY." JUST "HEY." KEEP WALKING.',
  'A DISTANT VOICE: "YOU DROPPED THIS." YOU DID NOT DROP ANYTHING.',
];
// Only while the visitor is on shift with you.
const VISITOR_LINES = [
  'SAFETY NOTICE: THAT IS NOT A CO-WORKER. CO-WORKERS BLINK.',
  'SAFETY NOTICE: DO NOT FEED HIM.',
  'IF HE WAVES BACK, THAT IS BETWEEN YOU AND HIM.',
  'THE GEIGER IS CLICKING IN MORSE. IT SAYS "BEHIND."',
];
// v79: the acid worms and the cave-ins get their own lines.
const WORM_LINES = ['AN ACID WORM IS ON YOUR GOGGLES. IT IS LOOKING AT YOU.', 'WORM. FACE. KNIFE. IN THAT ORDER.', 'IT IS WARM AND IT IS WIGGLING. CUT IT OFF.', 'THE WORM WOULD LIKE TO BE FRIENDS. CUT IT OFF.'];
const CUT_LINES = ['SHLICK. TWO WORMS NOW, BOTH LEAVING.', 'CLEAN CUT. THE FOREMAN WOULD BE PROUD. HE WOULD NOT SAY SO.', 'YOU BOWIE\'D IT.', 'WORM REMOVED. GOGGLES STILL STICKY.'];
const CAVE_LINE = 'THE ROOF CAME DOWN HERE. GO AROUND.';
// Horror Night (server/engine/horror.js decides when): once the lights go, the ticker changes its tune.
const HORROR_LINES = [
  'FOREMAN: "THE LIGHTS ARE A SURFACE THING."',
  'SOMEONE IS CRYING IN SHAFT 12. NOBODY IS ON SHIFT IN SHAFT 12.',
  'THE LAST CREW IS STILL ON THE CLOCK. THEY ARE SMILING ABOUT IT.',
  'THEY ONLY WALK WHEN YOU LOOK AWAY. SO DON\'T.',
  'POINT THE LAMP AT IT. IT HATES THE LAMP.',
  'PAYROLL REMINDER: SCREAMING IS UNPAID.',
  'YOUR HEADLAMP IS DOING ITS BEST. ITS BEST IS NOT GOOD.',
  'SAFETY NOTICE: IF IT SMILES, DO NOT SMILE BACK. IT WILL TAKE THAT AS A YES.',
  'THE ACID STILL GLOWS. FOLLOW THE GLOW. ONLY THE GLOW.',
  'HEADCOUNT: YOU. HEADCOUNT AGAIN: YOU AND FOUR.',
];
const LOW_FLASH_KEY = 'bba.mines.lowFlash';
function readLowFlash() {
  try { const v = localStorage.getItem(LOW_FLASH_KEY); if (v === '1' || v === '0') return v === '1'; } catch { /* private mode */ }
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** The day's tier: picks lit for how rough it is (out of five) and its name. */
export function TierBadge({ tier }) {
  const t = tierInfo(tier); if (!t) return null;
  return (
    <span className={`m-tier t${t.tier}`} data-test="mine-tier" aria-label={`Today's dig: ${t.tier} of 5, ${t.name.toLowerCase()}`}>
      <span className="m-picks" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= t.tier ? '' : 'off'}>⛏</i>)}</span>
      <span className="m-tier-name" aria-hidden="true">{t.name}</span>
    </span>
  );
}

const ART = {
  ambushed: String.raw`
      _____
     /     \    tap
    | x   x |  tap
     \  ^  /
      |||||`,
  defeated: String.raw`
    ___________
   | GAME OVER |
   |  ~  .  ~  |
   |___________|`,
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

/** The Bug Gym: what an unruly guide says when it refuses to walk. */
const BALK_LINES = [
  (n) => `${n} STOPS DEAD AND GLARES AT THE WALL.`,
  (n) => `${n} IS NOT TAKING ORDERS RIGHT NOW.`,
  (n) => `${n} FLEXES AT A STALACTITE. GIVE IT A SECOND.`,
  (n) => `${n} REFUSES. THE JUICE IS TALKING.`,
];
/** A juiced or overworked guide, in the HUD: how much it drags and its roid rage chance. */
function GymChip({ gym }) {
  const hot = gym.rage >= 0.3;
  return <div className={`m-gym${hot ? ' hot' : ''}`} data-test="mine-gym">{gym.roid > 0 ? 'JUICED' : 'OVERWORKED'} · PACE {Math.round(gym.mineSpeed * 100)}%{gym.rage > 0 ? ` · RAGE ${Math.round(gym.rage * 100)}%` : ''}</div>;
}

export default function Mines() {
  const { me, loading } = useSession();
  const [phase, setPhase] = useState('intro'); // intro | play | result
  const [shift, setShift] = useState(null);
  const [result, setResult] = useState(null);
  const [sick, setSick] = useState(null); // the partner drank purple acid: its name and what the shift still paid
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
  function complete(v, toSurface = false) {
    if (v.sick || v.taken) { // whichever way the shift ended, this comes first
      rememberMineReceipt(me?.id, v.result?.shiftId);
      setSick({ name: v.sick || v.taken, taken: !!v.taken, result: v.result || null }); setPhase('sick'); refreshSession(); return;
    }
    if (toSurface && (v.result || Object.hasOwn(v, 'pending'))) {
      rememberMineReceipt(me?.id, v.result?.shiftId);
      refreshSession(); navigate('/'); return;
    }
    if (v.result) {
      setResult(v.result); setPhase('result'); refreshSession();
      if (v.result.foreman) setLecture(v.result.foreman);
    } else if (Object.hasOwn(v, 'pending')) {
      setPhase('intro'); if (v.pending) setLecture(v.pending);
    }
  }
  async function quit(toSurface = false) {
    if (leaving) return;
    setLeaving(true);
    try { complete(await api('POST', '/mines/quit', { shiftId: shift?.shiftId }), toSurface); }
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
        {phase === 'play' && shift && <Shift key={shift.shiftId} shift={shift} me={me} audio={audio.current} sound={sound} onFinish={finish} onQuit={quit} onComplete={complete} exitShift={exitShift} onLeaving={setLeaving} />}
        {phase === 'sick' && sick && <Sick sick={sick} />}
        {phase === 'result' && result && <Result r={result} onAgain={start} onLeave={leave} starting={starting} fare={going?.fare} />}
      </div>
      {lecture && <Foreman key={lecture.id} pending={lecture} sound={sound} onDone={() => { setLecture(null); if (lecture.reason === 'paid') navigate('/'); else if (lecture.reason !== 'heeshee') setPhase('intro'); }} />}
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
  const units = office?.capacity || 100;
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
    <main className={`m-intro${office?.today ? ' has-today' : ''}`}>
      <div className="hazard-bar" />
      <h1 className="m-title glitch" data-text="THE ACID MINES">THE ACID MINES</h1>
      <p className="m-sub">NOW HIRING · ALL SHIFTS · NO EXPERIENCE · NO QUESTIONS</p>
      {office?.today && <div className="m-today" data-test="mine-today">
        <span className="m-dim">TODAY'S DIG</span><TierBadge tier={office.today.tier} />
        <span className="m-dim"><span className="m-blurb">{tierInfo(office.today.tier).blurb} </span>{office.today.pay > 1 ? <><span className="m-pay-word">HAZARD </span>PAY ×{office.today.pay}</> : <span className="m-pay-word">STANDARD PAY</span>}</span>
      </div>}
      <div className="m-cols">
        <section className="m-box">
          <h2>&gt; SHIFT ORIENTATION</h2>
          <ol>
            <li>Descend. Walk the tunnels. <span className="m-dim">WASD / arrows · hold Shift to run · phones: stick to walk and steer, hold ◂/▸ to turn, drag the view to look.</span></li>
            <li>Want motion controls? Tap <b>TILT</b>, hold the phone comfortably, and use <b>Recenter</b> to reset your neutral position. <b>Use touch</b> switches back.</li>
            <li>Follow the clicks. Closer is faster; facing the right tunnel gives them a little boost.</li>
            <li>Hold <b>MINE</b> at a wet pool. Drain it, then follow the clicks to the next one. The farther from the lift, the richer the acid.</li>
            <li>One bucket. {units.toLocaleString('en-US')} units. Clock out with what you've got, or fill it for automatic pay.</li>
            <li>A hatched barn bug knows the tunnels and leads you to the glow. If it gets knocked out, take it to the <b>Bug Center</b> in the Barn. Otherwise it recovers all HP after the fight.</li>
            <li><b>Everyone in your shaft shares today's tunnels.</b> Get close behind an unsuspecting miner and press <b>X</b> or tap <b>Assassinate</b> for their acid and up to $100. Meet face to face and your <b>bugs battle automatically</b> for the haul and the loser's smokes. You'll need a day-old account and three finished shifts. Guests and the elevator landing are protected.</li>
          </ol>
          <p className="m-dim">Acid is ready when you find it. Payroll weighs the bucket when you finish.</p>
          {me && open.length > 1 && <div className="m-shafts" role="group" aria-label="Which shaft">
            {open.map((s) => <button key={s.id} className={`m-btn ${s === going ? '' : 'ghost'}`} aria-pressed={s === going} onClick={() => onShaft(s.id)}>{s.name}<span className="small"> · {s.fare ? `$${s.fare} FARE` : 'FREE'}{s.quality > 1 ? ` · ACID ×${s.quality}` : ''}</span></button>)}
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
          {me && <button className="m-link" onClick={() => navigate('/store')}>DEEPER SHAFTS AND FASTER TOOLS: GENERAL STORE ►</button>}
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

function Shift({ shift, me, audio, sound, onFinish, onQuit, onComplete, exitShift, onLeaving }) {
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
  const geiger = useRef({ bars: 1, facing: 0 });
  const [legacyProgress, setProgress] = useState(0);
  const progress = bucketShift ? bucket.collected / bucket.capacity : legacyProgress;
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);
  const [mapOpen, setMapOpen] = useState(false);
  const mapRef = useRef(false), mapButton = useRef(null);
  const hold = value => { if (value) stopDance(); holdingRef.current = value; setHolding(value); };
  // v89: dances. Cosmetic only: the server passes the id on to the other miners and nothing else reads it.
  const [dance, setDance] = useState(null);
  const danceRef = useRef(null);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef(false);
  const showPicker = (v) => { pickerRef.current = v; setPicker(v); if (v) showBugMenu(false); };
  // The BUG menu and the guide it talks to (made with the scene, below).
  const [bugMenu, setBugMenu] = useState(false), [bugOrder, setBugOrder] = useState('acid');
  const bugMenuRef = useRef(false), guideRef = useRef(null);
  const showBugMenu = (v) => { bugMenuRef.current = v; setBugMenu(v); if (v) { pickerRef.current = false; setPicker(false); } };
  const giveOrder = (id) => {
    showBugMenu(false);
    const order = BUG_ORDERS.find((o) => o.id === id), guide = guideRef.current;
    if (stolenRef.current || guide?.state === 'stolen') {
      setLine(HEESHEE_GONE); setStatus(HEESHEE_GONE);
      api('POST', '/mines/bug/order', { shiftId: shift.shiftId, order: id, rulesVersion: 2 }).catch(() => {});
      return;
    }
    if (order && guide?.order(id)) { setBugOrder(id); setLine(order.line((shift.bug?.name || 'Your bug').toUpperCase())); }
  };
  const canFightWild = useRef(!!shift.bug && !shift.bugStolen);
  // A wild bug within reach: the miner is asked before anything starts, and picks which bug goes in. It waits meanwhile.
  const [wildAsk, setWildAsk] = useState(null);
  const wildAskRef = useRef(null), wildActs = useRef(null), wildBugs = useRef([]);
  const [stickIntro, setStickIntro] = useState(null);
  const stickIntroRef = useRef(null);
  function stopDance() {
    if (!danceRef.current) return;
    danceRef.current = null; setDance(null); sceneRef.current?.stopDance(); audio?.danceBeat(false);
  }
  function startDance(id) {
    const d = DANCE_BY_ID[id]; showPicker(false);
    if (!d || !sceneRef.current || battleRef.current || doomRef.current || mapRef.current || done.current) return;
    if (holdingRef.current) { holdingRef.current = false; setHolding(false); client.current?.stop().catch(() => {}); }
    keys.clear();
    sceneRef.current.startDance(id);
    if (danceRef.current !== id) setLine(d.line);
    danceRef.current = id; setDance(id); audio?.danceBeat(true);
    pvp.current?.beat();
  }
  const release = () => { hold(false); client.current?.stop().catch(() => {}); };
  const [elapsed, setElapsed] = useState(0);
  const [purple, setPurple] = useState(false); // the partner has found the purple acid; the shift ends a few seconds on
  const purpleRef = useRef(false);
  // A fainted bug stays home until the Bug Center heals it (and the Foreman lends you Gerald if you meet someone).
  const [line, setLine] = useState(shift.bugStolen ? HEESHEE_GONE : shift.bugFainted ? `${String(shift.bugFainted.name).toUpperCase()} IS FAINTED AND STAYED IN THE BARN. THE BUG CENTER HAS A BED FOR IT.` : LINES[shift.seed % LINES.length]);
  const [status, setStatus] = useState(shift.bugStolen ? HEESHEE_GONE : 'FIND THE ACID POOL');
  const [stolen, setStolen] = useState(!!shift.bugStolen);
  const stolenRef = useRef(!!shift.bugStolen);
  const done = useRef(false);
  const maze = useRef(shiftMaze(shift)).current; // v79: the day's tier decides the size and the cave-ins
  const tier = tierInfo(shift.tier);
  // v79: acid worms (none on the easy days). They hold off while acid is in reach, in a battle or behind the door.
  const swarm = useRef(null); if (!swarm.current) swarm.current = new WormSwarm(tier);
  const [worms, setWorms] = useState([]);
  const [cutting, setCutting] = useState([]);
  const nearRef = useRef(false);
  const cutWorm = useRef(null);
  cutWorm.current = (id, angle = -0.6) => {
    const w = swarm.current.slash(id); if (!w) return;
    setWorms([...swarm.current.worms]); setCutting((c) => [...c, { w, angle }]); audio?.slash();
    setTimeout(() => setCutting((c) => c.filter((x) => x.w.id !== w.id)), 700);
    if (swarm.current.cuts % 3 === 1) setLine(CUT_LINES[swarm.current.cuts % CUT_LINES.length]);
  };
  const eggLocation = useRef(eggSpot(maze, shift.seed)).current;
  const chain = useRef(veinChain(maze, shift.seed)).current;
  const vein = useRef(null); if (!vein.current) vein.current = new VeinTracker();
  const mapPools = () => bucketShift ? bucketRef.current.pools : chain.map((p, i) => ({ ...p, id: `legacy-${i}`, quantity: null, remaining: i === 0 && vein.current.flowing ? 1 : 0 }));
  const explored = useRef(null);
  if (!explored.current) explored.current = readExploration(me?.id, shift.shiftId, maze.grid, mapPools(), undefined, shift.wilds);
  const saveChart = () => rememberExploration(me?.id, shift.shiftId, explored.current);
  const chartPosition = () => {
    const s = sceneRef.current;
    return s ? { x: s.pos.x / TILE, y: s.pos.y / TILE, yaw: s.yaw } : { ...maze.start, yaw: -maze.facing - Math.PI / 2 };
  };
  const chart = () => {
    const pos = chartPosition();
    if (revealExploration(explored.current, maze.grid, pos.x, pos.y, mapPools(), bucketShift ? bucketRef.current.currentPoolId : 'legacy-0')) saveChart();
  };
  const dreadEl = useRef(null);
  const visitorHere = useRef(false);
  const [visitor, setVisitor] = useState(false);
  const [doorNear, setDoorNear] = useState(false);
  const [liftNear, setLiftNear] = useState(false);
  const surfaceExit = useRef(false);
  const [doom, setDoom] = useState(false);
  const doomRef = useRef(false);
  const soundWas = useRef(false);
  const [eggNear, setEggNear] = useState(false);
  const eggRef = useRef(shift.egg ? 'there' : null); // there | taking | taken | gone
  const grabEgg = useRef(null);
  const [tiltActive, setTiltActive] = useState(false);
  const tiltActiveRef = useRef(false);
  const keys = useRef(new Set()).current;
  // Horror Night: the shift was stamped at clock-in (shift.horror). Starts normal; the lights go at lightsOutMs.
  const horror = shift.horror || null;
  const [dark, setDark] = useState(false);
  const darkRef = useRef(false);
  const [banner, setBanner] = useState(false);
  const [scare, setScare] = useState(0);
  const scareRef = useRef(0);
  const [lowFlash, setLowFlash] = useState(readLowFlash);
  const lowFlashRef = useRef(lowFlash);
  const crewRef = useRef(null);
  const gate = useRef(null); if (!gate.current) gate.current = new ScareGate();
  const lightsOut = useRef(null);
  const jump = useRef(null);
  const horrorEl = useRef(null);
  // v71: the shared mine. Other miners, a back you could stab, and a bug battle in progress.
  const [otherMiners, setOtherMiners] = useState('');
  const [prey, setPrey] = useState(null);
  const preyRef = useRef(null);
  const ambushBusy = useRef(false);
  const [battle, setBattle] = useState(null);
  const battleRef = useRef(null);
  const dismissed = useRef(new Set());
  const afterBattle = useRef(null); // a finished shift that waits until you have read the battle's last line
  const pvp = useRef(null);
  const pvpSend = (path, body) => api('POST', path, { rulesVersion: 2, shiftId: shift.shiftId, ...body });
  const accept = state => {
    if (state.result || Object.hasOwn(state, 'pending')) {
      done.current = true; hold(false); onComplete(state, surfaceExit.current); return;
    }
    const previous = bucketRef.current;
    bucketRef.current = state; setBucket(state); errorRef.current = null; setMineError(null);
    if (state.collected > previous.collected) {
      audio?.chunk();
      if (darkRef.current && gate.current.roll(Date.now())) jump.current?.(); // a chunk of rock comes away, and something with it
    }
    sceneRef.current?.setDeposits(state.pools, state.currentPoolId);
    const pool = state.pools.find(p => p.id === state.currentPoolId);
    vein.current.flowing = !!pool?.remaining;
    vein.current.inspected = pool?.quantity != null;
    if (state.currentPoolId !== previous.currentPoolId) {
      hold(false); setNear(false);
      const dry = state.pools.find(p => p.id === previous.currentPoolId)?.quantity === 0;
      setStatus(dry ? 'DRY. FOLLOW THE CLICKS.' : 'POOL DRAINED. FOLLOW THE CLICKS.');
      setLine(dry ? DRY_LINES[state.pools.findIndex(p => p.id === state.currentPoolId) % DRY_LINES.length] : 'YOU HAVE REMOVED THE WET FROM THIS HOLE.');
    } else if (pool?.remaining) {
      setStatus('FIND THE ACID POOL');
      if (previous.pools.find(p => p.id === pool.id)?.quantity == null) setLine(pool.quantity >= state.capacity ? 'A GUSHER. ONE HOLE, ONE WHOLE BUCKET. TELL NOBODY.'
        : pool.quantity <= 10 ? 'A PUDDLE. IT IS STILL, TECHNICALLY, ACID.' : pool.rich >= 1.5 * (SHAFTS.find(s => s.id === state.shaft)?.quality || 1) ? `THE DEEP STUFF. PAYROLL PAYS ×${pool.rich.toFixed(1)} FOR IT AND ASKS NO QUESTIONS.` : 'TAKE WHAT YOU CAN CARRY.');
    } else {
      setStatus(pool?.quantity != null ? 'POOLS DRAINED. CLOCK OUT WITH YOUR HAUL.' : 'FIND THE ACID POOL');
    }
    if (state.spill && state.spill.poolId !== previous.spill?.poolId) {
      setStatus('CAVE-IN.'); setLine('THE ROOF CAME DOWN. A QUARTER OF YOUR BUCKET IS NOW FLOOR. THE REST IS STILL YOURS.');
    }
    // mech parts (server/catalog/mine.js): what the bug's part just did
    const bugName = String(shift.bug?.name || 'YOUR BUG').toUpperCase();
    if (state.caught && state.caught !== previous.caught) { setStatus('CAVE-IN.'); setLine(`THE ROOF CAME DOWN. ${bugName} HELD THE BUCKET UP OUT OF IT. NOT A DROP.`); }
    if (state.plunged && state.plunged !== previous.plunged) setLine(`NEARLY DRY. ${bugName} PLUNGED IT AND HALF A BUCKET CAME UP. DO NOT LOOK AT THE PLUNGER.`);
  };
  const fail = error => {
    errorRef.current = error; setMineError(error); hold(false);
    if (sceneRef.current) sceneRef.current.mining = false;
  };
  async function clockOut(toSurface = false) {
    if (!bucketShift) return onQuit(toSurface);
    if (closing.current || done.current) return;
    surfaceExit.current = toSurface;
    closing.current = true; hold(false); setClockingOut(true); onLeaving(true);
    try { await client.current.clockOut(); } catch { /* the request lane keeps the error and confirmed bucket */ }
    finally { surfaceExit.current = false; closing.current = false; setClockingOut(false); onLeaving(false); }
  }
  const retry = async () => {
    if (closing.current || done.current) return;
    try { await client.current.probe(bucketRef.current.currentPoolId); } catch { /* keep the recovery control visible */ }
  };
  const freeze = (stopMining = true) => { stopDance(); showPicker(false); showBugMenu(false); if (stopMining) release(); keys.clear(); const s = sceneRef.current; if (s) { s.input.f = s.input.s = s.input.t = 0; s.input.run = false; s.mining = false; } };
  const showMap = (open) => {
    if (open) { freeze(); chart(); }
    mapRef.current = open; setMapOpen(open);
  };
  const showBattle = (b) => {
    if (!b || dismissed.current.has(b.id)) return;
    if (wildAskRef.current) { wildAskRef.current = null; setWildAsk(null); if (sceneRef.current) sceneRef.current.heldWild = null; } // a fight has started, this one or another miner's: the question is moot
    if (b.wildId && markWild(explored.current, sceneRef.current?.wilds.get(b.wildId))) saveChart();
    if (mapRef.current) showMap(false);
    if (!battleRef.current) { freeze(); audio?.dread(false); }
    // The server sends only the blows this page has not seen; the ring wants the whole fight so far, plus what the mine adds at the end.
    const m = mergeFight(battleRef.current, b), raid = m.over?.raid, sign = m.over?.won ? '+' : '−';
    if (m.over) Object.assign(m, { xpEarned: m.over.bug?.xp, levelBefore: m.over.bug?.levelBefore, levelAfter: m.over.bug?.levelAfter,
      ...(m.over.reason === 'abandoned' || m.over.reason === 'draw' ? { result: 'draw', verdict: m.wild ? 'Time. It wanders off unbeaten.' : 'No contest. Nobody gets robbed.' } : {}),
      ...(m.over.reason === 'decision' ? { verdict: `${m.over.won ? m.you.name : m.them.name} wins on points.` }
        : m.wild && m.over.reason === 'jarred' ? { verdict: `In the jar. ${m.over.caught} has a stall waiting.` }
        : m.wild && m.over.rage ? { rage: m.over.rage, verdict: `ROID RAGE. ${m.you.name} went berserk and crushed the ${m.over.rage.killed} before you could get a jar on it. Nothing left to catch.` }
        : m.wild && m.over.reason === 'fainted' && m.over.won ? { verdict: m.jar ? `${m.them.name} is out cold. Jar it before it comes to.` : m.over.awake ? `${m.them.name} comes to and slinks off into the dark.` : `The wild ${m.them.name} slinks off into the dark.` }
        : m.wild && m.over.reason !== 'fainted' && m.over.reason !== 'draw' && m.over.reason !== 'abandoned' ? { verdict: 'You ran. It keeps the tunnel.' } : {}),
      spoils: raid ? [`${sign}$${raid.cash}${raid.cashCapped ? ' (daily loss cap)' : ''}`, `${sign}${Math.floor(m.over.won ? raid.gained || raid.acid : raid.acid)} acid`,
        ...(raid.tobacco?.length ? [`${sign}${raid.tobacco.join(', ')}`] : [])] : [] });
    battleRef.current = m; setBattle(m);
  };
  const onPvp = (v) => {
    if (done.current) return;
    if (v.ended) {
      if (v.battle && !dismissed.current.has(v.battle.id)) { afterBattle.current = v; showBattle(v.battle); return; }
      if (battleRef.current) { afterBattle.current = v; return; }
      if (v.result || Object.hasOwn(v, 'pending')) accept(v);
      return;
    }
    sceneRef.current?.setOthers(v.others || []); guideRef.current?.setOthers(v.others || []);
    if (v.wilds) sceneRef.current?.setWilds(v.wilds);
    if (v.egg === false && eggRef.current === 'there') {
      eggRef.current = 'gone'; sceneRef.current?.removeEgg('sink'); setEggNear(false);
    }
    if (typeof v.canFightWild === 'boolean') canFightWild.current = v.canFightWild;
    if (stolenRef.current || shift.bugStolen) canFightWild.current = false;
    const p = ambushBusy.current ? null : v.ambush;
    if ((p?.id || null) !== (preyRef.current?.id || null)) { preyRef.current = p; setPrey(p); }
    if (v.snap && sceneRef.current) sceneRef.current.pos.set(v.snap.x * TILE, v.snap.y * TILE);
    setOtherMiners(minerHint(v, chartPosition(), maze.grid));
    if (v.battle) showBattle(v.battle);
    else if (battleRef.current && !battleRef.current.over) { battleRef.current = null; setBattle(null); } // restart: the battle is gone
    if (v.notice) {
      const n = v.notice;
      setLine(n.kind === 'ambush' ? `YOU GOT ${n.loser.toUpperCase()} FROM BEHIND. +$${n.cash}, +${Math.floor(n.gained)} ACID.` : `YOU BEAT ${n.loser.toUpperCase()}. +$${n.cash}, +${Math.floor(n.gained)} ACID${n.tobacco?.length ? `, ${n.tobacco.length} SMOKE${n.tobacco.length > 1 ? 'S' : ''}` : ''}.`);
      if (v.shift) { if (battleRef.current && (v.shift.result || Object.hasOwn(v.shift, 'pending'))) afterBattle.current = v.shift; else accept(v.shift); }
    }
  };
  const stab = async () => {
    const target = preyRef.current; if (!target || ambushBusy.current || battleRef.current || closing.current || done.current) return;
    ambushBusy.current = true;
    preyRef.current = null; setPrey(null);
    try {
      const r = await pvpAmbush(pvpSend, target.id);
      const raid = r.raid;
      if (raid) { audio?.chunk(); setLine(`YOU GOT ${raid.loser.toUpperCase()} FROM BEHIND. +$${raid.cash}${raid.cashCapped ? ' (THEY HIT THEIR DAILY LOSS CAP)' : ''}, +${Math.floor(raid.gained)} ACID${raid.spilled ? ` (${Math.floor(raid.spilled)} SPILLED: BUCKET FULL)` : ''}.`); }
      const { raid: _raid, ...state } = r; void _raid;
      if (state.pools || state.result || Object.hasOwn(state, 'pending')) accept(state);
    } catch (e) { setLine(String(e.message || 'TOO LATE.').toUpperCase()); }
    finally { ambushBusy.current = false; }
  };
  const battleMove = async (moves) => { const b = battleRef.current; if (!b) return; try { showBattle((await pvpMove(pvpSend, b.id, moves, b.rounds.length)).battle); } catch (e) { setLine(String(e.message).toUpperCase()); } };
  // Throw a jar at the wild bug: true if it held, false if it got out, or the server's reason for refusing.
  /** `landed` resolves when the thrown jar has finished rocking: the result is not shown before then. */
  const battleJar = async (landed) => {
    const b = battleRef.current; if (!b) return 'That fight is over.';
    try { const r = await pvpJar(pvpSend, b.id, b.rounds.length); Promise.resolve(landed).then(() => showBattle(r.battle)); return r.held; } catch (e) { return e.message; }
  };
  const battleForfeit = async () => { try { await pvpForfeit(pvpSend); } catch { /* the next heartbeat tells */ } pvp.current?.beat(); };
  const battleDone = () => {
    const b = battleRef.current; if (b) dismissed.current.add(b.id);
    if (darkRef.current) audio?.dread(true);
    battleRef.current = null; setBattle(null);
    const end = afterBattle.current; afterBattle.current = null;
    if (end && (end.result || Object.hasOwn(end, 'pending'))) accept(end);
  };
  const move = (f, t) => {
    const s = sceneRef.current;
    if (!s || doomRef.current || battleRef.current || mapRef.current) return;
    if (danceRef.current) { if (!f && !t) return; stopDance(); } // moving ends the dance
    s.input.f = f; s.input.t = t; s.input.s = 0; s.input.run = false;
  };
  const setTiltMode = (active) => {
    tiltActiveRef.current = active; setTiltActive(active); keys.clear();
    move(0, 0);
  };

  const doorRef = useRef(false);
  const liftRef = useRef(false);
  const takeLift = useRef(null);
  takeLift.current = () => {
    if (doomRef.current || mapRef.current || battleRef.current || closing.current || done.current) return;
    freeze(false); clockOut(true);
  };
  // The door beside the lift opens into the Hall of Doors. Opening it only changes this page: the music pauses, the mine stops drawing,
  // the controls go to the game. The shift clock is the server's; it keeps running and nothing here can stop it.
  const openDoor = useRef(null);
  openDoor.current = () => {
    if (doomRef.current || mapRef.current || battleRef.current || closing.current || done.current) return;
    freeze();
    doomRef.current = true; setDoom(true);
    sceneRef.current?.setPaused(true);
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
      vein.current.inspected = pool?.quantity != null;
      if (vein.current.inspected && !vein.current.flowing) setStatus('POOLS DRAINED. CLOCK OUT WITH YOUR HAUL.');
    }
    // The server decided at clock-in whether he's on shift today (shift.scare); when and where he shows is up to how you move.
    const dark = Math.max(0, ['7', '8', '12', 'earl'].indexOf(shift.shaft));
    audio?.enter(dark);
    // How far the lamp reaches and the fog sits: the shaft (and a headlamp), then the day's tier (never so dark a pool in reach is lost).
    const base = { fogFar: [17, 12, 8.5, 6][dark] + (shift.lamp ? 8 : 0), lampReach: shift.lamp ? 18 : [11, 8, 6, 4.5][dark] };
    const light = tier ? tierLight(base, tier.tier) : { ...base, ambient: 1, flicker: 0 };
    const stalker = new Stalker(maze, { armed: !!shift.scare, afterMs: shift.scare?.afterMs, rand: rng((shift.seed ^ 0x5eed) >>> 0) });
    // The faun never shares a shift with the visitor; the server already guaranteed that.
    const faun = (!shift.scare && shift.faun) ? new FaunFollower(maze, { armed: true, rand: rng((shift.seed ^ 0xfa17) >>> 0) }) : null;
    // One exclusive slot: the Heeshee never shares a shift with the visitor or the faun (server/mines.js rollScare).
    const heeshee = (shift.heeshee && !shift.scare && !shift.faun) ? new HeesheeMazode(maze, { armed: true, hasBug: !!(shift.bug && !shift.bugStolen), rand: rng((shift.seed ^ 0x4ee5) >>> 0) }) : null;
    const reportHeesheeSeen = () => {
      if (!shift.heeshee || shift.bugStolen) return;
      const body = JSON.stringify({ shiftId: shift.shiftId });
      const headers = { 'content-type': 'application/json' };
      try {
        if (typeof fetch === 'function') fetch('/api/mines/heeshee/seen', { method: 'POST', credentials: 'same-origin', headers, body, keepalive: true }).catch(() => {});
      } catch { /* leaving the page */ }
    };
    const onPageHide = () => { if (heeshee?.present || heeshee?.state === 'wandering') reportHeesheeSeen(); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onPageHide);
    // v64: a living hatched Barn bug comes along and pathfinds toward the current glow.
    const bugGuide = (shift.bug && !shift.bugStolen) ? new BugGuide(maze, { armed: true, bug: shift.bug }) : null;
    guideRef.current = bugGuide;
    // Inspect on arrival: the server confirms the pool's fixed amount before collection.
    const askVein = async () => {
      const v = vein.current;
      if (closing.current || done.current || errorRef.current || doomRef.current) return;
      v.asking = true;
      try {
        if (bucketShift) { await client.current.probe(bucketRef.current.currentPoolId); return; } // accept() reads the answer
        const r = await api('POST', '/mines/probe', { shiftId: shift.shiftId });
        v.flowing = !!r.flowing; v.inspected = true; sceneRef.current?.setAcid(v.flowing);
        if (v.flowing) { setStatus('FIND THE ACID POOL'); setLine('FILL THE BUCKET.'); }
      } catch { v.fail(Date.now()); } finally { v.asking = false; }
    };
    const scene = new MineScene(canvas.current, maze, {
      onNear: (d, path, facing) => {
        const v = vein.current; v.reach(d);
        // Bucket shifts only ask at the pool: there a probe is the look that reveals the deposit.
        if (v.wantProbe(Date.now())) askVein();
        const n = v.canMine() && !done.current;
        if (n) { stalker.acidFound(); bugGuide?.acidFound(); }
        if (n !== lastNear) { lastNear = n; nearRef.current = n; setNear(n); if (!n) release(); }
        geiger.current = { bars: geigerBars(path), facing };
        const b = geigerBars(path, 48, facing);
        if (b !== lastBars) { lastBars = b; setBars(b); }
      },
      stalker, bugGuide, faun, heeshee, localStart: shift.localStart, reduceMotion: reduce,
      depth: dark, ...light, lampPower: tier ? Math.min(1.15, Math.max(0.7, tier.lamp)) : 1,
      onDread: (level) => { dreadEl.current?.style.setProperty('--dread', level.toFixed(2)); },
      onEvent: (e) => {
        if (e === 'appear') { visitorHere.current = true; setVisitor(true); audio?.dread(true); setLine('SOMEONE ELSE IS ON SHIFT TODAY.'); }
        if (e === 'vanish') { visitorHere.current = false; setVisitor(false); audio?.dread(darkRef.current); setLine('THE ACID GLOWS. HE\'S GONE.'); dreadEl.current?.style.setProperty('--dread', '0'); }
        if (e === 'bug-appear') {
          const nm = shift.bug?.name || 'Your bug';
          setLine(`${nm.toUpperCase()} KNOWS THE WAY. FOLLOW IT TO THE ACID.`);
          setStatus('YOUR BUG IS LEADING. FOLLOW IT.');
        }
        if (e === 'bug-done') setLine('YOUR BUG SETTLES BY THE GLOW. THE ACID IS HERE.');
        if (e === 'bug-balk') { const nm = (shift.bug?.name || 'Your bug').toUpperCase(); setLine(BALK_LINES[Math.floor(Math.random() * BALK_LINES.length)](nm)); }
        if (e === 'bug-nobody') { setBugOrder(bugGuide.mode); setLine('NOBODY ELSE IS DOWN HERE. YOUR BUG LOOKS RELIEVED.'); }
        if (e === 'bug-retarget') {
          const nm = shift.bug?.name || 'Your bug';
          setLine(`${nm.toUpperCase()} FOUND THE NEXT GLOW. FOLLOW IT.`);
          setStatus('YOUR BUG IS LEADING. FOLLOW IT.');
        }
        if (e === 'faun-appear') setLine('A FAUN TROTTED IN BEHIND YOU. HE IS BLEATING.');
        if (e === 'faun-bleat') audio?.bleat();
        if (e === 'heeshee-appear') {
          setLine('SOMETHING IS MOVING IN THE DARK. IT DOES NOT WALK RIGHT.');
          api('POST', '/mines/heeshee/seen', { shiftId: shift.shiftId }).catch(() => {});
        }
        if (e === 'heeshee-noise') {
          const hm = sceneRef.current?.heeshee; const pos = sceneRef.current?.pos;
          if (hm && pos) audio?.heesheeNoise({ kind: ['breath', 'click', 'warble'][Math.floor(Math.random() * 3)], dist: Math.hypot(pos.x - hm.x, pos.y - hm.z), pan: panOf(pos.x, pos.y, sceneRef.current.yaw, hm.x, hm.z), vol: 0.55 });
        }
        if (e === 'heeshee-freeze') { /* feathers snap; the lamp already flickers */ }
        if (e === 'heeshee-lunge') audio?.heesheeNoise({ kind: 'warble', dist: 1.2, pan: 0, vol: 0.8 });
        if (e === 'heeshee-steal') {
          stolenRef.current = true; setStolen(true); showBugMenu(false);
          bugGuide?.steal();
          audio?.heesheeSting();
          const hm = sceneRef.current?.heeshee, pos = sceneRef.current?.pos;
          if (hm && pos) audio?.heesheeSqueal({ dist: Math.hypot(pos.x - hm.x, pos.y - hm.z), pan: panOf(pos.x, pos.y, sceneRef.current.yaw, hm.x, hm.z), vol: 0.9 });
          setLine(HEESHEE_GONE); setStatus(HEESHEE_GONE);
          api('POST', '/mines/heeshee/steal', { shiftId: shift.shiftId, rulesVersion: 2 }).catch(() => {});
        }
        if (e === 'heeshee-squeal') {
          const hm = sceneRef.current?.heeshee, pos = sceneRef.current?.pos;
          if (hm && pos) audio?.heesheeSqueal({ dist: Math.hypot(pos.x - hm.x, pos.y - hm.z), pan: panOf(pos.x, pos.y, sceneRef.current.yaw, hm.x, hm.z), vol: 0.7 });
        }
        if (e === 'heeshee-gone') setLine(stolenRef.current ? HEESHEE_GONE : 'WHATEVER IT WAS, IT WENT BACK INTO THE DARK.');

      },
    });
    sceneRef.current = scene;
    if (shift.purplePool) scene.addPurple(shift.purplePool);
    chart();
    if (me) scene.setSelf(me);
    if (!bucketShift) scene.setAcid(vein.current.flowing);
    if (bucketShift) scene.setDeposits(shift.pools, shift.currentPoolId);
    if (eggRef.current) { if (eggLocation && Date.now() - shift.localStart < EGG_MS) scene.addEgg(eggLocation); else eggRef.current = null; }
    scene.addFinds(findSpots(maze, shift.seed, [...(shift.pools || chain), eggLocation]));
    scene.clockSkew = shift.startedAt - shift.localStart; // the server's clock from this one, for where the wild bugs have roamed to
    scene.setWilds(shift.wilds || []);
    const wildRetryAt = new Map();
    let askingWild = false;
    window.__forceAskSteeze = () => {
      const w = [...scene.wilds.values()].find((x) => x.species === 'steeze');
      if (w) askWild(w);
    };
    const askWild = (wild) => {
      showPicker(false); showBugMenu(false); scene.heldWild = wild.id;
      if (wild.species === 'dryococelus' && !stickIntroRef.current) {
        const short = stickIntroSeen();
        stickIntroRef.current = { id: wild.id, short };
        scene.introLook = true;
        setStickIntro({ wild, short });
        return;
      }
      wildAskRef.current = { id: wild.id, species: wild.species, level: wild.level, stray: wild.stray, legendary: wild.legendary || wild.species === 'dryococelus', at: Date.now() + (scene.clockSkew || 0) }; setWildAsk(wildAskRef.current);
    };
    const leaveWild = (retryMs) => {
      const ask = wildAskRef.current || stickIntroRef.current; if (!ask) return;
      wildRetryAt.set(ask.id, Date.now() + retryMs); wildAskRef.current = null; setWildAsk(null);
      stickIntroRef.current = null; setStickIntro(null);
      scene.introLook = false; scene.introFlicker = false;
      if (scene.heldWild === ask.id) scene.heldWild = null;
    };
    const meetWild = async (id, bug, at) => {
      askingWild = true;
      try {
        const view = await pvpWild(pvpSend, id, bug, at);
        if (sceneRef.current === scene) onPvp(view);
      } catch (e) {
        if (sceneRef.current !== scene || done.current) return;
        if (!wildRetryAt.has(id)) setLine(e.message === HEESHEE_NO_BATTLE ? HEESHEE_NO_BATTLE : String(e.message).toUpperCase());
        wildRetryAt.set(id, Date.now() + (/another miner is fighting/i.test(e.message) ? 5000 : 1500));
      } finally { askingWild = false; if (scene.heldWild === id) scene.heldWild = null; }
    };
    wildActs.current = {
      fight: (bug) => { const ask = wildAskRef.current; if (!ask) return; wildAskRef.current = null; setWildAsk(null); meetWild(ask.id, bug, ask.at); },
      leave: () => leaveWild(10000), // long enough to walk on past it
      finishStickIntro: () => {
        const intro = stickIntroRef.current, held = intro && scene.wilds.get(intro.id);
        stickIntroRef.current = null; setStickIntro(null);
        scene.introLook = false; scene.introFlicker = false;
        if (held) {
          wildAskRef.current = { id: held.id, species: held.species, level: held.level, stray: held.stray, legendary: true, at: Date.now() + (scene.clockSkew || 0) };
          setWildAsk(wildAskRef.current);
        } else if (scene.heldWild === intro?.id) scene.heldWild = null;
      },
    };
    grabEgg.current = async () => {
      if (eggRef.current !== 'there') return;
      eggRef.current = 'taking'; setEggNear(false);
      try {
        await api('POST', '/mines/egg', { shiftId: shift.shiftId });
        eggRef.current = 'taken'; scene.removeEgg('take'); audio?.chunk();
        setLine('YOU POCKET THE EGG. IT IS WARM. IT KICKED. IT LIVES IN YOUR BARN NOW.');
      } catch { eggRef.current = 'gone'; scene.removeEgg('sink'); }
    };
    if (bucketShift) {
      pvp.current = createPvpClient({
        send: pvpSend, onView: onPvp,
        pose: () => (doomRef.current || done.current ? null : { x: scene.pos.x / TILE, y: scene.pos.y / TILE, yaw: scene.yaw, have: battleRef.current?.rounds.length || 0, dance: danceRef.current }),
        onError: (e) => { if (e.code === 'mine_reload') fail(e); },
      });
    }
    if (horror) {
      const phone = !!window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 720;
      const crew = new Crew(maze.grid, { max: phone ? CREW.maxPhone : CREW.maxDesktop, pool: () => maze.pool });
      scene.setHorror({ crew, flicker: new Flicker({ calm: lowFlashRef.current }) }); crewRef.current = crew;
    }
    lightsOut.current = () => {
      if (!horror || darkRef.current || done.current) return;
      darkRef.current = true; setDark(true); scene.lightsOut(); audio?.lightsOut(); gate.current.arm(Date.now());
      setLine('SOMETHING TRIPPED THE BREAKER. THE ACID IS STILL GLOWING.');
      const seenKey = `bba.horror.seen.${shift.day || new Date().toDateString()}`;
      let seen = false; try { seen = !!localStorage.getItem(seenKey); localStorage.setItem(seenKey, '1'); } catch { /* private mode */ }
      if (!seen) { setBanner(true); setTimeout(() => setBanner(false), 6500); }
    };
    jump.current = () => {
      if (!darkRef.current || scareRef.current || doomRef.current || battleRef.current || done.current) return;
      scareRef.current = Date.now(); setScare(scareRef.current); audio?.sting();
      setTimeout(() => { scareRef.current = 0; setScare(0); }, 900);
    };
    const lightsTimer = horror ? setTimeout(() => lightsOut.current(), Math.max(0, shift.localStart + horror.lightsOutMs - Date.now())) : null;
    if (horror) window.__acidHorror = { lightsOut: () => lightsOut.current(), scare: () => jump.current(), gate: gate.current, get dark() { return darkRef.current; }, get crew() { return crewRef.current; } };
    window.__acidMine = scene; // handy for debugging and automated screenshots; the server still decides everything
    if (heeshee) window.__acidHeeshee = {
      get state() { return heeshee.state; },
      get present() { return heeshee.present; },
      get carrying() { return !!heeshee.carrying; },
      get bugCarried() { return !!scene.bugCarried; },
      get pos() { return { x: heeshee.x, z: heeshee.z }; },
      place(x, z, yaw) { heeshee.state = 'wandering'; heeshee.x = x; heeshee.z = z; if (Number.isFinite(yaw)) heeshee.facing = yaw; heeshee.pause = 0; if (scene.heesheeMesh) scene.heesheeMesh.group.visible = true; },
      lookAt() { /* put it in front of the lamp, a few tiles out */ const d = 3.4; heeshee.x = scene.pos.x - Math.sin(scene.yaw) * d; heeshee.z = scene.pos.y - Math.cos(scene.yaw) * d; heeshee.facing = Math.atan2(scene.pos.x - heeshee.x, scene.pos.y - heeshee.z); heeshee.state = 'wandering'; heeshee.pause = 0.2; if (scene.heesheeMesh) scene.heesheeMesh.group.visible = true; },
      lunge() { heeshee.hasBug = !!(guideRef.current?.armed && guideRef.current.state !== 'stolen'); heeshee.state = 'lunging'; heeshee.lungeT = 0.4; heeshee.events.push('lunge'); },
    };

    window.__acidWorms = { spawn: () => { const w = swarm.current.spawn(); setWorms([...swarm.current.worms]); return w; }, cut: (id) => cutWorm.current(id ?? null), get count() { return swarm.current.worms.length; } };
    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);
    const sync = () => {
      if (tiltActiveRef.current || mapRef.current) return;
      scene.input.f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      scene.input.s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      scene.input.t = (keys.has('arrowright') || keys.has('e') ? 1 : 0) - (keys.has('arrowleft') || keys.has('q') ? 1 : 0);
      scene.input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    };
    const down = (e) => {
      if (battleRef.current) return;
      if (doomRef.current || closing.current || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); if (!e.repeat) showMap(!mapRef.current); return; }
      if (mapRef.current) return;
      if ((k === ' ' || k === 'enter') && e.target.closest?.('button, a')) return;
      if (k === 'f' && !e.repeat) {
        if (liftRef.current) { takeLift.current(); return; }
        if (doorRef.current) { openDoor.current(); return; }
      }
      if (k === 'g' && eggRef.current === 'there') { grabEgg.current(); return; }
      if (k === 'x' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && preyRef.current) { stab(); return; }
      if (k === 'k' && swarm.current.worms.length) { cutWorm.current(null); return; }
      if (stickIntroRef.current && k === 'escape') { wildActs.current?.finishStickIntro(); return; }
      if (wildAskRef.current && (k === 'escape' || /^[1-9]$/.test(k))) { // the wild bug's question: a number sends that bug in, Escape leaves it
        if (k === 'escape') wildActs.current?.leave(); else if (!e.repeat && wildBugs.current[Number(k) - 1]) wildActs.current?.fight(wildBugs.current[Number(k) - 1].id);
        return;
      }
      if (k === 'b' && !e.repeat) { showPicker(!pickerRef.current); return; }
      if (k === 'v' && !e.repeat) {
        if (stolenRef.current || guideRef.current?.state === 'stolen') {
          showBugMenu(false); setLine(HEESHEE_GONE); setStatus(HEESHEE_GONE);
          api('POST', '/mines/bug/order', { shiftId: shift.shiftId, order: 'come', rulesVersion: 2 }).catch(() => {});
          return;
        }
        if (guideRef.current) { showBugMenu(!bugMenuRef.current); return; }
      }
      if (k === 'escape' && bugMenuRef.current) { showBugMenu(false); return; }
      if (bugMenuRef.current && /^[1-4]$/.test(k)) { giveOrder(BUG_ORDERS[Number(k) - 1].id); return; }
      if (k === 'escape' && pickerRef.current) { showPicker(false); return; }
      if (/^[1-9]$/.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) { startDance(DANCES[Number(k) - 1].id); return; }
      if (danceRef.current && ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) stopDance();
      if (k === ' ' || k === 'enter') { if (!errorRef.current) hold(true); e.preventDefault(); return; }
      if (k.startsWith('arrow')) e.preventDefault();
      keys.add(k === 'shift' ? e.code : k); sync();
    };
    const up = (e) => { if (doomRef.current) return; const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter') { release(); return; } keys.delete(k === 'shift' ? e.code : k); sync(); };
    const stopInput = () => { release(); keys.clear(); scene.input.f = scene.input.s = scene.input.t = 0; scene.input.run = false; };
    const hidden = () => { if (document.hidden) stopInput(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', stopInput); document.addEventListener('visibilitychange', hidden);
    // mouse / touch look: drag anywhere on the view
    let drag = null;
    const c = canvas.current;
    let tap = null;
    const pd = (e) => { if (mapRef.current) return; drag = { x: e.clientX, y: e.clientY }; tap = { x: e.clientX, y: e.clientY }; c.setPointerCapture?.(e.pointerId); };
    const pm = (e) => { if (mapRef.current) { drag = tap = null; return; } if (!drag) return; if (scene.dance) { scene.danceOrbit = (scene.danceOrbit || 0) - (e.clientX - drag.x) * 0.006; drag = { x: e.clientX, y: e.clientY }; return; } scene.yaw -= (e.clientX - drag.x) * 0.006; scene.pitch = Math.max(-0.6, Math.min(0.6, scene.pitch - (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; };
    const pu = (e) => { drag = null; if (!mapRef.current && tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8) { if (scene.hitsEgg(e.clientX, e.clientY)) grabEgg.current(); else if (scene.hitsLift(e.clientX, e.clientY)) takeLift.current(); else if (scene.hitsDoor(e.clientX, e.clientY)) openDoor.current(); } tap = null; };
    c.addEventListener('pointerdown', pd); c.addEventListener('pointermove', pm); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu);
    let lastTick = Date.now();
    const caveSeen = new Set(); let caveHold = 0; // the cave-in line stays up a few seconds before the chatter returns
    const tick = setInterval(() => {
      if (!doomRef.current && !done.current && !document.hidden) chart();
      setElapsed(Date.now() - shift.localStart);
      // The purple pool. Everybody passes it; only a bug on a purple shift goes in, when its miner walks by or the backstop runs out.
      const pp = shift.purplePool;
      if (pp && !purpleRef.current && !battleRef.current && !doomRef.current && !done.current) {
        const by = Math.hypot(scene.pos.x / TILE - pp.x, scene.pos.y / TILE - pp.y) < 1.7, name = String(shift.bug?.name || 'YOUR BUG').toUpperCase();
        if (shift.purple && (by || Date.now() - shift.localStart >= shift.purple.afterMs)) {
          purpleRef.current = true; setPurple(1); hold(false); bugGuide?.setPool(pp); // it walks in and drinks,
          setTimeout(() => { if (bugGuide) { bugGuide.slow = 0.4; bugGuide.order('come'); } setPurple(2); }, PURPLE_MS * 0.35); // comes back to you, slowly,
          setTimeout(() => { if (bugGuide) bugGuide.down = true; setPurple(3); }, PURPLE_MS * 0.75); // and falls over
          setLine(by ? `${name} IS HEADING STRAIGHT FOR THE PURPLE STUFF.` : `${name} HAS WANDERED OFF AND FOUND SOMETHING PURPLE.`);
          setTimeout(() => exitShift.current?.(), PURPLE_MS);
        } else if (by && !shift.purple) {
          purpleRef.current = true; // said once
          setLine(shift.bug ? `THAT'S WEIRD. NEVER SEEN ACID LIKE THAT BEFORE. ${name} WON'T GO NEAR IT.` : 'THAT\'S WEIRD. NEVER SEEN ACID LIKE THAT BEFORE.');
        }
      }
      const nowMs = Date.now(), dtMs = Math.min(1000, nowMs - lastTick); lastTick = nowMs;
      const out = maze.dist[Math.round(scene.pos.y / TILE)]?.[Math.round(scene.pos.x / TILE)]; // worms keep to the far tunnels: none at the lift, twice as many at the far end
      const landed = swarm.current.tick(dtMs, { hold: nearRef.current || !!battleRef.current || doomRef.current || done.current || document.hidden, scale: out >= 0 ? 2 * out / farthest(maze) : 1 });
      if (landed) { setWorms([...swarm.current.worms]); audio?.splat(); setLine(WORM_LINES[landed.id % WORM_LINES.length]); }
      if (!landed) { // a cave-in a step or two ahead: say so once (not on the tick a worm lands, or its line would swallow this one)
        const tx = Math.round(scene.pos.x / TILE), ty = Math.round(scene.pos.y / TILE), fx = -Math.sin(scene.yaw), fz = -Math.cos(scene.yaw);
        const [dx, dy] = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
        for (let k = 1; k <= 2; k++) {
          const v = maze.grid[ty + dy * k]?.[tx + dx * k];
          if (v === RUBBLE) { const key = `${tx + dx * k},${ty + dy * k}`; if (!caveSeen.has(key)) { caveSeen.add(key); setLine(CAVE_LINE); caveHold = Date.now() + 4000; } break; }
          if (v !== 0) break;
        }
      }
      if (heeshee?.present) {
        const d = Math.hypot(scene.pos.x - heeshee.x, scene.pos.y - heeshee.z);
        audio?.heesheeDread(proximity(d));
      } else if (heeshee) audio?.heesheeDread(0);
      if (shift.rod) {
        const to = bucketRef.current.pools.find((p) => p.id === bucketRef.current.currentPoolId);
        setRod(to ? rodHeading(maze.grid, { x: Math.round(scene.pos.x / TILE), y: Math.round(scene.pos.y / TILE) }, to, scene.yaw) : null);
      }
      const dv = scene.doorView(), lv = scene.liftView();
      const l = lv.dist < 2.1 && lv.facing > 0.75 && (dv.dist >= 2.1 || lv.facing >= dv.facing);
      if (l !== liftRef.current) { liftRef.current = l; setLiftNear(l); }
      const n = !l && dv.dist < 2.1 && dv.facing > 0.75;
      if (n !== doorRef.current) { doorRef.current = n; setDoorNear(n); }
      const closest = scene.nearestWild();
      if (closest && !battleRef.current && !doomRef.current && !mapRef.current && !scareRef.current && !done.current && !document.hidden) {
        const { wild, tiles } = closest;
        let sighting;
        for (const bug of scene.wilds.values()) {
          if (!explored.current.wilds.has(bug.id) && scene.seesWild(bug)) {
            markWild(explored.current, bug);
            sighting ??= bug;
          }
        }
        if (sighting) {
          saveChart();
          const lean = shift.bug ? edge(typeOf(shift.bug.species), typeOf(sighting.species)) : 0; // your partner's type against its
          setLine(`${sighting.stray ? '' : 'A '}${wildWhat(sighting)} (${TYPES[typeOf(sighting.species)]?.name || 'BUG'}), LEVEL ${sighting.level}, IS IN THE TUNNEL.${lean > 0 ? ' YOUR BUG\'S TYPE BEATS IT.' : lean < 0 ? ' ITS TYPE BEATS YOUR BUG\'S.' : ''}`.toUpperCase());
        }
        const asked = (wildAskRef.current && scene.wilds.get(wildAskRef.current.id)) || (stickIntroRef.current && scene.wilds.get(stickIntroRef.current.id));
        if (wildAskRef.current || stickIntroRef.current) { if (!asked || Math.hypot(scene.pos.x / TILE - asked.x, scene.pos.y / TILE - asked.y) > 2.2) leaveWild(3000); } // walked off: that is a no
        else if (tiles <= 1 && !askingWild && nowMs >= (wildRetryAt.get(wild.id) || 0)) {
          if (stolenRef.current || shift.bugStolen) {
            setLine(HEESHEE_NO_BATTLE); setStatus(HEESHEE_NO_BATTLE);
            wildRetryAt.set(wild.id, nowMs + 4000);
          } else if (canFightWild.current) askWild(wild);
        }
      }
      if (eggRef.current === 'there') {
        if (Date.now() - shift.localStart > EGG_MS) { eggRef.current = 'gone'; scene.removeEgg('sink'); setEggNear(false); }
        else { const ev = scene.eggView(); setEggNear(ev.dist < 1.9 && ev.facing > 0.4); }
      }
    }, 250);
    const flavor = setInterval(() => { if (Date.now() < caveHold) return; const pool = darkRef.current ? HORROR_LINES : visitorHere.current ? VISITOR_LINES : LINES; setLine(pool[Math.floor(Math.random() * pool.length)]); }, 6500);
    return () => {
      client.current?.dispose(); pvp.current?.dispose(); pvp.current = null; exitShift.current = null;
      scene.dispose(); sceneRef.current = null; delete window.__acidMine; delete window.__acidHeeshee; delete window.__acidWorms; window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onPageHide);
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', stopInput); document.removeEventListener('visibilitychange', hidden);
      clearInterval(tick); clearInterval(flavor); clearTimeout(lightsTimer); delete window.__acidHorror; audio?.danceBeat(false);
      audio?.dread(false); audio?.leave(); // clocking out: the normal music comes back
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

  // Horror Night, once the lights are out: screams far off, crying, whispers when one of them is close, and a
  // heartbeat that hammers harder the closer the nearest one is. All synthesized (audio.js), all placed around you.
  useEffect(() => {
    if (!dark || !audio) return;
    const quiet = () => doomRef.current || !!battleRef.current || document.hidden || done.current;
    const around = (r0, r1) => { const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r]; };
    const rel = (m) => { const s = sceneRef.current; if (!s) return [0, -3]; const dx = m.x - s.pos.x, dz = m.z - s.pos.y; return [dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw), -dx * Math.sin(s.yaw) - dz * Math.cos(s.yaw)]; };
    const timers = [];
    const every = (fn, lo, hi, first = lo) => { let id; const go = (ms) => { id = setTimeout(() => { if (!quiet()) fn(); go(lo + Math.random() * (hi - lo)); }, ms); timers.push(() => clearTimeout(id)); }; go(first + Math.random() * (hi - lo) * 0.3); };
    every(() => audio.scream(...around(16, 30)), 16000, 38000, 5000);
    every(() => audio.sob(...around(7, 15)), 20000, 42000, 11000);
    every(() => { const m = crewRef.current?.nearest(); if (m && m.dist < 7) audio.whisper(...rel(m)); }, 5000, 11000, 3000);
    let hb;
    const beat = () => {
      const c = crewRef.current?.closeness || 0;
      horrorEl.current?.style.setProperty('--near', c.toFixed(2));
      if (c > 0.05 && !quiet()) audio.thump(c);
      hb = setTimeout(beat, c > 0.05 ? 60000 / (62 + 78 * c) : 700);
    };
    hb = setTimeout(beat, 1500);
    return () => { for (const t of timers) t(); clearTimeout(hb); };
  }, [dark, audio]);
  const toggleFlash = () => {
    const v = !lowFlashRef.current; lowFlashRef.current = v; setLowFlash(v);
    try { localStorage.setItem(LOW_FLASH_KEY, v ? '1' : '0'); } catch { /* private mode */ }
    if (sceneRef.current?.horror) sceneRef.current.horror.flicker.calm = v;
  };

  // geiger clicks: they land at random like the real thing, on average every 1400 ms at one bar down to every 60 ms
  // at ten, with a small directional boost. Read live values so turning never restarts the timer.
  useEffect(() => {
    if (!audio) return;
    const wait = () => {
      const { bars, facing } = geiger.current;
      const mean = 1400 * (60 / 1400) ** ((bars - 1) / 9) / (1 + 0.2 * facing);
      return Math.max(12, -Math.log(1 - Math.random()) * mean);
    };
    let id = setTimeout(function click() { if (!doomRef.current) audio.tick(geiger.current.bars === 10 ? 1.3 : 1); id = setTimeout(click, wait()); }, wait());
    return () => clearTimeout(id);
  }, [audio]);

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
    let cancelled = false, timer;
    const go = async () => {
      if (done.current || cancelled) return;
      setStatus('WEIGHING YOUR BUCKET…');
      const ok = await onFinish();
      if (ok) done.current = true; else if (!cancelled) timer = setTimeout(go, 800);
    };
    go();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [progress >= 1]);

  const secs = Math.floor(elapsed / 1000);
  return (
    <><div className={`m-play${dark ? ' horror' : ''}${scare && !lowFlash ? ' m-shake' : ''}`}>
      <canvas ref={canvas} className="m-canvas" aria-label="First-person view of the mine tunnels" />
      {tier && <div className="m-dark" style={{ '--dark': [0, 0.15, 0.35, 0.65, 1][tier.tier - 1] }} aria-hidden="true" />}
      <Worms worms={worms} cutting={cutting} onCut={(id, a) => cutWorm.current(id, a)} />
      <div className="m-hud tl">{tier && <TierBadge tier={tier.tier} />}<div>SHIFT TIME {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</div><div className="m-dim">{near && progress < 1 && status === 'FIND THE ACID POOL' ? 'ACID FOUND. FILL THE BUCKET.' : status}</div>{shift.bug?.gym && !stolen && <GymChip gym={shift.bug.gym} />}{otherMiners && <div className="m-others" data-test="others">{otherMiners}</div>}</div>
      <div className="m-hud tr">
        <div className={`geiger ${bars >= 8 ? 'hot' : bars >= 5 ? 'warm' : ''}`}>ACID {'▮'.repeat(bars)}{'▯'.repeat(10 - bars)}</div>
        {rod != null && <div className="m-rod" data-test="rod">ROD <b aria-label={['ahead', 'ahead and right', 'right', 'behind and right', 'behind', 'behind and left', 'left', 'ahead and left'][rod]}>{'↑↗→↘↓↙←↖'[rod]}</b></div>}
        {bucket.peek != null && <div className="m-rod" data-test="peek">NEXT POOL <b>{Math.round(bucket.peek)}</b></div>}
        {bucketShift && <div className="m-bucket-status" data-test="bucket-status">
          <span>{bucket.capacity > 100 ? 'HAUL' : 'BUCKET'} {Math.floor(bucket.collected)} / {bucket.capacity}{bucket.rich > 1.004 && <span className="m-rich" data-test="bucket-rich"> · ACID ×{bucket.rich.toFixed(2)}</span>}</span>
          <div className="m-bucket" role="progressbar" aria-label="Acid collected" aria-valuemin={0} aria-valuemax={bucket.capacity} aria-valuenow={bucket.collected}><div style={{ width: `${progress * 100}%` }} /></div>
        </div>}
        <button className="m-link" disabled={clockingOut} onClick={() => clockOut()}>{clockingOut ? 'WEIGHING…' : 'CLOCK OUT'}</button>
        {dark && <button className="m-link m-flash-btn" data-test="flash-toggle" aria-pressed={lowFlash} onClick={toggleFlash}>{lowFlash ? 'FLASHING: LOW' : 'FLASHING: ON'}</button>}
        {!doom && !battle && <div className="m-tools">
          <button ref={mapButton} className="m-link" data-test="map-button" aria-haspopup="dialog" aria-expanded={mapOpen} disabled={clockingOut} onClick={() => showMap(true)}>MAP<span className="m-key"> M</span></button>
          <button className={`m-link m-dance-btn${dance ? ' on' : ''}`} data-test="dance-btn" aria-expanded={picker} aria-label={dance ? 'Stop dancing' : 'Dance'}
            onClick={() => (dance ? stopDance() : showPicker(!picker))}>{dance ? '■ STOP' : '♫ DANCE'}<span className="m-key"> B</span></button>
          {shift.bug && !stolen && <button className={`m-link m-dance-btn${bugMenu ? ' on' : ''}`} data-test="bug-btn" aria-expanded={bugMenu} aria-label="Tell your bug what to do"
            onClick={() => showBugMenu(!bugMenu)}>🐞 BUG<span className="m-key"> V</span></button>}
        </div>}
      </div>
      {picker && !doom && !battle && <DancePicker current={dance} onPick={startDance} onClose={() => showPicker(false)} />}
      {mineError && <div className="m-recovery" role="alert">
        <span>{mineError.message}</span>
        <button className="m-btn" disabled={clockingOut} onClick={mineError.code === 'mine_reload' ? () => window.location.reload() : retry}>{mineError.code === 'mine_reload' ? 'RELOAD' : 'RETRY'}</button>
      </div>}
      {stolen && <div className="m-stolen" data-test="heeshee-stolen" role="status">Your bug is nowhere to be found. The Heeshee Mazode took it.</div>}
      <div className="m-ticker" aria-live="polite">{line}</div>
      {prey && !battle && !doom && !mapOpen && (
        <div className="m-door-prompt m-stab" data-test="ambush-prompt">
          <span className="m-dim">{prey.name.toUpperCase()} HASN'T SEEN YOU.</span>
          <button className="m-btn" aria-keyshortcuts="X" disabled={clockingOut} onClick={stab} data-test="ambush">ASSASSINATE<span className="m-key"> · X</span></button>
        </div>
      )}
      {near && !prey && !dance && (
        <div className="m-mine">
          {!bucketShift && <div className="m-bucket"><div style={{ width: `${progress * 100}%` }} /></div>}
          <button className={`m-btn big ${holding ? 'on' : ''}`} disabled={!!mineError || clockingOut} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); hold(true); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }} onBlur={release}>
            {progress >= 1 ? 'BUCKET FULL' : holding ? 'MINING…' : 'HOLD TO MINE'}
          </button>
          <div className="m-dim small">or hold SPACE</div>
        </div>
      )}
      {eggNear && !doom && !near && !prey && !dance && (
        <div className="m-door-prompt" data-test="egg-prompt">
          <span className="m-dim">AN EGG. STILL WARM.</span>
          <button className="m-btn" onClick={() => grabEgg.current()} data-test="egg-take">[ PICK IT UP ]</button>
          <span className="m-dim small">or press G</span>
        </div>
      )}
      {liftNear && !doom && !battle && !near && !eggNear && !prey && !dance && (
        <div className="m-door-prompt" data-test="lift-prompt">
          <span className="m-dim">IT PASSED AN INSPECTION. ONCE.</span>
          <button className="m-btn" disabled={clockingOut} onClick={() => takeLift.current()} data-test="lift-up">{clockingOut ? 'WEIGHING…' : '[ LIFT TO SURFACE ]'}</button>
          <span className="m-dim small">Clock out · game room · F</span>
        </div>
      )}
      {doorNear && !doom && !battle && !near && !eggNear && !prey && !dance && (
        <div className="m-door-prompt" data-test="door-prompt">
          <span className="m-dim">A DOOR. VOICES BEHIND IT.</span>
          <button className="m-btn" onClick={() => openDoor.current()} data-test="door-open">[ OPEN THE DOOR ]</button>
          <span className="m-dim small">or press F</span>
        </div>
      )}
      <div ref={dreadEl} className={`m-dread ${visitor ? 'on' : ''}`} aria-hidden="true" />
      {horror && <div ref={horrorEl} className={`m-horror-veil${dark ? ' on' : ''}`} aria-hidden="true" />}
      {banner && <div className="m-horror-banner" role="status" data-test="horror-banner">The lights feel wrong tonight…</div>}
      {scare > 0 && <JumpScare key={scare} calm={lowFlash} />}
      {purple && <div className={`m-purple${lowFlash ? ' calm' : ''}`} role="status" data-test="purple"><p>{String(shift.bug?.name || 'Your bug').toUpperCase()} {[, 'IS DRINKING IT.', 'IS COMING BACK. SLOWLY.', 'HAS FALLEN OVER.'][purple]}</p></div>}
      {mapOpen && <MineMap maze={maze} explored={explored.current} pools={mapPools()} wilds={[...explored.current.wilds].map(id => sceneRef.current?.wilds.get(id)).filter(Boolean)}
        pose={chartPosition()} onClose={() => showMap(false)} returnFocus={mapButton} />}
      {doom && <DoorHall elapsedMs={elapsed} onExit={closeDoor} />}
      {battle && <Bout key={battle.id} bout={battle} reduced={!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches} onLine={battleMove} onForfeit={battleForfeit} onJar={battleJar} onClose={battleDone} closeLabel={battle.result === 'won' ? 'Back to mining' : 'Continue'} />}
      <div className="m-movement" inert={doom || battle ? '' : undefined} aria-hidden={doom || battle || undefined}>
        <TiltControls onInput={move} onActiveChange={setTiltMode} paused={holding || doom || !!battle || mapOpen} />
        {!tiltActive && <MovePad apply={move} />}
      </div>
    </div>
    {bugMenu && !doom && !battle && <BugOrders current={bugOrder} onPick={giveOrder} onClose={() => showBugMenu(false)} />}
    {stickIntro && !doom && !battle && <StickIntro short={stickIntro.short} onDone={() => wildActs.current?.finishStickIntro()} onScratch={() => audio?.stickScratch()} onFlicker={(on) => { if (sceneRef.current) sceneRef.current.introFlicker = on; }} />}
    {wildAsk && !stickIntro && !doom && !battle && <WildPrompt wild={wildAsk} bugsRef={wildBugs} onFight={(bug) => wildActs.current?.fight(bug)} onLeave={() => wildActs.current?.leave()} />}</>
  );
}

/** A wild bug within reach: fight it, and with which of your bugs, or leave it. Numbers pick while it is open; Escape leaves. */
function WildPrompt({ wild, bugsRef, onFight, onLeave }) {
  const [bugs, setBugs] = useState(null);
  useEffect(() => {
    let on = true;
    const show = (list) => { if (on) { bugsRef.current = list; setBugs(list); } };
    api('GET', '/barn').then((b) => show((b.stable?.bugs || []).filter((bug) => bug.stage === 'creature' && !bug.fainted))).catch(() => show([]));
    return () => { on = false; bugsRef.current = []; };
  }, [wild.id]);
  const type = typeOf(wild.species);
  return (
    <div className="m-dances m-orders m-wild" role="dialog" aria-label="A wild bug" data-test="wild-prompt">
      <div className="m-wild-card" data-test="wild-card"><BugCard species={wild.species} bug={{ name: wild.stray?.name || BY_ID[wild.species]?.name, level: wild.level }} /></div>
      <p className="m-wild-what">{(wild.stray ? '' : 'A ') + wildWhat(wild).toUpperCase()} · {(TYPES[type]?.name || 'BUG').toUpperCase()} · LEVEL {wild.level}. {bugs === null ? 'IT WAITS.' : bugs.length ? 'SEND IN:' : 'NONE OF YOUR BUGS CAN FIGHT.'}</p>
      {(bugs || []).map((bug, i) => { const lean = edge(typeOf(bug.species), type); return (
        <button key={bug.id} type="button" className="m-dance" data-test="wild-send" onClick={() => onFight(bug.id)}>
          <span className="m-dance-icon" aria-hidden="true">{lean > 0 ? '▲' : lean < 0 ? '▼' : '◆'}</span>
          <span className="m-dance-name">{bug.name.toUpperCase()} · {(TYPES[typeOf(bug.species)]?.name || '').toUpperCase()} · LV {bug.level}{lean > 0 ? ` · BEATS ${(TYPES[type]?.name || '').toUpperCase()}` : lean < 0 ? ` · LOSES TO ${(TYPES[type]?.name || '').toUpperCase()}` : ''}</span><span className="m-key">{i + 1}</span>
        </button>); })}
      <button type="button" className="m-dance" data-test="wild-leave" onClick={onLeave}><span className="m-dance-icon" aria-hidden="true">✕</span><span className="m-dance-name">LEAVE IT</span><span className="m-key">ESC</span></button>
    </div>
  );
}

/** v89: nine dances in a 3×3 grid. Number keys 1–9 do the same without opening it. */
function DancePicker({ current, onPick, onClose }) {
  const first = useRef(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="m-dances" role="dialog" aria-label="Dance" data-test="dance-picker" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {DANCES.map((d, i) => (
        <button key={d.id} ref={i === 0 ? first : null} type="button" className={`m-dance${current === d.id ? ' on' : ''}`} data-test={`dance-${d.id}`} onClick={() => onPick(d.id)}>
          <span className="m-dance-icon" aria-hidden="true">{d.icon}</span><span className="m-dance-name">{d.name}</span><span className="m-key">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

/** The BUG menu: four orders for your guide. Opens like the dance picker; 1 to 4 pick while it is open. */
function BugOrders({ current, onPick, onClose }) {
  const first = useRef(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="m-dances m-orders" role="dialog" aria-label="Tell your bug" data-test="bug-orders" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {BUG_ORDERS.map((o, i) => (
        <button key={o.id} ref={i === 0 ? first : null} type="button" className={`m-dance${current === o.id ? ' on' : ''}`} aria-pressed={current === o.id} data-test={`bug-order-${o.id}`} onClick={() => onPick(o.id)}>
          <span className="m-dance-icon" aria-hidden="true">{o.icon}</span><span className="m-dance-name">{o.name}</span><span className="m-key">{i + 1}</span>
        </button>
      ))}
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

const PURPLE_MS = 8000; // from the bug going for the purple acid to the shift ending

/** The shift ended because the partner drank purple acid. One way out. */
function Sick({ sick }) {
  const r = sick.result;
  return (
    <main className="m-result m-sick" data-test="sick">
      <div className="hazard-bar" />
      <p className="m-sub">SHIFT REPORT</p>
      <h1 className="m-title">{String(sick.name).toUpperCase()} {sick.taken ? 'LEFT WITH SOMEONE' : 'IS NOT WELL'}</h1>
      <p className="m-story">{sick.taken ? 'He was waiting at the lift. It went without being asked. He left a ticket.' : 'It drank something purple. The shift is over.'}</p>
      {r && <p className="m-dim">{sick.taken ? 'THE SHIFT PAID' : 'THE ACID YOU HAD STILL PAID'} +${r.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>}
      <div className="m-actions">
        <button className="m-btn" onClick={() => navigate('/barn/center')}>[ BUG CENTER ]</button>
      </div>
    </main>
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
      {r.pvp ? <div className="m-pay lost" data-test="pvp-loss">−${r.pvp.cash.toLocaleString('en-US')}</div> : <div className="m-pay">+${r.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>}
      {r.pvp && <p className="m-twin" data-test="pvp-receipt">{r.pvp.by.toUpperCase()} TOOK {r.pvp.cash ? `$${r.pvp.cash}` : 'NO CASH (YOU HIT TODAY\'S LOSS CAP)'}{r.pvp.acid ? `, ${Math.floor(r.pvp.acid)} ACID` : ''}{r.pvp.tobacco?.length ? ` AND YOUR ${r.pvp.tobacco.map((t) => t.toUpperCase()).join(', ')}` : ''}. NO PAY FOR THIS SHIFT.</p>}
      {r.pvp?.fainted && <p className="m-twin" data-test="pvp-fainted">{typeof r.pvp.fainted === 'string' ? r.pvp.fainted.toUpperCase() : 'YOUR BUG'} FAINTED. <button className="m-link" onClick={() => navigate('/barn/center')}>BUG CENTER ►</button></p>}
      {r.twin && <p className="m-twin" data-test="twin">THE OTHER FAUN WAS WAITING AT THE ELEVATOR. HE TOOK ${r.twin.took.toLocaleString('en-US', { maximumFractionDigits: 2 })} AND SAID THANK YOU.</p>}
      {r.capacity != null && <p className="m-dim">{r.collected.toLocaleString('en-US', { maximumFractionDigits: 2 })} / {r.capacity} UNITS COLLECTED{r.rich ? <span data-test="result-rich"> · ACID QUALITY ×{r.rich.toFixed(2)}</span> : null}</p>}
      {r.bugReturned && <p className={`m-dim m-bug-back${r.bugShaken ? ' shaken' : ''}`} data-test="heeshee-return">YOUR BUG IS BACK. HE'S SHAKEN UP, BUT THE CIGARETTES HELPED.</p>}
      <p className="m-dim">BANKROLL NOW ${r.bankroll.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
      <div className="m-actions">
        <button className="m-btn" disabled={starting} onClick={onAgain}>[ ANOTHER SHIFT{fare ? ` · $${fare} FARE` : ''} ]</button>
        <button className="m-btn ghost" disabled={starting} onClick={onLeave}>[ BACK TO THE CARD ROOM ]</button>
      </div>
    </main>
  );
}
