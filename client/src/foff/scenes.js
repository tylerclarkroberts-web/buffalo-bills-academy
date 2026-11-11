// Foff's Bachelor Party: the cutscenes. Each scene is a picture drawn from rectangles (and the same little people
// the golf uses, scaled up) plus the narration that plays over it; game.js steps through them a tap at a time.
// The narration box covers the bottom sixth of the view, so nothing that matters is drawn below y = 580.
import { H, W, drawGolfer } from './draw.js';
import { FRIENDS, KEETCH } from './course.js';

const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const bands = (ctx, colors, y0, y1) => colors.forEach((c, i) => R(ctx, c, 0, y0 + (y1 - y0) * i / colors.length, W, Math.ceil((y1 - y0) / colors.length)));
const wrap = (v, span) => ((v % span) + span) % span;
/** One of the golf's people at `s` times the size, feet at (x, y). */
function person(ctx, x, y, look, s = 3, hop = 0) { ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(s, s); drawGolfer(ctx, 0, 0, { ...look, club: false }, hop); ctx.restore(); }
function cloud(ctx, x, y, s = 1) { for (const [dx, dy, w, h] of [[0, 10, 70, 16], [12, 0, 40, 14], [40, 4, 36, 12]]) R(ctx, '#f3f6fa', x + dx * s, y + dy * s, w * s, h * s); }
function label(ctx, text, x, y, size, color, align = 'center') { ctx.font = `${size}px VT323, monospace`; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(text, x, y); }
/** A face in a window: whatever is on top of the head, then the head. */
function face(ctx, look, x, y, s) { R(ctx, look.fur || look.skin || '#f0c8a0', x, y, s, s); R(ctx, look.fur || look.cap || look.hair || '#f0c8a0', x, y, s, s * 0.4); }

const SANTA = { cap: '#d83a34' };
const INLAWS = [{ hair: '#b8b8b8', shirt: '#2e7e39', pants: '#3a3f4a', ...SANTA }, { hair: '#d8d0c0', shirt: '#d83a34', pants: '#22242c', ...SANTA }];

/** Keetch's living room. `mode`: 'xmas' (Christmas in September, with the in-laws), 'packed' (one bag by the door),
 *  'home' (back from the trip, not entirely well) or 'december' (Christmas where it belongs, and a medal on the wall). */
