// One-command start: installs packages if needed, builds the web app if needed, then runs the server.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (!fs.existsSync(path.join(root, 'node_modules', 'vite'))) {
  console.log('First run: installing packages (takes a minute)...');
  run('npm install --no-audit --no-fund');
}
const newest = (dir) => {
  let t = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    t = Math.max(t, f.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
};
const built = path.join(root, 'dist', 'index.html');
if (!fs.existsSync(built) || newest(path.join(root, 'client')) > fs.statSync(built).mtimeMs) {
  console.log('Building the web app...');
  run('npx vite build');
}
const child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { cwd: root, stdio: 'inherit', env: process.env });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
