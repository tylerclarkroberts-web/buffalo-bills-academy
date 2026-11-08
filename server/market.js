// Play-money investing in exactly two assets: DOGE and NSKT.
// Live prices are fetched server-side, cached ~60s, and fall back to the last known price.
import { GameError } from './engine/game.js';
import { cents, fmt } from './accounts.js';

const CACHE_MS = 60 * 1000;
const SNAPSHOT_MS = 5 * 60 * 1000;
const MAX_SNAPSHOTS = 7 * 24 * 12; // a week of 5-minute points
const MIN_TRADE = 1; // dollars

async function getJson(url, fetchImpl) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'buffalo-bills-academy/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(to); }
}

// NSKT = "Nisket Coin" on pump.fun, confirmed by Tyler (Oct 2026). NSKT_MINT env overrides.
export const NSKT_MINT = 'FjJhCb5a62rJqrySks8y4YHNsKhLGmUHjhPaM12qpump';
// Its pump.fun bonding-curve account (owned by the pump.fun program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P).
export const NSKT_BONDING_CURVE = 'F8MJ8J1bANhHhbgyY3Gyiz8zpkpMHvBbCZmAcca1UikV';
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/** Decode a pump.fun bonding curve account: price in SOL per token = virtual SOL reserves / virtual token reserves. */
export function decodePumpCurve(buf) {
  if (buf.length < 49) throw new Error('short curve account');
  const vToken = Number(buf.readBigUInt64LE(8)), vSol = Number(buf.readBigUInt64LE(16));
  const complete = buf[48] === 1;
  if (!(vToken > 0 && vSol > 0)) throw new Error('empty curve');
  return { solPerToken: (vSol / 1e9) / (vToken / 1e6), complete };
}
export async function pumpCurvePrice(curve, f) {
  const r = await f('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [curve, { encoding: 'base64' }] }), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`rpc ${r.status}`);
  const v = (await r.json())?.result?.value;
  if (!v || v.owner !== PUMP_PROGRAM) throw new Error('not a pump.fun curve');
  const { solPerToken, complete } = decodePumpCurve(Buffer.from(v.data[0], 'base64'));
  if (complete) throw new Error('curve graduated');
  const sol = await getJson('https://api.coinbase.com/v2/prices/SOL-USD/spot', f);
  const usd = Number(sol?.data?.amount);
  if (!(usd > 0)) throw new Error('no SOL price');
  return solPerToken * usd;
}

export function defaultSources(nsktMint, bondingCurve) {
  return {
    DOGE: {
      name: 'Dogecoin', ticker: 'DOGE', source: 'CoinGecko (fallback: Coinbase)',
      async fetch(f) {
        try {
          const j = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd', f);
          const p = Number(j?.dogecoin?.usd); if (p > 0) return p;
        } catch { /* try the next source */ }
        const j = await getJson('https://api.coinbase.com/v2/prices/DOGE-USD/spot', f);
        const p = Number(j?.data?.amount); if (p > 0) return p;
        throw new Error('no DOGE price');
      },
    },
    NSKT: {
      name: 'Nisket Coin', ticker: 'NSKT', mint: nsktMint || null, source: 'Jupiter → DexScreener → pump.fun bonding curve → GeckoTerminal',
      async fetch(f) {
        if (!nsktMint) throw new Error('NSKT mint not configured');
        // 1. Jupiter (works once the coin trades on a regular DEX)
        try {
          const j = await getJson(`https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(nsktMint)}`, f);
          const p = Number(j?.[nsktMint]?.usdPrice); if (p > 0) return p;
        } catch { /* next */ }
        // 2. DexScreener
        try {
          const pairs = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(nsktMint)}`, f);
          const best = (Array.isArray(pairs) ? pairs : []).filter((x) => x?.baseToken?.address === nsktMint && Number(x.priceUsd) > 0)
            .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          if (best) return Number(best.priceUsd);
        } catch { /* next */ }
        // 3. pump.fun bonding curve, read straight from Solana (the coin has not graduated to a DEX yet)
        const curve = bondingCurve || (nsktMint === NSKT_MINT ? NSKT_BONDING_CURVE : null);
        if (curve) {
          try {
            const p = await pumpCurvePrice(curve, f);
            if (p > 0) return p;
          } catch { /* next */ }
        }
        // 4. GeckoTerminal pools
        const g = await getJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(nsktMint)}/pools`, f);
        const pool = (g?.data || []).find((x) => Number(x?.attributes?.base_token_price_usd) > 0);
        if (pool) return Number(pool.attributes.base_token_price_usd);
        throw new Error('no NSKT price');
      },
    },
  };
}

export class Market {
  constructor({ store, accounts, now, fetchImpl = globalThis.fetch, sources, nsktMint = process.env.NSKT_MINT || NSKT_MINT, snapshots = true }) {
    this.store = store; this.accounts = accounts; this.now = now; this.fetchImpl = fetchImpl;
    this.sources = sources || defaultSources(nsktMint);
    this.doc = store.loadDoc('prices', { last: {}, series: {} });
    this.inflight = {};
    if (snapshots) {
      this.snapTimer = setInterval(() => this.snapshot().catch(() => {}), SNAPSHOT_MS);
      this.snapTimer.unref?.();
      setTimeout(() => this.snapshot().catch(() => {}), 2000).unref?.();
    }
  }
  symbols() { return Object.keys(this.sources); }
  save() { this.store.saveDoc('prices', this.doc); }

