// EL HALO: La Michoacana's hand-painted look, drawn on canvases at load time (no image files). The round logo is our
// own drawing in the spirit of the classic paletería sign: a little girl in a pink-and-white dress and a striped rebozo,
// holding an ice cream, on a lime-green sunburst, with the name arched over her and "es... natural." underneath.
const PINK = '#e2187a', PINK2 = '#ff6fae', LIME = '#a6d832', LIME2 = '#c8ec5a', INK = '#1a0d12', CREAM = '#fff8f0';

function arcText(x, text, cx, cy, r, a0, a1, font, fill, stroke, lw) {
  x.save(); x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1));
    x.save(); x.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.rotate(a + Math.PI / 2);
    if (stroke) { x.lineWidth = lw; x.strokeStyle = stroke; x.lineJoin = 'round'; x.strokeText(text[i], 0, 0); }
    x.fillStyle = fill; x.fillText(text[i], 0, 0); x.restore();
  }
  x.restore();
}
const ell = (x, cx, cy, rx, ry, fill, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
const poly = (x, pts, fill, stroke, lw = 3) => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.lineWidth = lw; x.strokeStyle = stroke; x.stroke(); } };

// the girl, standing in a box about 260 wide x 300 tall with her feet at (cx, cy)
function girl(x, cx, cy, k = 1) {
  x.save(); x.translate(cx, cy); x.scale(k, k);
  // rebozo: striped shawl hanging behind and down her right side, with a fringe
  poly(x, [[-58, -228], [62, -226], [92, -40], [70, -22], [-70, -22], [-88, -40]], '#b0134f', INK, 4);
  x.save(); x.beginPath(); x.moveTo(-58, -228); x.lineTo(62, -226); x.lineTo(92, -40); x.lineTo(-88, -40); x.closePath(); x.clip();
  for (let i = -6; i < 8; i++) { x.fillStyle = i % 2 ? INK : '#7a0f3a'; x.fillRect(-100 + i * 18, -240, 6, 230); }
  x.restore();
  for (let i = 0; i < 9; i++) { x.strokeStyle = '#b0134f'; x.lineWidth = 3; x.beginPath(); x.moveTo(60 + i * 3.5, -36); x.lineTo(62 + i * 3.5, -12); x.stroke(); }
  // skirt: long magenta enagua with a white band near the hem
  poly(x, [[-46, -118], [46, -118], [64, -14], [-64, -14]], PINK, INK, 4);
  x.fillStyle = CREAM; x.fillRect(-60, -44, 120, 12); x.fillStyle = PINK2; for (let i = -54; i < 56; i += 14) x.fillRect(i, -41, 6, 6);
  // huaraches
  ell(x, -22, -8, 18, 8, INK); ell(x, 22, -8, 18, 8, INK);
  // blouse (huipil): white, embroidered neckline and sleeves
  poly(x, [[-40, -178], [40, -178], [50, -112], [-50, -112]], CREAM, INK, 4);
  x.fillStyle = PINK; for (let i = -28; i <= 28; i += 9) ell(x, i, -170 + Math.abs(i) * 0.2, 3.4, 3.4, i % 2 ? PINK : '#2ea84a');
  for (let i = -40; i <= 40; i += 10) ell(x, i, -120, 3, 3, PINK);
  // left arm down along the skirt, right arm up holding the cone
  poly(x, [[-40, -172], [-58, -128], [-50, -122], [-34, -160]], CREAM, INK, 3); ell(x, -55, -120, 9, 9, '#f2c49b');
  poly(x, [[38, -172], [70, -176], [72, -164], [36, -156]], CREAM, INK, 3); ell(x, 78, -172, 10, 10, '#f2c49b');
  // the ice cream: a waffle cone and a big pink scoop with a drip
  poly(x, [[66, -182], [94, -182], [80, -140]], '#d9a35a', INK, 3);
  x.strokeStyle = '#a8732e'; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(68 + i * 8, -182); x.lineTo(84 + i * 4, -150); x.stroke(); }
  ell(x, 80, -196, 22, 19, PINK2); x.strokeStyle = INK; x.lineWidth = 3; x.beginPath(); x.ellipse(80, -196, 22, 19, 0, 0, Math.PI * 2); x.stroke();
  ell(x, 70, -202, 6, 4, '#ffd0e6'); ell(x, 92, -180, 4, 7, PINK2);
  // head: round face, black hair with a centre part and two braids tied with pink ribbon
  ell(x, 0, -214, 40, 42, INK);
  ell(x, 0, -206, 31, 33, '#f2c49b'); x.strokeStyle = INK; x.lineWidth = 3; x.beginPath(); x.ellipse(0, -206, 31, 33, 0, 0, Math.PI * 2); x.stroke();
  poly(x, [[-34, -222], [0, -246], [34, -222], [30, -236], [0, -256], [-30, -236]], INK);
  for (const s of [-1, 1]) { x.strokeStyle = INK; x.lineWidth = 10; x.beginPath(); x.moveTo(s * 34, -206); x.quadraticCurveTo(s * 46, -170, s * 38, -138); x.stroke(); ell(x, s * 38, -136, 8, 6, PINK2); }
  x.strokeStyle = INK; x.lineWidth = 3; for (const s of [-1, 1]) { x.beginPath(); x.arc(s * 12, -208, 6, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); } // happy closed eyes
  ell(x, -19, -196, 6, 4, '#f59bb0'); ell(x, 19, -196, 6, 4, '#f59bb0');
  x.beginPath(); x.arc(0, -192, 8, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
  x.restore();
}

