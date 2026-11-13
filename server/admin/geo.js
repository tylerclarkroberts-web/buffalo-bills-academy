// IP -> city / region / country / ISP, looked up only when the admin dashboard asks, and cached in geo.json.
// Uses ip-api.com's free batch endpoint (no key; 15 batch requests a minute, 100 IPs each). Private and
// loopback addresses never leave the server.
const TTL_MS = 30 * 86400e3;
const FAIL_TTL_MS = 6 * 3600e3;

export function privateIp(ip) {
  const s = String(ip || '');
  if (!s || s === 'unknown') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(s)) return true;
  const m = s.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(s)) return true; // carrier NAT / Fly internal
  if (s === '::1' || /^f[cd][0-9a-f]{2}:/i.test(s) || /^fe80:/i.test(s)) return true;
  return false;
}

export class Geo {
  constructor({ store, now = () => Date.now(), fetchImpl = globalThis.fetch, endpoint = 'http://ip-api.com/batch' }) {
    Object.assign(this, { store, now, fetchImpl, endpoint });
    this.doc = store.loadDoc('geo', { ips: {} }); this.doc.ips ||= {};
  }
  cached(ip) {
    if (privateIp(ip)) return { ip, private: true, label: 'Private network' };
    const g = this.doc.ips[ip];
    return g ? { ip, ...g } : null;
  }
  /** Look up whatever isn't cached (or is stale). Never throws; a failed lookup just stays unknown for a while. */
  async lookup(ips) {
    const now = this.now();
    const want = [...new Set(ips)].filter((ip) => !privateIp(ip)).filter((ip) => { const g = this.doc.ips[ip]; return !g || now - g.at > (g.fail ? FAIL_TTL_MS : TTL_MS); });
    if (want.length && this.fetchImpl) {
      for (let i = 0; i < want.length && i < 300; i += 100) {
        const chunk = want.slice(i, i + 100);
        try {
          const r = await this.fetchImpl(`${this.endpoint}?fields=status,message,query,country,countryCode,regionName,city,isp,org,lat,lon,timezone,mobile,proxy,hosting`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chunk), signal: AbortSignal.timeout(4000) });
          const rows = r.ok ? await r.json() : [];
          for (const ip of chunk) {
            const g = Array.isArray(rows) ? rows.find((x) => x?.query === ip) : null;
            this.doc.ips[ip] = g && g.status === 'success'
              ? { at: now, city: g.city || '', region: g.regionName || '', country: g.country || '', cc: g.countryCode || '', isp: g.isp || g.org || '', lat: g.lat, lon: g.lon, tz: g.timezone || '', mobile: !!g.mobile, proxy: !!g.proxy, hosting: !!g.hosting }
              : { at: now, fail: true };
          }
        } catch { for (const ip of chunk) this.doc.ips[ip] = { at: now, fail: true }; }
      }
      try { this.store.saveDoc('geo', this.doc); } catch (e) { console.error('[admin] geo save', e.message); }
    }
    return Object.fromEntries([...new Set(ips)].map((ip) => [ip, this.cached(ip)]));
  }
}
export const geoLabel = (g) => !g ? 'Unknown' : g.private ? 'Private network' : g.fail ? 'Lookup failed' : [g.city, g.region, g.cc || g.country].filter(Boolean).join(', ') || 'Unknown';