function room(ctx, t, calm, mode) {
  const winter = mode === 'december', tree = mode === 'xmas' || winter;
  R(ctx, '#c9b08a', 0, 0, W, 470); R(ctx, '#7a5230', 0, 470, W, H - 470); R(ctx, '#5a3a22', 0, 462, W, 10);
  for (let x = 0; x < W; x += 54) R(ctx, '#6b4628', x, 472, 2, H - 472);
  R(ctx, '#5a3a22', 244, 124, 150, 170); R(ctx, winter ? '#2a3a5a' : '#7cc4f0', 252, 132, 134, 154);                       // a window, and the season through it
  if (winter) { R(ctx, '#f3f6fa', 252, 250, 134, 36); for (let i = 0; i < 12; i++) R(ctx, '#fff6e4', 256 + (i * 41) % 124, 134 + wrap(i * 37 + (calm ? 0 : t * 30), 112), 4, 4); }
  else { R(ctx, '#ffd84a', 300, 156, 44, 44); R(ctx, '#5cb54c', 252, 250, 134, 36); }
  R(ctx, '#5a3a22', 317, 132, 4, 154);
  const cal = { home: ['SEPT', 'BACK', 'HOME'], december: ['DEC', 'ACTUAL', 'CHRISTMAS'] }[mode] || ['SEPT', 'LABOR DAY', 'WEEKEND'];
  R(ctx, '#fff6e4', 46, 130, 110, 124); R(ctx, '#d83a34', 46, 130, 110, 34); label(ctx, cal[0], 101, 157, 30, '#fff6e4'); label(ctx, cal[1], 101, 206, 22, '#16241b'); label(ctx, cal[2], 101, 232, 22, '#16241b');
  if (winter) { R(ctx, '#805c30', 172, 122, 48, 76); R(ctx, '#efe0b7', 176, 126, 40, 68); R(ctx, '#3f6fb0', 188, 130, 16, 24); R(ctx, '#f3ecd2', 194, 130, 4, 24); R(ctx, '#d8a820', 182, 152, 28, 28); R(ctx, '#f0d060', 188, 158, 16, 16); } // the medal, framed
  if (tree) {
    for (let i = 0; i < 5; i++) R(ctx, i & 1 ? '#27702f' : '#2e7e39', 300 - (22 + i * 16), 286 + i * 38, (22 + i * 16) * 2, 40);
    R(ctx, '#5a3a22', 290, 476, 20, 30); R(ctx, '#ffd84a', 292, 268, 16, 18);
    for (let i = 0; i < 14; i++) { const on = calm || Math.floor(t * 2 + i) % 3; R(ctx, on ? ['#e2483d', '#ffd84a', '#3f8fd0'][i % 3] : '#144221', 300 + Math.sin(i * 2.4) * (16 + i * 4.4), 300 + i * 13, 8, 8); }
    R(ctx, '#d83a34', 330, 500, 50, 34); R(ctx, '#ffd84a', 352, 500, 6, 34); R(ctx, '#3f8fd0', 232, 510, 40, 26); R(ctx, '#fff6e4', 250, 510, 5, 26);
    INLAWS.forEach((look, i) => person(ctx, 150 + i * 56, 560, look));
    person(ctx, 66, 568, { ...KEETCH.look, ...SANTA });
  } else if (mode === 'packed') {
    R(ctx, '#3a3f4a', 250, 516, 60, 50); R(ctx, '#22242c', 268, 504, 24, 12); R(ctx, '#c8ccd4', 250, 536, 60, 4); // one bag, packed
    person(ctx, 180, 568, KEETCH.look, 3, calm ? 0 : Math.abs(Math.sin(t * 6)) * 4);
  } else { // home: every so often he flinches, and what he is thinking about is green
    person(ctx, 180, 568, KEETCH.look, 3, !calm && Math.floor(t * 1.4) % 3 === 0 ? 5 : 0);
    R(ctx, '#fff6e4', 232, 372, 104, 68); R(ctx, '#fff6e4', 224, 444, 12, 10); R(ctx, '#fff6e4', 212, 460, 8, 6);
    for (let i = 0; i < 6; i++) R(ctx, 'rgba(120,180,50,.85)', 242 + (i * 17) % 70, 382 + (i * 23) % 40, 16, 12);
  }
}

function plane(ctx, t, calm, home) {
  ctx.save();
  if (home) { ctx.translate(W, 0); ctx.scale(-1, 1); } // going home it flies the other way, into the evening
  bands(ctx, home ? ['#3a2a5a', '#6a3a6a', '#b05a5a', '#e88a5a', '#f8c080'] : ['#3f8fd0', '#55a0dc', '#6cb2e6', '#86c4ee', '#a4d6f4'], 0, 560); bands(ctx, home ? ['#2a3a6a', '#22305a'] : ['#2f7fc0', '#2a72b0'], 560, H);
  const drift = calm ? 0 : t;
  for (let i = 0; i < 6; i++) cloud(ctx, wrap(i * 150 - drift * (30 + i * 9), W + 160) - 120, 60 + (i * 97) % 440, 1 + (i % 3) * 0.4);
  for (let i = 0; i < 12; i++) R(ctx, '#8cc8f0', wrap(i * 61 - drift * 50, W + 40) - 20, 580 + (i * 37) % 110, 18, 3);
  const y = 300 + (calm ? 0 : Math.sin(t * 2) * 5);
  R(ctx, '#e2483d', 58, y - 46, 36, 50); R(ctx, '#e2483d', 70, y - 58, 22, 14);                            // tail
  R(ctx, '#f3f6fa', 62, y, 290, 56); R(ctx, '#f3f6fa', 352, y + 8, 22, 42); R(ctx, '#f3f6fa', 374, y + 18, 12, 24); // body and nose
  R(ctx, '#2f6fb0', 62, y + 38, 312, 5); R(ctx, '#1b1b22', 350, y + 12, 18, 12);
  [KEETCH, ...FRIENDS].forEach((f, i) => { R(ctx, '#1b1b22', 82 + i * 22, y + 10, 18, 18); face(ctx, f.look, 85 + i * 22, y + 13, 12); });
  R(ctx, '#c8ccd4', 170, y + 44, 120, 14); R(ctx, '#b4bac4', 196, y + 58, 80, 12); R(ctx, '#a0a6b2', 218, y + 70, 44, 10); R(ctx, '#3a3f4a', 196, y + 60, 34, 16); // wing, engine
  ctx.restore();
}

