// v45: the Foreman's rage cutscene. Visual-novel style: his lines type out with a grunt per few letters (no voice),
// tap or NEXT to advance, a yell shakes the screen. Then a mental-arithmetic problem held by the server; a wrong
// answer gets a jab and a new problem. Paid departures end after the dialogue, without math.
// Music and grunts only play when the mines ♪ toggle is on.
import React, { useEffect, useRef, useState } from 'react';
import { api, refreshSession } from '../api.js';
import { reducedMotion } from '../themes/store.js';
import { ForemanScene } from './foremanScene.js';
import { ForemanAudio } from './foremanAudio.js';
import './foreman.css';

const isYell = (s) => /!/.test(s) && s.replace(/[^A-Za-z]/g, '').replace(/[a-z]/g, '').length >= 4;
const CPS = 38;

export default function Foreman({ pending, sound, onDone }) {
  const farewell = pending.reason === 'paid';
  const canvas = useRef(null), scene = useRef(null), audio = useRef(null), input = useRef(null);
  const still = useRef(reducedMotion()).current;
  const [lines] = useState(pending.lines);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState(lines[0]);
  const [shown, setShown] = useState(0);
  const [shake, setShake] = useState(false);
  const [stage, setStage] = useState('talk'); // talk | math | done
  const [problem, setProblem] = useState(pending.problem);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  if (!audio.current) audio.current = new ForemanAudio();

  useEffect(() => {
    scene.current = new ForemanScene(canvas.current, { still });
    const onR = () => scene.current?.resize(); window.addEventListener('resize', onR);
    return () => { window.removeEventListener('resize', onR); scene.current?.dispose(); audio.current?.dispose(); };
  }, []);
  useEffect(() => { audio.current.music(sound); }, [sound]);

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
    else { setStage('math'); setAnswer(''); say(problem.word ? 'Word problem. Listen close, sport:' : `Quick now: what's ${problem.text}?`); setTimeout(() => input.current?.focus(), 80); }
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

  const who = 'THE FOREMAN';
  return (
    <div className={`fm ${shake && !still ? 'shaking' : ''}`} data-stage={stage} role="dialog" aria-modal="true" aria-label="The foreman">
      <canvas ref={canvas} className="fm-stage" aria-hidden="true" onClick={next} />
      <div className="fm-box" onClick={stage === 'talk' ? next : undefined} onKeyDown={undefined}>
        <div className="fm-who">{who}{stage === 'talk' && <span className="fm-count">{idx + 1}/{lines.length}</span>}</div>
        <p className="fm-line" aria-live="polite">{text.slice(0, shown)}<span className="fm-ghost">{text.slice(shown)}</span></p>
        {stage === 'talk' && <button autoFocus className="m-btn fm-next" onClick={(e) => { e.stopPropagation(); next(); }}>{typing ? '[ SKIP ]' : farewell && idx === lines.length - 1 ? '[ BACK HOME ]' : '[ NEXT ▸ ]'}</button>}
        {stage === 'math' && (
          <form className="fm-math" onSubmit={submit}>
            <label htmlFor="fm-ans" className={`fm-q ${problem.word ? 'word' : ''}`} data-test="fm-q">{problem.word ? problem.text : `${problem.text} =`}</label>
            <input id="fm-ans" ref={input} inputMode="numeric" autoComplete="off" maxLength={6} value={answer} onChange={(e) => setAnswer(e.target.value.replace(/[^\d]/g, ''))} />
            <button className="m-btn" disabled={busy || !answer}>[ ANSWER ]</button>
          </form>
        )}
        {stage === 'done' && (
          <div className="fm-math">
            <span className="fm-q">{done.bonus ? `+$${done.bonus} "CAN COUNT" BONUS` : 'NO BONUS AFTER A MISS'}</span>
            <button className="m-btn" onClick={() => onDone(done)}>[ BACK HOME ]</button>
          </div>
        )}
      </div>
    </div>
  );
}
