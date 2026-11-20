import { useEffect, useState } from 'react';
import { computeEquity, equityFacts, formatEquity, madeHandName } from '../../../server/engine/equity.js';

let worker = null;
let workerOk = true;
let seq = 0;

function getWorker() {
  if (worker || !workerOk) return worker;
  if (typeof Worker === 'undefined') { workerOk = false; return null; }
  try {
    worker = new Worker(new URL('./equity.worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => { workerOk = false; worker?.terminate(); worker = null; };
    return worker;
  } catch {
    workerOk = false;
    return null;
  }
}

function runEquity(input) {
  const w = getWorker();
  if (!w) return Promise.resolve(computeEquity(input));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      if (e.data?.id !== id) return;
      w.removeEventListener('message', onMsg);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, input });
  });
}

function factKey(f) {
  return f ? `${f.hole.join(' ')}|${f.board.join(' ')}|${f.opponents}` : '';
}

/** Live equity bar for the viewing player only. Hidden when folded, not in a hand, or during showdown. */
export function useHandEquity(view, { paused = false } = {}) {
  const facts = paused ? null : equityFacts(view);
  const key = factKey(facts);
  const [eq, setEq] = useState(null);
  const [shownFor, setShownFor] = useState('');
  useEffect(() => {
    if (!facts) { setEq(null); setShownFor(''); return; }
    let cancelled = false;
    runEquity(facts).then((r) => {
      if (cancelled) return;
      setEq(r);
      setShownFor(key);
    }).catch(() => { if (!cancelled) { setEq(null); setShownFor(''); } });
    return () => { cancelled = true; };
  }, [key]);
  if (!facts || shownFor !== key || !eq) return null;
  return { ...formatEquity(eq), made: madeHandName(facts.hole, facts.board) };
}
