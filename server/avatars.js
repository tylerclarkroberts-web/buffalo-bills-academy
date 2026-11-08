// Player avatars. The browser turns a face photo into a small low-poly image before uploading,
// so the server only ever receives and stores that stylized image (never the original photo).
// Players without a photo get an original generated low-poly bust, drawn in the browser from a seed.
import fs from 'node:fs';
import path from 'node:path';
import { GameError } from './engine/game.js';

export const MAX_AVATAR_BYTES = 160 * 1024;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Validate a PNG data URL; returns the bytes. Only small, square-ish PNGs are accepted. */
export function parsePng(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new GameError('Upload a PNG image.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_AVATAR_BYTES) throw new GameError('That avatar is too large.', 413);
  if (buf.length < 40 || !buf.subarray(0, 8).equals(PNG_SIG) || buf.toString('ascii', 12, 16) !== 'IHDR') throw new GameError('That is not a PNG image.');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w < 32 || h < 32 || w > 512 || h > 512) throw new GameError('Avatars must be between 32 and 512 pixels.');
  return buf;
}

export class Avatars {
  constructor({ dir, store, now }) {
    this.dir = path.join(dir, 'avatars');
    fs.mkdirSync(this.dir, { recursive: true });
    this.store = store; this.now = now;
  }
  file(id) { return path.join(this.dir, `${String(id).replace(/[^\w-]/g, '')}.png`); }
  /** What the client needs to draw someone's avatar. */
  info(p) {
    if (!p) return null;
    const a = p.avatar;
    const wear = this.wearOf?.(p.id); // v34: store items worn on the avatar (cosmetic)
    if (a?.kind === 'photo') return { kind: 'photo', v: a.v, ...(wear ? { wear } : {}) };
    return { kind: 'gen', seed: a?.seed ?? p.id, ...(wear ? { wear } : {}) };
  }
  setPhoto(p, dataUrl) {
    const buf = parsePng(dataUrl);
    const tmp = `${this.file(p.id)}.tmp`;
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, this.file(p.id));
    p.avatar = { kind: 'photo', v: this.now() };
    this.store.savePlayers();
    return this.info(p);
  }
  setGenerated(p, seed) {
    const s = String(seed ?? '').slice(0, 40) || p.id;
    try { fs.unlinkSync(this.file(p.id)); } catch { /* none */ }
    p.avatar = { kind: 'gen', seed: s, v: this.now() };
    this.store.savePlayers();
    return this.info(p);
  }
  remove(p) {
    try { fs.unlinkSync(this.file(p.id)); } catch { /* none */ }
    delete p.avatar;
    this.store.savePlayers();
  }
  /** Move an avatar from one player record to another (used when an old player is merged into a Google account). */
  move(from, to) {
    if (!from.avatar || to.avatar) return;
    to.avatar = from.avatar;
    if (from.avatar.kind === 'photo') { try { fs.renameSync(this.file(from.id), this.file(to.id)); } catch { delete to.avatar; } }
  }
  read(id) { try { return fs.readFileSync(this.file(id)); } catch { return null; } }
}
