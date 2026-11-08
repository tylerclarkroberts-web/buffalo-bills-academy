// Sign-in: Google (OpenID Connect, authorization-code flow with PKCE) and server-side sessions
// kept in an httpOnly cookie. A dev login exists only when explicitly enabled (tests, local work).
import crypto from 'node:crypto';
import express from 'express';
import { hashPassword, verifyPassword, burnTime, checkUsername, checkEmail, checkPassword, normUsername, RateLimiter } from './passwords.js';

export const SESSION_COOKIE = 'bba_sid';
const STATE_COOKIE = 'bba_oauth';
const SESSION_DAYS = 60;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) { try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bad cookie */ } }
  }
  return out;
}
function cookie(name, value, { maxAge, secure, httpOnly = true, path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=Lax`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
  return c;
}

export class Sessions {
  constructor({ store, now }) {
    this.store = store; this.now = now;
    this.doc = store.loadDoc('sessions', { sessions: {} });
    this.prune();
  }
  save() { this.store.saveDoc('sessions', this.doc); }
  prune() {
    const t = this.now();
    for (const [k, s] of Object.entries(this.doc.sessions)) if (s.exp < t) delete this.doc.sessions[k];
  }
  create(playerId) {
    const id = crypto.randomBytes(32).toString('base64url');
    this.prune();
    this.doc.sessions[sha(id)] = { playerId, created: this.now(), exp: this.now() + SESSION_DAYS * 86400e3 };
    this.save();
    return id;
  }
  lookup(id) {
    if (!id) return null;
    const s = this.doc.sessions[sha(id)];
    if (!s || s.exp < this.now()) return null;
    return s;
  }
  destroy(id) { if (id && this.doc.sessions[sha(id)]) { delete this.doc.sessions[sha(id)]; this.save(); } }
  reassign(fromId, toId) {
    for (const s of Object.values(this.doc.sessions)) if (s.playerId === fromId) s.playerId = toId;
    this.save();
  }
}

export function authConfig(env = process.env) {
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  return {
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
    sessionSecret: env.SESSION_SECRET || '',
    publicUrl,
    devLogin: env.DEV_LOGIN === '1',
    allowGuest: env.ALLOW_GUEST !== '0',
  };
}

/** Mounts /auth/* routes and returns middleware that sets req.player from the session cookie. */
export function setupAuth(app, { service, sessions, config, fetchImpl = globalThis.fetch, limits = {} }) {
  const googleOn = !!(config.googleClientId && config.googleClientSecret && config.sessionSecret);
  const secret = config.sessionSecret || crypto.randomBytes(32).toString('hex'); // dev only: per-process
  const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  const isSecure = (req) => req.secure || req.get('x-forwarded-proto') === 'https';
  const baseUrl = (req) => config.publicUrl || `${isSecure(req) ? 'https' : 'http'}://${req.get('host')}`;
  const safeReturn = (r) => (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/');

  const startSession = (req, res, player) => {
    sessions.destroy(parseCookies(req.get('cookie'))[SESSION_COOKIE]); // fresh session id on every sign-in
    const id = sessions.create(player.id);
    res.append('Set-Cookie', cookie(SESSION_COOKIE, id, { maxAge: 60 * 86400, secure: isSecure(req) }));
  };

  const router = express.Router();
  router.get('/google', (req, res) => {
    if (!googleOn) return res.status(503).type('text').send('Google sign-in is not set up yet.');
    const state = b64url(crypto.randomBytes(16));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    let link = null;
    if (req.query.link === '1') {
      const cur = sessions.lookup(parseCookies(req.get('cookie'))[SESSION_COOKIE]);
      const p = cur && service.getPlayer(cur.playerId);
      if (!p || !p.login) return res.redirect('/profile?link=failed');
      link = p.id;
    }
    const payload = b64url(JSON.stringify({ state, verifier, ret: link ? '/profile' : safeReturn(req.query.return), link, exp: Date.now() + 10 * 60e3 }));
    res.append('Set-Cookie', cookie(STATE_COOKIE, `${payload}.${sign(payload)}`, { maxAge: 600, secure: isSecure(req), path: '/auth' }));
    const q = new URLSearchParams({
      client_id: config.googleClientId, redirect_uri: `${baseUrl(req)}/auth/google/callback`, response_type: 'code',
      scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  });

  router.get('/google/callback', async (req, res) => {
    const fail = (why) => { console.warn('Google sign-in failed:', why); res.redirect('/?signin=failed'); };
    try {
      if (!googleOn) return fail('not configured');
      const raw = parseCookies(req.get('cookie'))[STATE_COOKIE] || '';
      res.append('Set-Cookie', cookie(STATE_COOKIE, '', { maxAge: 0, secure: isSecure(req), path: '/auth' }));
      const [payload, sig] = raw.split('.');
      if (!payload || !sig || sign(payload).length !== sig.length || !crypto.timingSafeEqual(Buffer.from(sign(payload)), Buffer.from(sig))) return fail('bad state cookie');
      const st = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (st.exp < Date.now() || st.state !== req.query.state) return fail('state mismatch');
      if (req.query.error || !req.query.code) return fail(String(req.query.error || 'no code'));
      const r = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: String(req.query.code), client_id: config.googleClientId, client_secret: config.googleClientSecret,
          redirect_uri: `${baseUrl(req)}/auth/google/callback`, grant_type: 'authorization_code', code_verifier: st.verifier }),
      });
      const tok = await r.json();
      if (!r.ok || !tok.id_token) return fail(`token exchange ${r.status}`);
      // The ID token came straight from Google's token endpoint over TLS, so its claims can be trusted (OIDC Core 3.1.3.7).
      const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== config.googleClientId || claims.exp * 1000 < Date.now()) return fail('bad id token');
      if (!claims.sub || claims.email_verified === false) return fail('unverified email');
      if (st.link) {
        const cur = sessions.lookup(parseCookies(req.get('cookie'))[SESSION_COOKIE]);
        const p = cur && cur.playerId === st.link ? service.getPlayer(st.link) : null;
        if (!p) return res.redirect('/profile?link=failed');
        const err = service.linkGoogle(p, { sub: claims.sub, email: claims.email, picture: claims.picture });
        return res.redirect(`/profile?link=${err ? 'taken' : 'ok'}`);
      }
      const player = service.playerForIdentity({ sub: claims.sub, email: claims.email, name: claims.given_name || claims.name, picture: claims.picture, kind: 'google' });
      startSession(req, res, player);
      res.redirect(safeReturn(st.ret));
    } catch (e) { fail(e.message); }
  });

  // ----- username + password accounts -----
  const ipOf = (req) => req.get('fly-client-ip') || req.ip || 'unknown';
  const registerLimit = limits.register || new RateLimiter({ max: 6, windowMs: 60 * 60e3 });
  const loginIpLimit = limits.loginIp || new RateLimiter({ max: 30, windowMs: 15 * 60e3 });
  const loginAcctLimit = limits.loginAcct || new RateLimiter({ max: 8, windowMs: 15 * 60e3 });
  const tooMany = (res, r) => { res.set('Retry-After', String(r.retryAfter)); return res.status(429).json({ error: `Too many tries. Wait ${Math.ceil(r.retryAfter / 60)} min and try again.` }); };

  router.post('/register', async (req, res) => {
    try {
      const b = req.body || {};
      const r = registerLimit.hit(ipOf(req));
      if (!r.ok) return tooMany(res, r);
      const username = normUsername(b.username);
      const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 254) : null;
      const err = checkUsername(username) || checkEmail(email) || checkPassword(b.password, username);
      if (err) return res.status(400).json({ error: err });
      const taken = service.loginTaken({ username, email });
      if (taken) return res.status(409).json({ error: taken });
      const player = service.createPasswordPlayer({ username, email, hash: await hashPassword(String(b.password)), name: b.name || String(b.username).trim() });
      startSession(req, res, player);
      res.json({ id: player.id, name: player.name });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Something went wrong' }); }
  });

  router.post('/login', async (req, res) => {
    try {
      const b = req.body || {};
      const ident = String(b.username || b.email || '').trim().toLowerCase().slice(0, 254);
      const pw = String(b.password || '').slice(0, 256);
      const ri = loginIpLimit.hit(ipOf(req));
      if (!ri.ok) return tooMany(res, ri);
      if (loginAcctLimit.peek(ident) >= loginAcctLimit.max) return tooMany(res, loginAcctLimit.hit(ident));
      const p = service.findLogin(ident);
      const good = p ? await verifyPassword(pw, p.login.hash) : (await burnTime(pw), false);
      if (!good) { loginAcctLimit.hit(ident); return res.status(401).json({ error: 'That username and password do not match.' }); }
      loginAcctLimit.clear(ident);
      startSession(req, res, p);
      res.json({ id: p.id, name: p.name });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Something went wrong' }); }
  });

  router.post('/password', async (req, res) => {
    try {
      const cur = sessions.lookup(parseCookies(req.get('cookie'))[SESSION_COOKIE]);
      const p = cur && service.getPlayer(cur.playerId);
      if (!p?.login) return res.status(401).json({ error: 'Sign in with your username first.' });
      const r = loginAcctLimit.hit('pw:' + p.id);
      if (!r.ok) return tooMany(res, r);
      if (!(await verifyPassword(String(req.body?.current || ''), p.login.hash))) return res.status(401).json({ error: 'Your current password is not right.' });
      const err = checkPassword(req.body?.next, p.login.username);
      if (err) return res.status(400).json({ error: err });
      service.setPasswordHash(p, await hashPassword(String(req.body.next)));
      loginAcctLimit.clear('pw:' + p.id);
      res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Something went wrong' }); }
  });

  router.post('/logout', (req, res) => {
    sessions.destroy(parseCookies(req.get('cookie'))[SESSION_COOKIE]);
    res.append('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, secure: isSecure(req) }));
    res.json({ ok: true });
  });

  // Development / test sign-in. Off unless DEV_LOGIN=1 (or createApp({ devLogin: true })).
  router.post('/dev', express.json(), (req, res) => {
    if (!config.devLogin) return res.status(404).json({ error: 'Not found' });
    const email = String(req.body?.email || 'dev@example.com').toLowerCase().slice(0, 80);
    const player = service.playerForIdentity({ sub: `dev:${email}`, email, name: req.body?.name || email.split('@')[0], picture: null, kind: 'dev' });
    startSession(req, res, player);
    res.json({ id: player.id, name: player.name });
  });
  app.use('/auth', router);

  const middleware = (req, res, next) => {
    const sid = parseCookies(req.get('cookie'))[SESSION_COOKIE];
    const s = sessions.lookup(sid);
    if (s) { req.player = service.getPlayer(s.playerId); req.sessionId = sid; }
    if (!req.player) {
      const h = req.get('authorization') || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
      req.player = service.playerFromToken(token);
      req.legacy = !!req.player;
    }
    next();
  };
  return { middleware, googleOn };
}
