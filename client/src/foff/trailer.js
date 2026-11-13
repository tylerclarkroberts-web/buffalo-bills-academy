// The lobby film that unlocks Foff's Bachelor Party. Progress helpers are pure so tests can cover them.
export const VIDEO_ID = 'B_X_PPQttcw';
export const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
export const WATCHED_THRESHOLD = 0.95;
export const YT_THUMB = `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`;
// Matches server/foff.js (a test keeps the two in step). 1:34 bagpipe film, minus a few seconds of slack.
export const FILM_MS = 93_000, FILM_SLACK_MS = 5_000, FILM_MIN_MS = FILM_MS - FILM_SLACK_MS;

export const cacheKey = (playerId) => `bba.foff.watched.${playerId || 'anon'}`;
export function readCache(playerId) {
  try { return localStorage.getItem(cacheKey(playerId)) === '1'; } catch { return false; }
}
export function writeCache(playerId) {
  try { localStorage.setItem(cacheKey(playerId), '1'); } catch { /* private mode */ }
}

/** True once the film has ended, or the playhead has reached 95% of its duration. */
export function watchedEnough(current, duration, ended = false) {
  if (ended) return true;
  const t = Number(current), d = Number(duration);
  return Number.isFinite(t) && Number.isFinite(d) && d > 0 && t >= 0 && t / d >= WATCHED_THRESHOLD;
}

/** True once accumulated playing time covers the film, minus a few seconds of slack. */
export function playedEnough(accumulatedMs, durationMs = FILM_MS, slackMs = FILM_SLACK_MS) {
  const acc = Number(accumulatedMs), need = Number(durationMs) - Number(slackMs);
  return Number.isFinite(acc) && Number.isFinite(need) && need > 0 && acc >= need;
}

/** Wall-clock spent in the playing state. Seeking to the end without sitting through it does not fill this up. */
export function createPlayClock() {
  let acc = 0, start = null;
  return {
    playing(now) { if (start == null) start = now; },
    stopped(now) { if (start != null) { acc += Math.max(0, now - start); start = null; } },
    value(now) { return acc + (start != null ? Math.max(0, now - start) : 0); },
  };
}

let ytPromise = null;
/** Load the YouTube IFrame Player API once. Rejects if the script fails or never becomes ready. */
export function loadYoutubeApi(timeoutMs = 8000) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve, reject) => {
    const done = (err, api) => {
      clearTimeout(timer);
      if (err) { ytPromise = null; reject(err); } else resolve(api);
    };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* other listeners */ } done(null, window.YT); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => done(new Error('YouTube API failed to load'));
      document.head.appendChild(s);
    }
    const timer = setTimeout(() => {
      if (window.YT?.Player) done(null, window.YT);
      else done(new Error('YouTube API timed out'));
    }, timeoutMs);
  });
  return ytPromise;
}
