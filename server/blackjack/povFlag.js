// Runtime kill switch for the house-only 3D dealer POV. Survives a process
// restart without a new image: touch <data>/pov-off to disable, remove it to
// turn the view back on. The admin API writes the same file.
import fs from 'node:fs';
import path from 'path';

export const POV_FLAG_FILE = 'pov-off';

export function povFlagPath(dir) {
  return path.join(dir, POV_FLAG_FILE);
}

export function isPovDisabled(dir) {
  if (!dir) return false;
  try { return fs.existsSync(povFlagPath(dir)); } catch { return false; }
}

export function setPovEnabled(dir, enabled) {
  if (!dir) throw new Error('no data dir');
  const f = povFlagPath(dir);
  if (enabled) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* */ }
  } else {
    fs.writeFileSync(f, `${new Date().toISOString()}\n`);
  }
  return { enabled: !isPovDisabled(dir) };
}
