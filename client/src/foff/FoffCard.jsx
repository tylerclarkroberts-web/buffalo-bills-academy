import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { createPlayClock, loadYoutubeApi, playedEnough, VIDEO_ID, VIDEO_URL, watchedEnough, writeCache, YT_THUMB } from './trailer.js';
import './foff-card.css';

const CONFETTI = [
  ['#ffd84a', '-18px', '18deg'], ['#ff62d4', '12px', '-40deg'], ['#3ce0c4', '40px', '70deg'],
  ['#e2483d', '-40px', '-80deg'], ['#4ea3ff', '8px', '120deg'], ['#fff', '-8px', '-20deg'],
  ['#ffd84a', '28px', '200deg'], ['#ff62d4', '-30px', '160deg'],
];

function useUnlocked(me) {
  const id = me?.id;
  const [on, setOn] = useState(() => !!me?.foffWatched);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (me?.foffWatched) { if (id) writeCache(id); setOn(true); }
    else setOn(false);
  }, [id, me?.foffWatched]);
  const unlock = useCallback(async () => {
    if (!id) return false;
    try {
      await api('POST', '/foff/watched');
      writeCache(id);
      setOn((was) => { if (!was) setReveal(true); return true; });
      await refreshSession();
      return true;
    } catch { return false; }
  }, [id]);
  return { on, reveal, unlock };
}

export function FoffCard() { return <FoffUnlock layout="card" />; }
export function FoffPromo() { return <FoffUnlock layout="promo" />; }

function FoffUnlock({ layout }) {
  const { me } = useSession();
  const { on, reveal, unlock } = useUnlocked(me);
  const [open, setOpen] = useState(false);
  const bare = layout === 'card';
  const body = on
    ? <UnlockedPromo bare={bare} reveal={reveal} />
    : <WatchPromo bare={bare} onWatch={() => setOpen(true)} />;
  return (
    <>
      {layout === 'card' ? (
        <section className="panel lb-card lb-slots lb-foff" data-test="foff-card">
          <div className="panel-head"><span className="western">Foff&rsquo;s Bachelor Party</span><span className="ph-sub">{on ? 'The trip' : 'A short film'}</span></div>
          <div className="panel-body">{body}</div>
        </section>
      ) : (
        <div data-test="foff-card">{body}</div>
      )}
      {open && !on && <FilmModal onClose={() => setOpen(false)} onWatched={async () => { if (await unlock()) setOpen(false); }} />}
    </>
  );
}