/** The group chat, as read from a middle seat. */
function phone(ctx, t, calm) {
  bands(ctx, ['#1a1e2a', '#22283a'], 0, H);
  for (let i = 0; i < 3; i++) { R(ctx, '#3a3f4a', 26 + i * 140, 36, 100, 96); R(ctx, '#e88a5a', 34 + i * 140, 44, 84, 80); R(ctx, '#f8c080', 34 + i * 140, 96, 84, 28); } // cabin windows
  R(ctx, '#1b1b22', 96, 152, 240, 410); R(ctx, '#f3f6fa', 106, 174, 220, 366); R(ctx, '#2f6fb0', 106, 174, 220, 36); label(ctx, 'THE BOYS', 216, 200, 24, '#fff6e4');
  [['Foff', 'Korn is a GFR.'], ['Korn', 'You\'re the GFR.'], ['Squanto', 'Dude. GFR as can be.'], ['Bent', '*cough* gfr']].forEach(([who, text], i) => {
    const y = 220 + i * 56; R(ctx, '#dfe3ea', 114, y, 196, 48); label(ctx, who.toUpperCase(), 122, y + 17, 16, '#6a5a4a', 'left'); label(ctx, text, 122, y + 40, 22, '#16241b', 'left');
  });
  if (calm || t % 2.4 > 0.5) { R(ctx, '#d83a34', 56, 452, 320, 52); R(ctx, '#fff6e4', 60, 456, 312, 44); label(ctx, 'CHAT CANCELLED', 216, 488, 36, '#d83a34'); }
}

function van(ctx, t, calm) {
  bands(ctx, ['#f08a5c', '#f4a66c', '#f8c080', '#fcd89c'], 0, 330); R(ctx, '#ffd84a', 300, 250, 60, 60);
  bands(ctx, ['#2f7fc0', '#2a72b0', '#2565a0'], 330, 450);
  const go = calm ? 0 : t * 140;
  for (let i = 0; i < 5; i++) { const x = wrap(i * 130 - go * 0.5, W + 120) - 60; R(ctx, '#144221', x, 370, 20, 90); R(ctx, '#1f5f2e', x - 16, 350, 52, 34); R(ctx, '#174a25', x - 8, 334, 36, 22); } // cypress
  R(ctx, '#3a8a3f', 0, 450, W, 60); R(ctx, '#4a4d55', 0, 510, W, 110); R(ctx, '#3a8a3f', 0, 620, W, H - 620);
  for (let i = 0; i < 6; i++) R(ctx, '#ffd84a', wrap(i * 90 - go, W + 90) - 45, 562, 44, 6);
  const y = 468 + (calm ? 0 : Math.round(Math.abs(Math.sin(t * 9)) * 3));
  R(ctx, '#f3f6fa', 96, y, 250, 84); R(ctx, '#f3f6fa', 346, y + 30, 26, 54); R(ctx, '#c8ccd4', 96, y + 70, 276, 14); R(ctx, '#ffd84a', 366, y + 52, 8, 10);
  R(ctx, '#7cc4f0', 330, y + 10, 18, 26);
  [KEETCH, ...FRIENDS].slice(0, 9).forEach((f, i) => { R(ctx, '#1b1b22', 104 + i * 25, y + 10, 21, 24); face(ctx, f.look, 108 + i * 25, y + 16, 13); });
  for (const x of [130, 300]) { R(ctx, '#1b1b22', x, y + 68, 34, 34); R(ctx, '#8a8f9a', x + 11, y + 79, 12, 12); }
}

