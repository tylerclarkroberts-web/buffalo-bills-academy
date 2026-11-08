// Username + password accounts: scrypt hashing, password rules and a small in-memory rate limiter.
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const scrypt = (pw, salt, o) => new Promise((resolve, reject) =>
  crypto.scrypt(pw.normalize('NFKC'), salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: SCRYPT.maxmem }, (e, k) => (e ? reject(e) : resolve(k))));

/** Returns "scrypt$N$r$p$saltB64$hashB64". */
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
export async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const key = await scrypt(String(pw), Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, keylen: want.length });
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
// Used when the username does not exist, so a miss takes as long as a wrong password.
let dummy = null;
export async function burnTime(pw) { dummy ||= await hashPassword('not-a-real-password-' + crypto.randomUUID()); await verifyPassword(pw, dummy); }

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop', 'qwerty123', 'iloveyou', 'letmein1', 'abc12345', '11111111', '00000000', 'baseball', 'football', 'sunshine', 'princess', 'welcome1', 'passw0rd', 'trustno1', 'pokerface', 'buffalobill', 'buffalobills']);
export const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,19}$/;
export function normUsername(u) { return String(u || '').trim().toLowerCase(); }
export function checkUsername(u) {
  const n = normUsername(u);
  if (!USERNAME_RE.test(n)) return 'Usernames are 3 to 20 characters: letters, numbers, dots, dashes or underscores.';
  return null;
}
export function checkEmail(e) {
  if (!e) return null;
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) ? null : 'That email address does not look right.';
}
export function checkPassword(pw, username = '') {
  const s = String(pw || '');
  if (s.length < 8) return 'Use at least 8 characters for your password.';
  if (s.length > 128) return 'That password is too long (128 characters max).';
  if (COMMON.has(s.toLowerCase()) || /^(.)\1+$/.test(s)) return 'That password is too easy to guess. Try a short phrase.';
  if (username && s.toLowerCase().includes(normUsername(username))) return "Your password can't contain your username.";
  return null;
}

/** Fixed-window counter: allow `max` hits per key per `windowMs`. */
export class RateLimiter {
  constructor({ max, windowMs, now = Date.now }) { this.max = max; this.windowMs = windowMs; this.now = now; this.hits = new Map(); }
  hit(key) {
    const t = this.now();
    let e = this.hits.get(key);
    if (!e || e.reset <= t) { e = { n: 0, reset: t + this.windowMs }; this.hits.set(key, e); }
    e.n += 1;
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.reset <= t) this.hits.delete(k);
    return { ok: e.n <= this.max, retryAfter: Math.ceil((e.reset - t) / 1000) };
  }
  peek(key) { const e = this.hits.get(key); return !e || e.reset <= this.now() ? 0 : e.n; }
  clear(key) { this.hits.delete(key); }
}
