// Player avatars: a low-poly bust that sits in a seat and makes small living movements (nods, breathing,
// a blink or head tilt), each player slightly out of step with the others. Photo avatars are the stylized
// low-poly image the player made at sign-in; everyone else gets an original generated bust.
import React, { useMemo } from 'react';
import { headParts, looks, shade, hashSeed } from './genbust.js';
import { HeadWear, BodyWear, shirtOf } from './wear.js';

function Shoulders({ shirt, seed }) {
  const polys = useMemo(() => {
    const P = [[6, 110], [16, 88], [30, 79], [42, 76], [50, 82], [58, 76], [70, 79], [84, 88], [94, 110]];
    const mid = [[50, 110], [30, 98], [70, 98], [50, 92]];
    const out = [];
    const add = (a, b, c, f) => out.push({ d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}Z`, fill: shade(shirt, f) });
    add(P[0], P[1], mid[1], -0.18); add(P[1], P[2], mid[1], -0.05); add(P[2], P[3], mid[1], 0.08); add(P[3], mid[3], mid[1], 0.02);
    add(mid[1], mid[3], mid[0], -0.1); add(P[0], mid[1], mid[0], -0.25);
    add(P[8], P[7], mid[2], -0.3); add(P[7], P[6], mid[2], -0.16); add(P[6], P[5], mid[2], -0.06); add(P[5], mid[3], mid[2], -0.1);
    add(mid[2], mid[3], mid[0], -0.2); add(P[8], mid[2], mid[0], -0.34);
    return out;
  }, [shirt, seed]);
  return polys.map((p, i) => <path key={i} d={p.d} fill={p.fill} />);
}

function GenHead({ seed }) {
  const h = useMemo(() => headParts(seed), [seed]);
  const { L, cx, cy } = h;
  return (
    <svg viewBox="-4 -12 68 84" className="b-headsvg" aria-hidden="true">
      {h.ears.map((p, i) => <path key={`e${i}`} d={p.d} fill={p.fill} />)}
      {h.skin.map((p, i) => <path key={i} d={p.d} fill={p.fill} stroke={p.fill} strokeWidth=".3" />)}
      {h.beard.map((p, i) => <path key={`b${i}`} d={p.d} fill={p.fill} />)}
      {h.hair.map((p, i) => <path key={`h${i}`} d={p.d} fill={p.fill} stroke={p.fill} strokeWidth=".3" />)}
      {L.brows && <g stroke={shade(L.hair, -0.3)} strokeWidth="1.6" strokeLinecap="round"><path d={`M${cx - 11} ${cy - 5} L${cx - 4} ${cy - 6}`} /><path d={`M${cx + 11} ${cy - 5} L${cx + 4} ${cy - 6}`} /></g>}
      <g className="b-eyes"><ellipse cx={cx - 7} cy={cy} rx="2" ry="2.3" fill="#1b1512" /><ellipse cx={cx + 7} cy={cy} rx="2" ry="2.3" fill="#1b1512" /></g>
      <path d={`M${cx} ${cy + 1} L${cx - 2.5} ${cy + 8} L${cx + 2} ${cy + 8} Z`} fill={shade(L.skin, -0.18)} />
      <path d={`M${cx - 5} ${cy + 13} Q${cx} ${cy + 15.5} ${cx + 5} ${cy + 13}`} stroke={shade(L.skin, -0.45)} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function avatarSrc(id, avatar) { return avatar?.kind === 'photo' ? `/api/avatars/${id}.png?v=${avatar.v || 0}` : null; }

/**
 * id: player id (seed + photo url). avatar: {kind, v, seed} from the server. size: px width.
 * state: '' | 'win' | 'folded' | 'toact'. still: no animation. phase: animation offset (0..1).
 */
export function Bust({ id, avatar, size = 64, state = '', still = false, relaxed = false, phase, title, src: srcOverride }) {
  const seed = avatar?.seed || id || 'x';
  const L = useMemo(() => looks(seed), [seed]);
  const src = srcOverride || avatarSrc(id, avatar);
  const h = hashSeed(String(id || seed));
  const ph = phase ?? (h % 1000) / 1000;
  const style = { width: size, height: size * 1.1, '--dur': `${5.5 + (h % 7) * 0.45}s`, '--delay': `${-ph * 9}s`, '--blink': `${3.8 + (h % 5) * 0.7}s` };
  return (
    <div className={`bust ${still ? 'still' : ''} ${state}${relaxed ? ' relaxed' : ''}`} style={style} title={title} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title}>
      <svg viewBox="0 0 100 110" className="b-body"><rect x="42" y="62" width="16" height="22" fill={shade(L.skin, -0.25)} /><Shoulders shirt={shirtOf(avatar?.wear, L.shirt)} seed={seed} /><BodyWear wear={avatar?.wear} /></svg>
      <div className="b-head">
        {src ? <img src={src} alt="" draggable="false" className="b-photo" /> : <GenHead seed={seed} />}
        <HeadWear wear={avatar?.wear} photo={!!src} />
      </div>
    </div>
  );
}