function house(ctx, t, calm) {
  bands(ctx, ['#86c4ee', '#a4d6f4', '#c4e6f8'], 0, 300); R(ctx, '#3a8a3f', 0, 300, W, 210);
  R(ctx, '#1f5f2e', 0, 150, 120, 150); R(ctx, '#2e7e39', 280, 120, 152, 180); R(ctx, '#174a25', 320, 100, 80, 60);            // oaks behind the roof
  R(ctx, '#8a6038', 300, 150, 56, 80); R(ctx, '#3a2a1c', 294, 142, 68, 12);                                                // chimney
  R(ctx, '#b5532f', 10, 216, 412, 44); for (let x = 10; x < 422; x += 14) R(ctx, '#8f3f22', x, 216, 3, 44); R(ctx, '#7a3218', 10, 256, 412, 6);
  R(ctx, '#e3cfa8', 26, 262, 380, 240); R(ctx, '#d2bc92', 26, 480, 380, 22);
  R(ctx, '#3a2a1c', 96, 318, 180, 184); for (let i = 0; i < 4; i++) { R(ctx, '#7cc4f0', 104 + i * 43, 326, 35, 168); R(ctx, '#f8c080', 104 + i * 43, 326, 35, 40); }   // the glass doors, with the sunrise in them
  R(ctx, '#3a2a1c', 300, 326, 92, 96); R(ctx, '#7cc4f0', 306, 332, 37, 84); R(ctx, '#7cc4f0', 349, 332, 37, 84);
  R(ctx, '#8a7a66', 0, 502, W, H - 502); for (let y = 540; y < H; y += 46) R(ctx, '#7a6a58', 0, y, W, 2);
  R(ctx, '#7a5230', 6, 520, 40, 60); for (let i = 0; i < 9; i++) R(ctx, i % 3 ? '#d83a8a' : '#2e7e39', 2 + (i * 17) % 46, 478 + (i * 11) % 42, 8, 8); // the bougainvillea
  [KEETCH, ...FRIENDS].forEach((f, i) => person(ctx, 62 + i * 31, i & 1 ? 552 : 572, f.look, 2, !calm && !i ? Math.abs(Math.sin(t * 6)) * 3 : 0));
}

// The narration has no speaker. Keep each line short enough for the box.
export const INTRO = [
  { draw: (ctx, t, calm) => room(ctx, t, calm, 'xmas'), lines: ['Labor Day weekend. In the timeline you know, Keetch\'s in-laws held Christmas. In September.', 'He missed Foff\'s bachelor party. He has heard about it ever since.'] },
  { draw: (ctx, t, calm) => room(ctx, t, calm, 'packed'), lines: ['This is the other timeline. Christmas stayed in December, where it lives.', 'So Keetch packed a bag.'] },
  { draw: plane, lines: ['Wednesday, September 2. Twelve men fly to San Francisco.', 'One of them is a sasquatch. The airline did not ask.'] },
  { draw: van, lines: ['A sixteen-passenger van. A bath house. A dinner Steeze hated. Then south, to Monterey.'] },
  { draw: house, lines: ['Four days. Four golf courses. One groom in an umbrella hat.', 'Keetch has never golfed. He is good with horses. Nobody thinks this will matter.', 'It will matter.'] },
];

// How it ended: shown after the race to the airport, and from the bottom of the trip.
export const OUTRO = [
  { draw: (ctx, t, calm) => plane(ctx, t, calm, true), lines: ['Sunday night. Twelve men fly home. Eleven of them sleep.', 'Squanto gets a row to himself. Nobody had to ask.'] },
  { draw: phone, lines: ['Somewhere over Nevada, the group chat is cancelled.', 'The charge is calling each other a "GFR". It stands for three words, and none of them can be said on a plane.', 'An apology is drafted. It calls whoever complained a GFR.'] },
  { draw: (ctx, t, calm) => room(ctx, t, calm, 'home'), lines: ['Keetch is home. He still holds his breath when a van door slides shut.', 'His doctor has written "abalone-related" on a form. There is no treatment.'] },
  { draw: (ctx, t, calm) => room(ctx, t, calm, 'december'), lines: ['In December, the in-laws have Christmas. In December.', 'The medal goes on the wall. Nobody has checked.', 'The horse is never told.'] },
];
