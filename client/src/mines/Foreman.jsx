// v45: the Foreman's rage cutscene. Visual-novel style: his lines type out with a grunt per few letters (no voice),
// tap or NEXT to advance, a yell shakes the screen. Then a mental-arithmetic problem held by the server; a wrong
// answer gets a jab and a new problem. Paid departures end after the dialogue, without math.
// Music and grunts only play when the mines ♪ toggle is on.
import React, { useEffect, useRef, useState } from 'react';
import { api, refreshSession } from '../api.js';
import { emptyTypingTrace, recordTypingInput, publicTypingTrace, endTypingComposition } from '../../../server/foremanTyping.js';
import { reducedMotion } from '../themes/store.js';
import { ForemanScene } from './foremanScene.js';
import { ForemanAudio } from './foremanAudio.js';
import './foreman.css';

const isYell = (s) => /!/.test(s) && s.replace(/[^A-Za-z]/g, '').replace(/[a-z]/g, '').length >= 4;
const CPS = 38;

export default function Foreman({ pending, sound, onDone }) {
  const farewell = pending.reason === 'paid' || pending.reason === 'heeshee';
  const typingTest = pending.kind === 'typing' || pending.reason === 'heeshee-quit';
  const prompt = pending.prompt || '';
  const canvas = useRef(null), scene = useRef(null), audio = useRef(null), input = useRef(null), starting = useRef(null), strokes = useRef(emptyTypingTrace());
  const still = useRef(reducedMotion()).current;
  const [lines] = useState(pending.lines);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState(lines[0]);
  const [shown, setShown] = useState(0);
  const [shake, setShake] = useState(false);
  const [stage, setStage] = useState('talk'); // talk | math | typing | done
  const [problem, setProblem] = useState(pending.problem);
  const [answer, setAnswer] = useState('');
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [nowTick, setNowTick] = useState(0);
  const [grade, setGrade] = useState(null); // last fail or pass from the server
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  // The speed needed comes from the server, which decides "phone" from the request (temporary 35 WPM phone pace).
  const [pace, setPace] = useState({ wpm: pending.wpm || 80, phone: !!pending.phonePace });
  const paceFrom = (r) => { if (r?.wpm) setPace({ wpm: r.wpm, phone: !!r.phonePace }); };
  useEffect(() => {
    if (!typingTest || !pending.id) return;
    api('GET', '/mines/foreman').then((r) => { if (r?.pending?.id === pending.id) paceFrom(r.pending); }).catch(() => {});
  }, [pending.id]);
  if (!audio.current) audio.current = new ForemanAudio();

  useEffect(() => {
    scene.current = new ForemanScene(canvas.current, { still });
    const onR = () => scene.current?.resize(); window.addEventListener('resize', onR);
    return () => { window.removeEventListener('resize', onR); scene.current?.dispose(); audio.current?.dispose(); };
  }, []);
  useEffect(() => { audio.current.music(sound); }, [sound]);
  useEffect(() => {
    if (stage !== 'typing' || !startedAt || grade) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [stage, startedAt, grade]);

  // typewriter: a grunt every few letters, the mouth opens with each grunt
  useEffect(() => {
    if (shown >= text.length) { if (scene.current) scene.current.mouth = 0; return; }
    const id = setTimeout(() => {
      const n = shown + 1, ch = text[n - 1];
      if (n === 1 && isYell(text)) { if (!still) { setShake(true); setTimeout(() => setShake(false), 450); } if (scene.current) scene.current.yell = 1; if (sound) audio.current.grunt(true); }
      else if (n % 4 === 1 && /\w/.test(ch) && sound) audio.current.grunt(false);
      if (scene.current) scene.current.mouth = /\w/.test(ch) ? (n % 4 < 2 ? 1 : 0.35) : 0.1;
      setShown(n);
    }, 1000 / CPS);
    return () => clearTimeout(id);
  }, [shown, text, sound]);

  const say = (s) => { setText(s); setShown(0); };
  const typing = shown < text.length;
  function next() {
    if (typing) { setShown(text.length); return; }
    if (stage !== 'talk') return;
    if (idx + 1 < lines.length) { setIdx(idx + 1); say(lines[idx + 1]); }
    else if (farewell) onDone();
    else if (typingTest) { setStage('typing'); setTyped(''); setGrade(null); setStartedAt(null); say(pace.phone ? `Type it. Mean it. On that phone, ${pace.wpm} a minute today, ninety-five percent.` : 'Type it. Mean it. Eighty a minute, ninety-five percent.'); setTimeout(() => input.current?.focus(), 80); }
    else { setStage('math'); setAnswer(''); say(problem.word ? 'Word problem. Listen close, sport:' : `Quick now: what's ${problem.text}?`); setTimeout(() => input.current?.focus(), 80); }
  }
  function blockPaste(e) { e.preventDefault(); }
  function resetTrace() { strokes.current = emptyTypingTrace(); }
  // React 19's onBeforeInput is still backed by textInput/keypress and has no inputType,
  // so a synthetic handler never counts inserts (trace.inserts stays 0 → 'keys' fail).
  // A native beforeinput listener gets the real inputType/data, including 2-char inserts
  // (double-space period). Paste, drop, and replacement stay blocked via preventDefault.
  useEffect(() => {
    if (stage !== 'typing') return undefined;
    const el = input.current;
    if (!el) return undefined;
    const onBeforeInput = (e) => {
      if (recordTypingInput(strokes.current, e.inputType, e.data).blocked) e.preventDefault();
    };
    const onCompositionEnd = () => endTypingComposition(strokes.current);
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('compositionend', onCompositionEnd);
    return () => { el.removeEventListener('beforeinput', onBeforeInput); el.removeEventListener('compositionend', onCompositionEnd); };
  }, [stage]);
  async function beginTyping() {
    if (startedAt) return startedAt;
    if (starting.current) return starting.current;
    starting.current = (async () => {
      const r = await api('POST', '/mines/foreman/typing/start', { id: pending.id });
      paceFrom(r);
      const at = r.startedAt || Date.now();
      setStartedAt(at);
      setNowTick(Date.now());
      setGrade(null);
      return at;
    })();
    try { return await starting.current; }
    catch (err) { say(err.message); return null; }
    finally { starting.current = null; }
  }
  async function onTyped(e) {
    const v = e.target.value;
    setTyped(v);
    if (!startedAt && v) beginTyping();
  }
  const elapsedMin = startedAt ? Math.max(0.001, ((nowTick || Date.now()) - startedAt) / 60000) : 0;
  const liveWpm = startedAt && typed.length ? (typed.length / 5) / elapsedMin : 0;
  const liveAcc = (() => {
    if (!typed.length) return 1;
    let ok = 0;
    for (let i = 0; i < typed.length; i++) if (typed[i] === prompt[i]) ok++;
    return ok / typed.length;
  })();
  async function submitTyping(e) {
    e?.preventDefault?.();
    if (busy || !typed) return;
    let start = startedAt;
    if (!start) start = await beginTyping();
    if (!start) return;
    setBusy(true);
    try {
      const r = await api('POST', '/mines/foreman/typing/submit', { id: pending.id, text: typed, trace: publicTypingTrace(strokes.current) });
      if (r.passed) { setDone(r); setGrade(r); setStage('done'); setText(r.line); setShown(r.line.length); audio.current.music(false); }
      else {
        setGrade(r); setStartedAt(null); setTyped(''); resetTrace();
        setText(r.jab); setShown(r.jab.length);
        if (scene.current) scene.current.yell = 1;
        if (!still) { setShake(true); setTimeout(() => setShake(false), 450); }
        if (sound) audio.current.grunt(true);
        setTimeout(() => input.current?.focus(), 30);
      }
    } catch (err) { say(err.message); }
    finally { setBusy(false); }
  }
  function retryTyping() {
    setTyped(''); setGrade(null); setStartedAt(null); setDone(null); resetTrace();
    say('Again. From the top. And do not paste.');
    setTimeout(() => input.current?.focus(), 30);
  }
  async function submit(e) {
    e.preventDefault(); if (busy || !/^\d{1,6}$/.test(answer.trim())) return;
    setBusy(true);
    try {
      const r = await api('POST', '/mines/foreman/answer', { id: pending.id, answer: answer.trim() });
      setAnswer('');
      if (r.correct) { setDone(r); setStage('done'); say(r.line); audio.current.music(false); refreshSession(); }
      else { setProblem(r.problem); say(r.jab); if (scene.current) scene.current.yell = 1; if (!still) { setShake(true); setTimeout(() => setShake(false), 450); } if (sound) audio.current.grunt(true); setTimeout(() => input.current?.focus(), 30); }
    } catch (err) { say(err.message); } finally { setBusy(false); }
  }

  const who = typingTest ? 'THE FOREMAN  ·  EXTRA MAD' : 'THE FOREMAN';
  const promptChars = prompt.split('').map((ch, i) => {
    const got = typed[i];
    const cls = got == null ? 'wait' : got === ch ? 'ok' : 'bad';
    return <i key={i} className={cls}>{ch}</i>;
  });
  return (
    <div className={`fm ${shake && !still ? 'shaking' : ''}${typingTest ? ' fm-mad' : ''}`} data-stage={stage} data-test={typingTest ? 'fm-typing' : undefined} role="dialog" aria-modal="true" aria-label="The foreman">
      <canvas ref={canvas} className="fm-stage" aria-hidden="true" onClick={stage === 'talk' ? next : undefined} />
      <div className="fm-box" onClick={stage === 'talk' ? next : undefined} onKeyDown={undefined}>
        <div className="fm-who">{who}{stage === 'talk' && <span className="fm-count">{idx + 1}/{lines.length}</span>}</div>
        <p className="fm-line" aria-live="polite">{text.slice(0, shown)}<span className="fm-ghost">{text.slice(shown)}</span></p>
        {stage === 'talk' && <button autoFocus className="m-btn fm-next" onClick={(e) => { e.stopPropagation(); next(); }}>{typing ? '[ SKIP ]' : farewell && idx === lines.length - 1 ? '[ BACK HOME ]' : '[ NEXT ▸ ]'}</button>}
        {stage === 'typing' && (
          <form className="fm-type" onSubmit={submitTyping} autoComplete="off">
            <div className="fm-prompt" data-test="fm-prompt" aria-hidden="true">{promptChars}</div>
            <label className="sr-only" htmlFor="fm-type-input">Type the Foreman's sentence</label>
            <textarea
              id="fm-type-input"
              ref={input}
              data-test="fm-type-input"
              value={typed}
              onChange={onTyped}
              onPaste={blockPaste}
              onDrop={blockPaste}
              onContextMenu={blockPaste}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autocapitalize="off"
              autocorrect="off"
              rows={3}
              enterKeyHint="done"
            />
            <div className="fm-stats" aria-live="polite">
              <span data-test="fm-wpm">WPM <b className={liveWpm >= pace.wpm ? 'ok' : 'wait'}>{startedAt ? liveWpm.toFixed(0) : '—'}</b></span>
              <span data-test="fm-acc">ACC <b className={liveAcc >= (pending.accuracy || 0.95) ? 'ok' : 'wait'}>{typed ? `${Math.round(liveAcc * 100)}%` : '—'}</b></span>
              <span className="fm-need" data-test="fm-need" data-phone={pace.phone ? '1' : undefined}>{pace.phone ? `Phone pace: ${pace.wpm} WPM today` : `${pace.wpm} WPM`} · {Math.round((pending.accuracy || 0.95) * 100)}%</span>
            </div>
            {grade && !grade.passed && <p className="fm-jab" data-test="fm-typing-result">{grade.jab} ({grade.wpm} WPM, {Math.round((grade.accuracy || 0) * 100)}%)</p>}
            <div className="fm-type-actions">
              <button className="m-btn" type="submit" data-test="fm-typing-submit" disabled={busy || !typed}>{busy ? '[ WAIT ]' : '[ SUBMIT ]'}</button>
              {grade && !grade.passed && <button className="m-btn" type="button" data-test="fm-typing-retry" onClick={retryTyping}>[ TRY AGAIN ]</button>}
            </div>
          </form>
        )}
        {stage === 'math' && (
          <form className="fm-math" onSubmit={submit}>
            <label htmlFor="fm-ans" className={`fm-q ${problem.word ? 'word' : ''}`} data-test="fm-q">{problem.word ? problem.text : `${problem.text} =`}</label>
            <input id="fm-ans" ref={input} inputMode="numeric" autoComplete="off" maxLength={6} value={answer} onChange={(e) => setAnswer(e.target.value.replace(/[^\d]/g, ''))} />
            <button className="m-btn" disabled={busy || !answer}>[ ANSWER ]</button>
          </form>
        )}
        {stage === 'done' && (
          <div className="fm-math">
            {typingTest
              ? <span className="fm-q" data-test="fm-typing-pass">{done.wpm} WPM · {Math.round((done.accuracy || 0) * 100)}% · CLEARED</span>
              : <span className="fm-q">{done.bonus ? `+$${done.bonus} "CAN COUNT" BONUS` : 'NO BONUS AFTER A MISS'}</span>}
            <button className="m-btn" data-test="fm-typing-done" onClick={() => onDone(done)}>[ BACK TO THE MINE ]</button>
          </div>
        )}
      </div>
    </div>
  );
}
