// Tiny JSON-file store. One file per table + one players file, kept in memory and written atomically
// (write to a temp file, then rename) on every change. Simple, human-readable, no native modules.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.tablesDir = path.join(dir, 'tables');
    fs.mkdirSync(this.tablesDir, { recursive: true });
    this.playersFile = path.join(dir, 'players.json');
    this.players = fs.existsSync(this.playersFile) ? JSON.parse(fs.readFileSync(this.playersFile, 'utf8')) : {};
    this.tables = new Map();
    for (const f of fs.readdirSync(this.tablesDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const t = JSON.parse(fs.readFileSync(path.join(this.tablesDir, f), 'utf8'));
        this.tables.set(t.code, t);
      } catch (e) { console.error(`Skipping unreadable table file ${f}: ${e.message}`); }
    }
  }
  static writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }
  savePlayers() { Store.writeAtomic(this.playersFile, this.players); }
  // Persist first; existing investment requests retain player/holding references across awaits.
  commitPlayerDrafts(drafts) {
    const players = { ...this.players };
    for (const p of drafts) {
      if (!this.players[p.id]) throw new Error('Player no longer exists');
      players[p.id] = p;
    }
    const tmp = `${this.playersFile}.${process.pid}.risk.tmp`;
    let fd;
    try {
      fd = fs.openSync(tmp, 'w');
      fs.writeFileSync(fd, JSON.stringify(players));
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(tmp, this.playersFile);
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(tmp); } catch { /* no staged file */ }
      throw error;
    }
    for (const draft of drafts) {
      const p = this.players[draft.id];
      p.bankroll = draft.bankroll;
      p.txns = draft.txns;
      p.conquest = draft.conquest;
      if (Object.hasOwn(draft, 'mining')) p.mining = draft.mining;
      if (Object.hasOwn(draft, 'barnBouts')) p.barnBouts = draft.barnBouts;
    }
  }
  /** Extra JSON documents (sessions, mines, prices) live next to players.json on the same volume. */
  loadDoc(name, fallback) {
    const f = path.join(this.dir, `${name}.json`);
    try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback; } catch (e) { console.error(`Unreadable ${name}.json: ${e.message}`); return fallback; }
  }
  saveDoc(name, data) { Store.writeAtomic(path.join(this.dir, `${name}.json`), data); }
  getTable(code) { return this.tables.get(code) || null; }
  saveTable(t) { this.tables.set(t.code, t); Store.writeAtomic(path.join(this.tablesDir, `${t.code}.json`), t); }
  allTables() { return [...this.tables.values()]; }
}
