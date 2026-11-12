// Where a player's bet chip goes on a phone felt. Pure geometry in pixels, so it can be tested with node --test.
//
// On a wide felt there is room to put every bet at a fixed fraction of the way to the middle. On an upright phone
// the seats, the board and the pot fill most of the oval, and a fixed fraction put blinds underneath a neighbour's
// name plate. Here the chip takes the free spot on the felt that is nearest its own seat: it may not touch a seat,
// the board, the pot or another chip. TableFelt measures those rectangles from the page and passes them in.

const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
export const rectAt = (x, y, hw, hh) => ({ x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh });

/**
 * from: the seat's centre. chip: { hw, hh } half sizes. blocks: rectangles to stay clear of.
 * felt: { cx, cy, rx, ry }, the oval the chip must stay on. outside: optional { rx, ry } of an inner oval (same
 * centre) that no corner of the chip may enter, which keeps it in the band along the rim. side: optional
 * { x, y, dx, dy }, the chip's centre must lie on the (dx, dy) side of that point. core: how much of the chip's
 * box the ovals are tested against (a heap of chips has empty corners; blocks still use the whole box).
 * Returns { x, y, clear }.
 * When the felt has no free spot at all, the least-covered one is returned with clear: false.
 */
export function chipSpot({ from, chip, blocks, felt, outside, side, core = 1, step = 4 }) {
  const cw = chip.hw * core, ch = chip.hh * core;
  const rx = Math.max(1, felt.rx - cw), ry = Math.max(1, felt.ry - ch);
  let best = null, least = null;
  for (let y = felt.cy - ry; y <= felt.cy + ry; y += step) {
    for (let x = felt.cx - rx; x <= felt.cx + rx; x += step) {
      if (((x - felt.cx) / rx) ** 2 + ((y - felt.cy) / ry) ** 2 > 1) continue;
      if (side && (x - side.x) * side.dx + (y - side.y) * side.dy < 0) continue;
      const r = rectAt(x, y, chip.hw, chip.hh);
      if (outside && [x - cw, x + cw].some((px) => [y - ch, y + ch].some((py) => ((px - felt.cx) / outside.rx) ** 2 + ((py - felt.cy) / outside.ry) ** 2 < 1))) continue;
      const dist = (x - from.x) ** 2 + (y - from.y) ** 2;
      let cover = 0;
      for (const b of blocks) if (hit(r, b)) cover += (Math.min(r.x1, b.x1) - Math.max(r.x0, b.x0)) * (Math.min(r.y1, b.y1) - Math.max(r.y0, b.y0));
      if (cover === 0) { if (!best || dist < best.dist) best = { x, y, dist }; }
      else if (!least || cover < least.cover || (cover === least.cover && dist < least.dist)) least = { x, y, dist, cover };
    }
  }
  const at = best || least || { x: felt.cx, y: felt.cy };
  return { x: at.x, y: at.y, clear: !!best };
}