// the round logo, centred at (cx, cy), radius r
export function drawLogo(x, cx, cy, r) {
  x.save();
  ell(x, cx, cy, r, r, CREAM); ell(x, cx, cy, r * 0.93, r * 0.93, PINK); ell(x, cx, cy, r * 0.88, r * 0.88, LIME);
  x.save(); x.beginPath(); x.arc(cx, cy, r * 0.88, 0, Math.PI * 2); x.clip();
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, a, a + Math.PI / 18); x.closePath(); x.fillStyle = LIME2; x.fill(); }
  x.restore();
  girl(x, cx, cy + r * 0.56, r / 300);
  arcText(x, 'MICHOACANA', cx, cy, r * 0.7, -Math.PI * 0.95, -Math.PI * 0.05, `900 ${Math.round(r * 0.2)}px "Arial Black", Impact, sans-serif`, PINK, CREAM, r * 0.05);
  x.save(); x.translate(cx - r * 0.62, cy + r * 0.12); x.rotate(-0.3); x.font = `italic bold ${Math.round(r * 0.2)}px Georgia, serif`; x.textAlign = 'center';
  x.lineWidth = r * 0.04; x.strokeStyle = CREAM; x.strokeText('La', 0, 0); x.fillStyle = INK; x.fillText('La', 0, 0); x.restore();
  x.font = `bold ${Math.round(r * 0.17)}px Georgia, serif`; x.textAlign = 'center'; x.lineWidth = r * 0.04; x.strokeStyle = CREAM;
  x.strokeText('es... natural.', cx, cy + r * 0.78); x.fillStyle = INK; x.fillText('es... natural.', cx, cy + r * 0.78);
  x.restore();
}

export function logoCanvas(size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const x = cv.getContext('2d');
  drawLogo(x, size / 2, size / 2, size * 0.48); return cv;
}

// the storefront sign: pink board, scalloped white trim, the logo, the name in big script and the slogan
export function signCanvas() {
  const W = 1024, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = CREAM; x.fillRect(0, 0, W, H);
  x.fillStyle = PINK; x.fillRect(10, 10, W - 20, H - 20);
  x.fillStyle = CREAM; for (let i = 0; i < W; i += 32) { x.beginPath(); x.arc(i + 16, 10, 14, 0, Math.PI); x.fill(); x.beginPath(); x.arc(i + 16, H - 10, 14, Math.PI, 0); x.fill(); }
  drawLogo(x, 136, H / 2, 112);
  x.textAlign = 'center'; x.lineJoin = 'round';
  x.font = 'italic bold 104px Georgia, "Brush Script MT", serif'; x.lineWidth = 14; x.strokeStyle = '#8a0c47'; x.strokeText('La Michoacana', 610, 132); x.fillStyle = CREAM; x.fillText('La Michoacana', 610, 132);
  x.font = 'italic 50px Georgia, serif'; x.lineWidth = 8; x.strokeStyle = '#8a0c47'; x.strokeText('es... natural.', 640, 205); x.fillStyle = '#ffe36a'; x.fillText('es... natural.', 640, 205);
  // little paletas either side of the slogan
  for (const [px, c] of [[930, '#ff9f1a'], [968, '#6fd14a'], [400, '#ffd0e6']]) { x.fillStyle = '#e8c48a'; x.fillRect(px - 4, 196, 8, 30); x.fillStyle = c; x.beginPath(); x.roundRect?.(px - 16, 150, 32, 52, 10); if (!x.roundRect) x.rect(px - 16, 150, 32, 52); x.fill(); x.lineWidth = 3; x.strokeStyle = CREAM; x.stroke(); }
  return cv;
}
