// v41 slot art: original 8-bit pixel sprites (see pixslots.js) placed inside the same SVG frames v39 used, so the WILD /
// DEED / value overlays, the drop/pop/shake animations and reduced motion all keep working. Three lil' sasquatches
// (Pip, Bramble, Boulder), their houses (straw, sticks, stone), the forest low symbols (acorn, toadstool, pinecone and the
// frankfurter, which is the old "berry" key), the deed scatter, golden acorns and the King Rat.
import React from 'react';
import { slotPixUrl } from './pixslots.js';

const SV = ({ children, label }) => <svg viewBox="0 0 100 100" className="sym-svg" role="img" aria-label={label}>{children}</svg>;
/** One sprite as an SVG <image>, scaled with nearest-neighbour so the pixels stay square. */
export function Pix({ name, x = 0, y = 0, w = 100, h = 100, className }) {
  const href = slotPixUrl(name);
  return href ? <image href={href} x={x} y={y} width={w} height={h} className={`pix ${className || ''}`} style={{ imageRendering: 'pixelated' }} preserveAspectRatio="xMidYMid meet" data-pix={name} /> : null;
}

export const LABELS = { acorn: 'acorn', shroom: 'toadstool', cone: 'pinecone', berry: 'frankfurter' };

export function House({ kind, broken = false }) {
  return <g className={broken ? 'house broken' : 'house'}><Pix name={broken ? `${kind}-broken` : kind} /></g>;
}
export function Squatch({ who }) { return <Pix name={who} />; }

/** The giant King Rat (also the WILD): fat grey rat, gold crown, red cape, pink tail. */
export function KingRat({ pose = 'stand', small = false }) {
  if (small) return <g className="rat pose-small"><Pix name="W" x={4} y={0} w={92} h={92} /></g>;
  return <g className={`rat pose-${pose}`}><Pix name={pose === 'toot' ? 'rat-toot' : 'rat'} /></g>;
}

export function Sym({ s, v, broken }) {
  if (LABELS[s]) return <SV label={LABELS[s]}><Pix name={s} /></SV>;
  if (s === 'straw' || s === 'sticks' || s === 'stone') return <SV label={`${s} house`}><House kind={s} broken={broken} /></SV>;
  if (s === 'pip' || s === 'bramble' || s === 'boulder') return <SV label={s}><Squatch who={s} /></SV>;
  if (s === 'W') return <SV label="King Rat wild"><KingRat small /><text x="50" y="97" textAnchor="middle" className="sym-tag wild">WILD</text></SV>;
  if (s === 'S') return <SV label="deed scatter"><Pix name="S" y={6} w={100} h={94} /><text x="50" y="14" textAnchor="middle" className="sym-tag deed">DEED</text></SV>;
  if (s === 'G') return <SV label="golden acorn"><Pix name="G" />{v != null && <text x="50" y="72" textAnchor="middle" className={`sym-val ${typeof v === 'string' ? 'jp' : ''}`}>{typeof v === 'string' ? v : `${v}x`}</text>}</SV>;
  return <SV label="" />;
}

/** The green cloud. */
export function Cloud() {
  return <svg viewBox="0 0 200 125" className="toot-cloud-svg" aria-hidden="true"><Pix name="cloud" w={200} h={125} /></svg>;
}