  /** Current price: cached for 60s; on failure, last known price marked stale; null if never known. */
  async price(sym) {
    const src = this.sources[sym];
    if (!src) throw new GameError('You can only invest in DOGE or NSKT.');
    const last = this.doc.last[sym];
    if (last && this.now() - last.at < CACHE_MS) return { ...last, stale: false };
    if (this.failedAt?.[sym] && this.now() - this.failedAt[sym] < CACHE_MS / 2) return last ? { ...last, stale: true } : null;
    this.inflight[sym] ||= src.fetch(this.fetchImpl).finally(() => { delete this.inflight[sym]; });
    try {
      const price = await this.inflight[sym];
      this.doc.last[sym] = { price, at: this.now() };
      this.save();
      return { price, at: this.now(), stale: false };
    } catch (e) {
      (this.failedAt ||= {})[sym] = this.now();
      if (last) return { ...last, stale: true };
      return null;
    }
  }
  async snapshot() {
    for (const sym of this.symbols()) {
      const q = await this.price(sym);
      if (!q || q.stale) continue;
      const s = (this.doc.series[sym] ||= []);
      const lastPt = s[s.length - 1];
      if (lastPt && this.now() - lastPt[0] < SNAPSHOT_MS / 2) continue;
      s.push([this.now(), q.price]);
      if (s.length > MAX_SNAPSHOTS) s.splice(0, s.length - MAX_SNAPSHOTS);
    }
    this.save();
  }
  /** Last known prices without hitting the network (for leaderboards). */
  cachedPrice(sym) { return this.doc.last[sym]?.price ?? null; }
  holdingsValue(p, priceOf = (s) => this.cachedPrice(s)) {
    let v = 0;
    for (const [sym, h] of Object.entries(p.holdings || {})) { const pr = priceOf(sym); if (pr && h.units > 0) v += h.units * pr; }
    return cents(v);
  }

  async quotes() {
    const out = {};
    for (const sym of this.symbols()) {
      const src = this.sources[sym];
      const q = await this.price(sym);
      out[sym] = { sym, name: src.name, source: src.source, mint: src.mint ?? undefined, price: q?.price ?? null, at: q?.at ?? null, stale: q?.stale ?? false,
        available: !!q, series: (this.doc.series[sym] || []).slice(-288) };
    }
    return out;
  }

  async buy(p, sym, usd) {
    usd = cents(Number(usd));
    if (!(usd >= MIN_TRADE)) throw new GameError(`The smallest trade is $${MIN_TRADE}.`);
    const q = await this.price(sym);
    if (!q) throw new GameError(`${sym} has no price right now, so trading is paused.`, 503);
    this.accounts.requireFunds(p, usd, `that ${sym} buy`);
    const units = usd / q.price;
    const h = (p.holdings[sym] ||= { units: 0, cost: 0 });
    h.units += units; h.cost = cents(h.cost + usd);
    this.accounts.change(p, -usd, 'invest-buy', `Bought ${fmtUnits(units)} ${sym} @ $${q.price}`);
    return { sym, units, price: q.price, usd, bankroll: p.bankroll };
  }

  /** Sell `units` (or everything with all=true). Cost basis leaves proportionally (average cost). */
  async sell(p, sym, { units, all } = {}) {
    const h = p.holdings[sym];
    if (!h || !(h.units > 0)) throw new GameError(`You do not own any ${sym}.`);
    const q = await this.price(sym);
    if (!q) throw new GameError(`${sym} has no price right now, so trading is paused.`, 503);
    let n = all ? h.units : Number(units);
    if (!(n > 0)) throw new GameError('Enter how much to sell.');
    if (n > h.units * (1 + 1e-9)) throw new GameError(`You only own ${fmtUnits(h.units)} ${sym}.`);
    n = Math.min(n, h.units);
    const result = sellMath(h, n, q.price);
    p.invest.realized = cents((p.invest.realized || 0) + result.realized);
    if (h.units <= 1e-12) delete p.holdings[sym];
    this.accounts.change(p, result.proceeds, 'invest-sell', `Sold ${fmtUnits(n)} ${sym} @ $${q.price}`);
    return { sym, units: n, price: q.price, proceeds: result.proceeds, realized: result.realized, bankroll: p.bankroll };
  }

  portfolio(p) {
    const rows = {};
    for (const sym of this.symbols()) {
      const h = p.holdings?.[sym] || { units: 0, cost: 0 };
      const price = this.cachedPrice(sym);
      const value = price ? cents(h.units * price) : null;
      rows[sym] = { units: h.units, cost: h.cost, value, unrealized: value === null ? null : cents(value - h.cost), avgPrice: h.units > 0 ? h.cost / h.units : null };
    }
    return { holdings: rows, realized: p.invest?.realized || 0, value: this.holdingsValue(p) };
  }
  shutdown() { clearInterval(this.snapTimer); }
}

/** Pure average-cost sell math (tested directly). Mutates the holding. */
export function sellMath(h, units, price) {
  const frac = units / h.units;
  const costOut = cents(h.cost * frac);
  const proceeds = cents(units * price);
  h.units -= units; h.cost = cents(h.cost - costOut);
  if (h.units <= 1e-12) { h.units = 0; h.cost = 0; }
  return { proceeds, costOut, realized: cents(proceeds - costOut) };
}
export const fmtUnits = (u) => (u >= 1000 ? fmt(Math.round(u * 100) / 100) : Number(u.toPrecision(6)).toString());
