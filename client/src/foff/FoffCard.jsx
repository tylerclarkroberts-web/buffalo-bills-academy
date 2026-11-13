import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { loadYoutubeApi, readCache, VIDEO_ID, VIDEO_URL, watchedEnough, writeCache, YT_THUMB } from './trailer.js';
import './foff-card.css';

const CONFETTI = [
  ['#ffd84a', '-18px', '18deg'], ['#ff62d4', '12px', '-40deg'], ['#3ce0c4', '40px', '70deg'],
  ['#e2483d', '-40px', '-80deg'], ['#4ea3ff', '8px', '120deg'], ['#fff', '-8px', '-20deg'],
  ['#ffd84a', '28px', '200deg'], ['#ff62d4', '-30px', '160deg'],
];

function useUnlocked(me) {
  const id = me?.id;
  const [on, setOn] = useState(() => !!(me?.foffWatched || (id && readCache(id))));
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!id) return;
    if (me?.foffWatched) { writeCache(id); setOn(true); return; }
    if (readCache(id)) {
      setOn(true);
      api('POST', '/foff/watched').then(() => refreshSession()).catch(() => { /* keep the local unlock */ });
    } else setOn(false);
  }, [id, me?.foffWatched]);
  const unlock = useCallback(() => {
    if (!id) return;
    writeCache(id);
    setOn((was) => { if (!was) setReveal(true); return true; });
    api('POST', '/foff/watched').then(() => refreshSession()).catch(() => { /* cached; retry on the next visit */ });
  }, [id]);
  return { on, reveal, unlock };
}

export function FoffCard() { return <FoffUnlock layout="card" />; }
export function FoffPromo() { return <FoffUnlock layout="promo" />; }

function FoffUnlock({ layout }) {
  const { me } = useSession();
  const { on, reveal, unlock } = useUnlocked(me);
  const [open, setOpen] = useState(false);
  const body = on
    ? <UnlockedTile reveal={reveal} />
    : <WatchPromo bare={layout === 'card'} onWatch={() => setOpen(true)} />;
  return (
    <>
      {layout === 'card' ? (
        <section className={`panel lb-card lb-slots lb-foff${on ? ' lb-foff-open' : ''}`} data-test="foff-card">
          {!on && <div className="panel-head"><span className="western">Foff&rsquo;s Bachelor Party</span><span className="ph-sub">A short film</span></div>}
          <div className="panel-body">{body}</div>
        </section>
      ) : (
        <div data-test="foff-card">{body}</div>
      )}
      {open && !on && <FilmModal onClose={() => setOpen(false)} onWatched={unlock} />}
    </>
  );
}

function WatchPromo({ bare, onWatch }) {
  return (
    <div className={`foff-watch ${bare ? 'bare' : ''}`}>
      <button type="button" className="foff-thumb" onClick={onWatch} aria-label="Watch the film" data-test="foff-thumb">
        <img src={YT_THUMB} alt="" />
        <i aria-hidden="true" />
      </button>
      <div className="sp-txt">
        {!bare && <b className="western">Foff&rsquo;s Bachelor Party</b>}
        <span className="small sp-desc">Watch the film. Then the trip opens.</span>
        <button className="btn small sp-go" onClick={onWatch} data-test="foff-watch">Watch the film <span className="arrow">→</span></button>
      </div>
    </div>
  );
}

function UnlockedTile({ reveal }) {
  return (
    <button type="button" className={`foff-tile${reveal ? ' reveal' : ''}`} onClick={() => navigate('/foff')} data-test="foff-tile" aria-label="Foff's Bachelor Party">
      {reveal && <span className="foff-confetti" aria-hidden="true">{CONFETTI.map(([bg, left, spin], i) => (
        <i key={i} style={{ left, background: bg, animationDelay: `${i * 30}ms`, '--dx': `${(i % 2 ? 1 : -1) * (18 + i * 8)}px`, '--spin': spin }} />
      ))}</span>}
      <b>Foff&rsquo;s<br />Bachelor Party</b>
      <span>The trip →</span>
    </button>
  );
}

function FilmModal({ onClose, onWatched }) {
  const host = useRef(null);
  const player = useRef(null);
  const poll = useRef(null);
  const done = useRef(false);
  const [fallback, setFallback] = useState(false);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onWatched();
    onClose();
  }, [onClose, onWatched]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    let dead = false;
    loadYoutubeApi().then((YT) => {
      if (dead || !host.current) return;
      const tick = () => {
        const p = player.current;
        if (!p || done.current) return;
        try {
          const ended = YT.PlayerState && p.getPlayerState?.() === YT.PlayerState.ENDED;
          if (watchedEnough(p.getCurrentTime?.() ?? 0, p.getDuration?.() ?? 0, ended)) finish();
        } catch { /* player torn down */ }
      };
      player.current = new YT.Player(host.current, {
        videoId: VIDEO_ID,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => { poll.current = setInterval(tick, 400); },
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) finish(); else tick(); },
          onError: () => setFallback(true),
        },
      });
    }).catch(() => { if (!dead) setFallback(true); });
    return () => {
      dead = true;
      window.removeEventListener('keydown', onKey);
      clearInterval(poll.current);
      try { player.current?.destroy?.(); } catch { /* already gone */ }
      player.current = null;
    };
  }, [finish, onClose]);
  return (
    <div className="foff-modal-back" onClick={onClose} data-test="foff-modal-back">
      <div className="foff-modal" role="dialog" aria-modal="true" aria-labelledby="foff-film-title" data-test="foff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="foff-modal-head">
          <span className="western" id="foff-film-title">Foff&rsquo;s Bachelor Party</span>
          <button type="button" className="btn small" onClick={onClose} data-test="foff-modal-close">Close</button>
        </div>
        {!fallback ? (
          <div className="foff-player"><div ref={host} /></div>
        ) : (
          <div className="foff-fallback" data-test="foff-fallback">
            <p className="small">The player wouldn&rsquo;t load. Watch the film on YouTube, then come back.</p>
            <a className="btn small sp-go" href={VIDEO_URL} target="_blank" rel="noopener noreferrer" data-test="foff-yt-link">Watch on YouTube <span className="arrow">→</span></a>
            <button type="button" className="btn small" onClick={finish} data-test="foff-watched-anyway">I&rsquo;ve watched it</button>
          </div>
        )}
      </div>
    </div>
  );
}
