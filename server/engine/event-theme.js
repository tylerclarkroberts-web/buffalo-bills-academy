// One-day Desert Resort Night skin (Thanksgiving 2026). Pure rules, no DOM/React,
// so node --test can drive them. Cosmetic only: no money, ledger, or saved avatar changes.
//
// Default: ON when the calendar date in America/Phoenix is 2026-11-26.
// Overrides, first match wins:
//   1. ?event=on|off on the page URL (this tab only; handy for shots and QA)
//   2. EVENT_THEME=on|off env, injected as window.__BBA_EVENT_THEME (or VITE_EVENT_THEME at build)
//   3. the date window
// The Crucible line stays over Guntrad's head for the whole event (no hide cycle).
// ?bubble=1 also keeps it on (screenshots / older links). Players do not get a bubble.

export const EVENT_ID = 'desert-resort';
export const EVENT_LABEL = 'Desert Resort Night';
export const EVENT_TZ = 'America/Phoenix';
export const EVENT_DATE = '2026-11-26';
export const CRUCIBLE_LINE = 'Because it is my name!!!';

export const BUBBLE_SHOW_MS = 4000;
export const BUBBLE_CYCLE_MS = 22000;

export function phoenixDate(now = new Date(), timeZone = EVENT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** null = auto (date window); true/false = forced. */
export function parseFlag(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '1' || s === 'on' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'off' || s === 'false' || s === 'no' || s === 'null') return false;
  return null;
}

export function isEventThemeOn({ now = new Date(), flag, env, query } = {}) {
  const q = parseFlag(query ?? flag);
  if (q != null) return q;
  const e = parseFlag(env);
  if (e != null) return e;
  return phoenixDate(now) === EVENT_DATE;
}

export function hashId(id) {
  let h = 2166136261;
  for (const ch of String(id || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Speech-bubble window. Used for Guntrad only (id "guntrad").
 * Default: the line stays up all day while the event is on.
 * force keeps it on for screenshots. persist:false restores the old show/hide cycle (tests).
 */
export function bubblePhase(id, nowMs, { showMs = BUBBLE_SHOW_MS, cycleMs = BUBBLE_CYCLE_MS, force, persist = true } = {}) {
  if (force || persist !== false) return { on: true, wait: cycleMs, t: 0, offset: 0 };
  const offset = hashId(id) % cycleMs;
  const t = (((Number(nowMs) + offset) % cycleMs) + cycleMs) % cycleMs;
  const on = t < showMs;
  return { on, wait: on ? showMs - t : cycleMs - t, t, offset };
}

export function bubbleVisible(id, nowMs, opts) {
  return bubblePhase(id, nowMs, opts).on;
}

/** Reads query/env from the browser. Safe to call from node (returns {}). */
export function liveEventOpts() {
  const opts = { now: new Date() };
  if (typeof window === 'undefined') return opts;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has('event')) opts.query = sp.get('event');
    if (sp.has('bubble')) opts.bubble = parseFlag(sp.get('bubble')) === true;
  } catch { /* ignore */ }
  if (window.__BBA_EVENT_THEME != null && window.__BBA_EVENT_THEME !== '') opts.env = window.__BBA_EVENT_THEME;
  else {
    try {
      const v = import.meta?.env?.VITE_EVENT_THEME;
      if (v != null && v !== '') opts.env = v;
    } catch { /* no vite env */ }
  }
  return opts;
}

/** Insert or replace the boot flag the server stamps into the SPA shell. */
export function injectEventThemeScript(html, envFlag) {
  if (typeof html !== 'string') return html;
  const parsed = parseFlag(envFlag);
  const value = parsed == null ? 'null' : JSON.stringify(parsed ? 'on' : 'off');
  const snippet = `<script>window.__BBA_EVENT_THEME=${value};</script>`;
  if (html.includes('window.__BBA_EVENT_THEME')) {
    return html.replace(/<script>window\.__BBA_EVENT_THEME=.*?<\/script>/, snippet);
  }
  if (html.includes('</head>')) return html.replace('</head>', `${snippet}</head>`);
  return snippet + html;
}