function WatchPromo({ bare, onWatch }) {
  return (
    <div className={`slots-promo foff-watch ${bare ? 'bare' : ''}`}>
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

function UnlockedPromo({ bare, reveal }) {
  return (
    <div className={`slots-promo foff-promo ${bare ? 'bare' : ''}${reveal ? ' reveal' : ''}`} data-test="foff-tile">
      {reveal && <span className="foff-confetti" aria-hidden="true">{CONFETTI.map(([bg, left, spin], i) => (
        <i key={i} style={{ left, background: bg, animationDelay: `${i * 30}ms`, '--dx': `${(i % 2 ? 1 : -1) * (18 + i * 8)}px`, '--spin': spin }} />
      ))}</span>}
      <FoffArt />
      <div className="sp-txt">
        {!bare && <b className="western">Foff&rsquo;s Bachelor Party</b>}
        <span className="small sp-desc">Golf with some GFRs</span>
        <button type="button" className="btn small sp-go" onClick={() => navigate('/foff')} data-test="foff-go">Go on the trip <span className="arrow">→</span></button>
      </div>
    </div>
  );
}

/** Pixel golf flag with a hint of the old party-gradient colors as the icon accent. */
function FoffArt() {
  const p = (x, y, w, h, fill) => <rect x={x} y={y} width={w} height={h} fill={fill} />;
  return (
    <svg viewBox="0 0 32 32" className="sp-art" aria-hidden="true" shapeRendering="crispEdges">
      {/* Tiny party-color confetti — a hint of the old gradient tile, as an accent only. */}
      {p(1, 3, 3, 3, '#ff62d4')}{p(28, 2, 3, 3, '#ffd84a')}{p(2, 14, 2, 2, '#3ce0c4')}{p(28, 15, 3, 2, '#e2483d')}{p(26, 8, 2, 2, '#ff62d4')}
      {p(3, 22, 26, 9, '#15582a')}{p(5, 20, 22, 6, '#1a6b32')}{p(7, 18, 18, 5, '#2f9a44')}{p(10, 17, 12, 2, '#4ec45a')}
      {p(13, 1, 3, 22, '#3a2410')}{p(13, 1, 1, 22, '#7a4a22')}{p(15, 1, 1, 22, '#2a1808')}
      {p(16, 1, 14, 3, '#ff3db0')}{p(16, 4, 13, 3, '#ffd84a')}{p(16, 7, 11, 3, '#ff3db0')}{p(16, 10, 7, 2, '#ffd84a')}
      {p(6, 16, 6, 6, '#f4efe4')}{p(7, 17, 4, 4, '#e6dfd2')}{p(8, 18, 2, 2, '#c8c0b0')}{p(9, 16, 1, 1, '#fff')}
    </svg>
  );
}

function FilmModal({ onClose, onWatched }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="foff-modal-back" onClick={onClose} data-test="foff-modal-back">
      <div className="foff-modal" role="dialog" aria-modal="true" aria-labelledby="foff-film-title" data-test="foff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="foff-modal-head">
          <span className="western" id="foff-film-title">Foff&rsquo;s Bachelor Party</span>
          <button type="button" className="btn small" onClick={onClose} data-test="foff-modal-close">Close</button>
        </div>
        <FilmPlayer onWatched={onWatched} />
      </div>
    </div>
  );
}

/** Embeds the bagpipe film, records a server watch-start when it actually plays, and unlocks only after real playback. */
export function FilmPlayer({ onWatched }) {
  const wrap = useRef(null);
  const player = useRef(null);
  const poll = useRef(null);
  const clock = useRef(createPlayClock());
  const started = useRef(false);
  const done = useRef(false);
  const onWatchedRef = useRef(onWatched);
  onWatchedRef.current = onWatched;
  const [fallback, setFallback] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hint, setHint] = useState('');

  useEffect(() => {
    const box = wrap.current;
    if (!box) return undefined;
    let dead = false;
    const host = document.createElement('div');
    box.appendChild(host);
    clock.current = createPlayClock();
    started.current = false;
    done.current = false;
    loadYoutubeApi().then((YT) => {
      if (dead || !host.isConnected) return;
      const playing = YT.PlayerState?.PLAYING;
      const endedState = YT.PlayerState?.ENDED;
      const onPlay = () => {
        clock.current.playing(Date.now());
        if (started.current) return;
        started.current = true;
        api('POST', '/foff/watching').catch(() => { started.current = false; });
      };
      const tick = async () => {
        const p = player.current;
        if (!p || done.current) return;
        try {
          const state = p.getPlayerState?.();
          if (state === playing) onPlay();
          else clock.current.stopped(Date.now());
          const ended = state === endedState;
          const current = p.getCurrentTime?.() ?? 0, duration = p.getDuration?.() ?? 0;
          if (!watchedEnough(current, duration, ended) || !playedEnough(clock.current.value(Date.now()))) return;
          try {
            await api('POST', '/foff/watched');
            done.current = true;
            await onWatchedRef.current?.();
          } catch (e) {
            setHint(e.message || 'Keep watching. The trip opens when the film is over.');
          }
        } catch { /* player torn down */ }
      };
      let ready = false;
      player.current = new YT.Player(host, {
        videoId: VIDEO_ID,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1, origin: window.location.origin },
        events: {
          onReady: () => { ready = true; poll.current = setInterval(tick, 400); },
          onStateChange: (e) => { if (e.data === playing) onPlay(); else clock.current.stopped(Date.now()); if (e.data === endedState) tick(); },
          onError: () => { if (!dead && !ready) setFallback(true); },
        },
      });
    }).catch(() => { if (!dead) setFallback(true); });
    return () => {
      dead = true;
      clearInterval(poll.current);
      clock.current.stopped(Date.now());
      try { player.current?.destroy?.(); } catch { /* already gone */ }
      player.current = null;
      try { host.remove(); } catch { /* already gone */ }
    };
  }, [retry]);

  const retryEmbed = () => { setHint(''); setFallback(false); setRetry((n) => n + 1); };

  return (
    <>
      <div className="foff-player" data-test="foff-player" ref={wrap} hidden={fallback} />
      {fallback && (
        <div className="foff-fallback" data-test="foff-fallback">
          <p className="small">The player wouldn&rsquo;t load. Open the film on YouTube, then come back and retry the player. It has to play here to open the trip.</p>
          <a className="btn small sp-go" href={VIDEO_URL} target="_blank" rel="noopener noreferrer" data-test="foff-yt-link">Watch on YouTube <span className="arrow">→</span></a>
          <button type="button" className="btn small" onClick={retryEmbed} data-test="foff-retry">Retry the player</button>
        </div>
      )}
      {hint && !fallback && <p className="small foff-film-hint" role="status">{hint}</p>}
    </>
  );
}
