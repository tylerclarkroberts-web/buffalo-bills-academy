// A bug's trading card: what it is, what it does, what beats it. Everything on it comes from the species' sheet and
// the fight rules (server/engine); nothing is typed in here. Pass `bug` for one of your own: its name, level, record
// and what it is wearing. Without one it is the species' card, at level 1 strength.
import React, { useEffect, useRef } from 'react';
import { BY_ID, ROSTER } from '../../../server/engine/creatures.js';
import { movesFor, traitFor, combatStats } from '../../../server/engine/bug-combat.js';
import { TYPES, RARITY, LIVE_TYPES, typeOf, rarityOf, weakTo, perkFor } from '../../../server/engine/bug-types.js';
import { drawBug, isHiResSprite, onSpriteReady } from './sprite.js';
import './bugcard.css';

const GLYPH = { // 16 x 16, one filled path each
  flier: 'M1 12Q7 1 15 3 11 7 14 11 8 9 1 12Z', brawler: 'M4 14Q0 7 6 1 5 7 8 9 11 7 10 1 16 7 12 14Z',
  shell: 'M8 1 14 4V8Q14 13 8 15 2 13 2 8V4Z', toxic: 'M8 1Q13 8 13 10.5A5 5 0 0 1 3 10.5Q3 8 8 1Z',
  ambush: 'M1 8Q8 1 15 8 8 15 1 8ZM8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 1 0 8 5.5Z', dazzle: 'M8 0 10 6 16 8 10 10 8 16 6 10 0 8 6 6Z',
  fire: 'M8 1Q13 6 11 9 14 9 12 13A5 5 0 0 1 4 12Q3 8 6 7 6 4 8 1Z', sonic: 'M1 6h2v4H1zM5 3h2v10H5zM9 5h2v6H9zM13 7h2v2h-2z',
  water: 'M1 5q3.5-4 7 0t7 0v3q-3.5-4-7 0t-7 0zM1 10q3.5-4 7 0t7 0v3q-3.5-4-7 0t-7 0z',
};
const DOES = { strike: '', guard: 'and guards', venom: 'and poisons', pierce: 'through armour', heal: 'heals', weaken: 'and weakens', flourish: 'shows off. No damage' };

/** The types some species has that `type` beats, and the ones that beat it. */
export const matchups = (type) => ({ beats: (TYPES[type]?.beats || []).filter((t) => LIVE_TYPES.includes(t)), weak: weakTo(type).filter((t) => LIVE_TYPES.includes(t)) });

export function TypeChip({ type, small = false }) {
  const t = TYPES[type]; if (!t) return null;
  return <span className={`bc-type${small ? ' small' : ''}`} style={{ '--tc': t.color }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={GLYPH[type]} fillRule="evenodd" fill="currentColor" /></svg>{t.name}</span>;
}

function Art({ bug, style, level }) {
  const ref = useRef(null);
  const [photo, setPhoto] = React.useState(bug.id === 'steeze' ? '/api/steeze.png' : null);
  useEffect(() => {
    if (photo) return undefined;
    const paint = () => {
      const c = ref.current; if (!c) return;
      c.width = 448; c.height = 252;
      const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
      drawBug(x, bug, { w: c.width, h: c.height, still: true, fill: 1, style, level });
    };
    paint();
    return onSpriteReady(paint);
  }, [bug.id, level, JSON.stringify(style || null), photo]);
  if (bug.id === 'steeze' && photo) {
    return (
      <div className="steeze-art-wrap" aria-hidden="true">
        <img className="steeze-art" src={photo} alt="" onError={() => setPhoto(null)} />
      </div>
    );
  }
  return <canvas ref={ref} className={`bc-art${isHiResSprite(bug, style, level) ? ' hi-res' : ''}`} aria-hidden="true" />;
}

export default function BugCard({ species, bug = null }) {
  const b = BY_ID[species]; if (!b) return null;
  const type = typeOf(species), rarity = RARITY[rarityOf(species)], level = bug?.level ?? 10, { beats, weak } = matchups(type);
  const moves = movesFor(species, 10), trait = traitFor(species), perk = perkFor(type), no = ROSTER.indexOf(b) + 1;
  const record = bug?.record ? `${bug.record.w}–${bug.record.l}` : null;
  return (
    <article className={`bugcard r${rarityOf(species)}`} style={{ '--tc': TYPES[type]?.color || '#c8b888' }} data-test="bug-card" aria-label={`${bug?.name || b.name}, ${TYPES[type]?.name} type`}>
      <header>
        <small>{b.order}{bug ? ` · ${b.name}` : ''}</small>
        <h3>{bug?.name || b.name}</h3>
        <b className="bc-hp num">{bug?.maxHp || combatStats(bug?.level ?? 1).maxHp}<i>HP</i></b>
        <TypeChip type={type} />
      </header>
      <div className="bc-window"><Art bug={b} style={bug?.style} level={level} /><i className="bc-foil" aria-hidden="true" /></div>
      <p className="bc-strip"><i>{b.sci}{b.genus ? ' (genus)' : ''}</i>{b.size ? ` · ${b.size.replace(/\.$/, '')}` : ''}{bug ? ` · Lv ${level}${record ? ` · ${record}` : ''}` : ''}</p>
      <ul className="bc-moves">
        {moves.map((m) => (
          <li key={m.id} className={bug && level < m.level ? 'locked' : ''}>
            <span className="bc-lv num" title={`Learned at level ${m.level}`}>{m.level}</span>
            <b>{m.name}</b>
            <small>{DOES[m.effect]}</small>
            <span className="bc-pow num">{m.effect === 'heal' ? `+${m.heal}` : m.power}</span>
          </li>
        ))}
      </ul>
      {trait && <p className="bc-trait"><b>{trait.name}.</b> {trait.description}</p>}
      {perk && <p className="bc-trait bc-perk"><b>{TYPES[type].name}: {perk.name}.</b> {perk.description}</p>}
      <dl className="bc-match">
        <div><dt>weak to</dt><dd>{weak.map((t) => <TypeChip key={t} type={t} small />)}</dd></div>
        <div><dt>beats</dt><dd>{beats.map((t) => <TypeChip key={t} type={t} small />)}</dd></div>
      </dl>
      <p className="bc-fact">{b.facts[(no * 7) % b.facts.length]}</p>
      <footer><span>{rarity.mark} {rarity.name}</span><span className="num">{String(no).padStart(2, '0')}/{ROSTER.length}</span></footer>
    </article>
  );
}
