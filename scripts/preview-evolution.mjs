// Standalone local visual gallery for Bug Center story panels and all bug evolution stages/cultures.
// Run: node scripts/preview-evolution.mjs   (then open the printed localhost URL)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { BUGS } from '../server/engine/bugs.js';
import { STAGE2_ARCHETYPES, STAGE3_CULTURES, SPECIES_CULTURE, stage2ArchetypeOf } from '../client/src/barn/evolutionArt.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.env.PORT || 0);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8',
};

const stage2Reps = STAGE2_ARCHETYPES.map((arch) => {
  const bug = BUGS.find((b) => stage2ArchetypeOf(b) === arch);
  return { arch, id: bug.id, name: bug.name };
});
const stage3Reps = Object.values(STAGE3_CULTURES).map((c) => {
  const id = Object.keys(SPECIES_CULTURE).find((k) => SPECIES_CULTURE[k] === c.id);
  const bug = BUGS.find((b) => b.id === id);
  return { culture: c.id, label: c.label, id: bug.id, name: bug.name };
});

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Evolution Art &amp; Culture Preview</title>
<style>
  body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #14121a; color: #f4eee4; }
  h1, h2 { margin: 0 0 12px; font-weight: 700; }
  h2 { margin-top: 28px; font-size: 18px; color: #e6c86a; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
  .card { background: #1e1c28; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 12px; display: grid; gap: 8px; justify-items: center; }
  .card.green { background: radial-gradient(70% 70% at 50% 45%, #4a6144, #283625); }
  .card img.panel { width: 100%; aspect-ratio: 3/2; object-fit: cover; border-radius: 8px; border: 2px solid #fff; }
  .card canvas { width: 192px; height: 192px; }
  .card canvas.pix { image-rendering: pixelated; }
  .meta { text-align: center; font-size: 13px; line-height: 1.35; }
  .meta b { display: block; color: #ffd97a; }
  .meta small { color: #b8b0a6; }
</style>
</head>
<body>
<h1>Bug Evolution Art &amp; Cultural Sprites Preview</h1>
<h2>Bug Center Story Panels (evo-1 .. evo-4)</h2>
<div class="panels">
  ${[1, 2, 3, 4].map((i) => `<div class="card"><img class="panel" src="/bugcenter/evo-${i}.webp" alt="evo-${i}" /><div class="meta"><b>evo-${i}.webp</b></div></div>`).join('')}
</div>

<h2>Stage I (Procedural Pixel Art) vs Stage II (${STAGE2_ARCHETYPES.length} Cyborg Archetypes)</h2>
<div class="grid" id="stage2"></div>

<h2>Stage III (${Object.keys(STAGE3_CULTURES).length} Cyberpunk Cultural Forms, Dark &amp; Barn-Green Backdrops)</h2>
<div class="grid" id="stage3"></div>

<h2>Botched Porcelain Masks (Stage II &amp; Stage III, Dark &amp; Barn-Green Backdrops)</h2>
<div class="grid" id="botched"></div>

<script type="module">
import { BY_ID } from '/server/engine/creatures.js';
import { drawBug, isHiResEvo, onSpriteReady } from '/client/src/barn/sprite.js';

function addCard(parent, { title, sub, species, style, level = 15, green = false }) {
  const card = document.createElement('div');
  card.className = 'card' + (green ? ' green' : '');
  const c = document.createElement('canvas');
  c.width = 384; c.height = 384;
  if (!isHiResEvo(BY_ID[species], style)) c.className = 'pix';
  const paint = () => {
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    drawBug(x, BY_ID[species], { w: c.width, h: c.height, still: true, fill: 0.9, style, level });
  };
  paint();
  onSpriteReady(paint);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = '<b>' + title + '</b><small>' + sub + '</small>';
  card.append(c, meta);
  parent.appendChild(card);
}

const s2 = ${JSON.stringify(stage2Reps)};
const s2El = document.getElementById('stage2');
for (const r of s2) {
  addCard(s2El, { title: 'Stage I: ' + r.name, sub: r.id, species: r.id, style: null, level: 9 });
  addCard(s2El, { title: 'Stage II: ' + r.arch, sub: r.name, species: r.id, style: { evo: 1 } });
  addCard(s2El, { title: 'Stage II: ' + r.arch + ' (Green)', sub: r.name, species: r.id, style: { evo: 1 }, green: true });
}

const s3 = ${JSON.stringify(stage3Reps)};
const s3El = document.getElementById('stage3');
for (const r of s3) {
  addCard(s3El, { title: 'Stage III: ' + r.label, sub: r.name, species: r.id, style: { evo: 2 } });
  addCard(s3El, { title: 'Stage III: ' + r.label + ' (Green)', sub: r.name, species: r.id, style: { evo: 2 }, green: true });
}

const botEl = document.getElementById('botched');
addCard(botEl, { title: 'Botched Stage II', sub: 'haywire', species: 'ceroplophana', style: { evo: 1, botched: 'haywire' } });
addCard(botEl, { title: 'Botched Stage II (Green)', sub: 'haywire', species: 'ceroplophana', style: { evo: 1, botched: 'haywire' }, green: true });
addCard(botEl, { title: 'Botched Stage III', sub: 'berserk', species: 'pseudocreobotra', style: { evo: 2, botched: 'berserk' } });
addCard(botEl, { title: 'Botched Stage III (Green)', sub: 'berserk', species: 'pseudocreobotra', style: { evo: 2, botched: 'berserk' }, green: true });
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(HTML);
    return;
  }
  const rel = urlPath.replace(/^\/+/, '');
  const candidates = [path.join(ROOT, 'client/public', rel), path.join(ROOT, rel)];
  for (const filePath of candidates) {
    if (!filePath.startsWith(ROOT)) continue;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`Evolution art gallery listening at http://127.0.0.1:${port}/`);
});
