// Player avatars: a low-poly bust that sits in a seat and makes small living movements (nods, breathing,
// a blink or head tilt), each player slightly out of step with the others. Photo avatars are the stylized
// low-poly image the player made at sign-in; everyone else gets an original generated bust.
import React, { useMemo } from 'react';
import { headParts, looks, shade, hashSeed } from './genbust.js';
import { HeadWear, BodyWear, shirtOf, PHOTO_FIT } from './wear.js';
import { useEventTheme } from '../themes/event-store.js';

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

function GenHead({ seed, skinTone }) {
  const h = useMemo(() => headParts(seed, skinTone), [seed, skinTone]);
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

/** Thanksgiving pilgrim overlay: black capotain with a buckle, white collar, dark coat.
 *  Drawn over the bust; never written into saved avatar.wear. */
function PilgrimHat({ photo = false }) {
  const [ax, ay] = [30, 17];
  const fit = photo ? PHOTO_FIT.hat : null;
  const transform = fit ? `translate(${fit[1][0]} ${fit[1][1]}) scale(${fit[0]}) translate(${-ax} ${-ay})` : undefined;
  return (
    <svg viewBox="-4 -12 68 84" className="b-pilgrim-hat" aria-hidden="true" data-test="pilgrim-hat" overflow="visible">
      <g transform={transform}>
        <ellipse cx="30" cy="15" rx="26" ry="3.6" fill="#1a1612" />
        <path d="M16 15 L18 -16 L42 -16 L44 15 Z" fill="#141210" />
        <path d="M18 -16 L42 -16 L41.2 -19 L18.8 -19 Z" fill="#0c0a09" />
        <rect x="17.5" y="8" width="25" height="4.2" fill="#2a241c" />
        <rect x="26.5" y="6.6" width="7" height="6.6" fill="none" stroke="#d4a04a" strokeWidth="1.5" />
        <rect x="28.2" y="8.4" width="3.6" height="3" fill="#d4a04a" />
      </g>
    </svg>
  );
}
function PilgrimCoat() {
  return (
    <g className="b-pilgrim-coat" data-test="pilgrim-coat">
      <path d="M6 110 L16 86 L30 76 L44 80 L48 110 Z" fill="#1a1612" />
      <path d="M94 110 L84 86 L70 76 L56 80 L52 110 Z" fill="#1a1612" />
      <path d="M22 110 L32 80 L44 80 L48 110 Z" fill="#221c18" />
      <path d="M78 110 L68 80 L56 80 L52 110 Z" fill="#1d1814" />
      <path d="M36 74 L50 86 L43 94 L34 80 Z" fill="#f4efe6" />
      <path d="M64 74 L50 86 L57 94 L66 80 Z" fill="#fbf7f0" />
      <path d="M49 86 L51 86 L51 110 L49 110 Z" fill="#2a241c" />
    </g>
  );
}

export function avatarSrc(id, avatar) { return avatar?.kind === 'photo' ? `/api/avatars/${id}.png?v=${avatar.v || 0}` : null; }

/**
 * id: player id (seed + photo url). avatar: {kind, v, seed, skinTone} from the server. size: px width.
 * state: '' | 'win' | 'folded' | 'toact'. still: no animation. phase: animation offset (0..1).
 */
export function Bust({ id, avatar, size = 64, state = '', still = false, relaxed = false, phase, title, src: srcOverride }) {
  const seed = avatar?.seed || id || 'x';
  const skinTone = avatar?.skinTone;
  const L = useMemo(() => looks(seed, skinTone), [seed, skinTone]);
  const src = srcOverride || avatarSrc(id, avatar);
  const h = hashSeed(String(id || seed));
  const ph = phase ?? (h % 1000) / 1000;
  const style = { width: size, height: size * 1.1, '--dur': `${5.5 + (h % 7) * 0.45}s`, '--delay': `${-ph * 9}s`, '--blink': `${3.8 + (h % 5) * 0.7}s` };
  const festive = useEventTheme();
  return (
    <div className={`bust ${still ? 'still' : ''} ${state}${relaxed ? ' relaxed' : ''}${festive ? ' pilgrim' : ''}`} style={style} title={title} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title}>
      <svg viewBox="0 0 100 110" className="b-body"><rect x="42" y="62" width="16" height="22" fill={shade(L.skin, -0.25)} /><Shoulders shirt={shirtOf(avatar?.wear, L.shirt)} seed={seed} /><BodyWear wear={avatar?.wear} />{festive && <PilgrimCoat />}</svg>
      <div className="b-head">
        {src ? <img src={src} alt="" draggable="false" className="b-photo" /> : <GenHead seed={seed} skinTone={skinTone} />}
        <HeadWear wear={avatar?.wear} photo={!!src} />
        {festive && <PilgrimHat photo={!!src} />}
      </div>
    </div>
  );
}
