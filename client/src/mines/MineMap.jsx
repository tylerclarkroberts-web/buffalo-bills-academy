import React, { useEffect, useRef } from 'react';
import { RUBBLE } from '../../../server/engine/maze.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { entranceLayout } from './entrance.js';
import { TYPES, typeOf, rarityOf } from '../../../server/engine/bug-types.js';

/** How a wild bug is named on screen: a released one (a stray) says whose it was. */
export const wildWhat = (w) => (w.stray ? `${w.stray.owner}'s abandoned ${w.stray.name}` : `${rarityOf(w.species) === 4 ? 'LEGENDARY' : 'wild'} ${BY_ID[w.species]?.name || 'bug'}`);

export default function MineMap({ maze, explored, pools, wilds = [], pose, onClose, returnFocus }) {
  const dialog = useRef(null);
  useEffect(() => {
    const el = dialog.current; el.showModal();
    return () => { el.close(); returnFocus.current?.focus({ preventScroll: true }); };
  }, []);
  const knownPools = pools.filter(p => explored.pools.has(p.id));
  const wet = knownPools.filter(p => p.remaining > 0).length;
  const bugs = wilds.map(w => ({ ...w, label: `${wildWhat(w).replace(/^w/, 'W')} · ${TYPES[typeOf(w.species)]?.name || 'bug'} · Lv ${w.level}` }));
  const entranceKnown = explored.tiles.has(`${maze.start.x},${maze.start.y}`);
  const { lift, door } = entranceLayout(maze);
  return (
    <dialog ref={dialog} className="m-map" data-test="mine-map" aria-labelledby="mine-map-title"
      onCancel={e => { e.preventDefault(); onClose(); }}>
      <header className="m-map-head">
        <h2 id="mine-map-title">SHIFT MAP</h2>
        <button autoFocus className="m-link" onClick={onClose}>CLOSE<span className="m-key"> · M / ESC</span></button>
      </header>
      <p className="m-map-note">Walk to fill it in. New shift, new sheet.</p>
      <div className="m-map-chart">
        <svg viewBox={`-1 -1 ${maze.size + 2} ${maze.size + 2}`} role="img" aria-label={`Explored mine tunnels. You are at column ${Math.round(pose.x)}, row ${Math.round(pose.y)}. ${wet} known acid pools. Unexplored areas are blank.`}>
          {bugs.length > 0 && <desc>{bugs.map(b => `${b.label} at column ${b.x}, row ${b.y}.`).join(' ')}</desc>}
          {[...explored.tiles].map(key => {
            const [x, y] = key.split(',').map(Number), tile = maze.grid[y][x];
            return <g key={key}>
              <rect x={x - 0.5} y={y - 0.5} width="1" height="1" className={tile === 0 ? 'm-map-tunnel' : 'm-map-rock'} />
              {tile === RUBBLE && <path d={`M${x - 0.3},${y - 0.3}l.6,.6m0,-.6l-.6,.6`} className="m-map-rubble" />}
            </g>;
          })}
          {knownPools.map(p => <circle key={p.id} data-pool={p.id} cx={p.x} cy={p.y} r=".32" className={`m-map-pool${p.remaining > 0 ? ' wet' : ''}`}><title>{p.remaining > 0 ? 'Acid pool' : p.quantity == null ? 'Uninspected pool' : 'Empty pool'}</title></circle>)}
          {bugs.map(b => <path key={b.id} data-wild={b.id} transform={`translate(${b.x} ${b.y})`} d="M0,-.5 .5,0 0,.5 -.5,0 Z" className="m-map-wild"><title>{b.label}</title></path>)}
          {entranceKnown && <>
            <g data-test="map-lift" transform={`translate(${lift.x} ${lift.y}) rotate(${-lift.rotation * 180 / Math.PI})`}>
              <title>Lift · Surface</title>
              <rect x="-.29" y="-.12" width=".58" height=".24" className="m-map-lift" />
              <path d="M-.1,-.1v.2m.2,-.2v.2" className="m-map-lift-bars" />
            </g>
            <rect data-test="map-door" x="-.16" y="-.11" width=".32" height=".22" transform={`translate(${door.x} ${door.y}) rotate(${-door.rotation * 180 / Math.PI})`} className="m-map-door"><title>Red door · Hall of Doors</title></rect>
          </>}
          <path data-test="map-player" d="M0,-.46 L.3,.3 0,.16 -.3,.3 Z" transform={`translate(${pose.x} ${pose.y}) rotate(${-pose.yaw * 180 / Math.PI})`} className="m-map-you"><title>You · facing this way</title></path>
        </svg>
      </div>
      <div className="m-map-legend">
        <span><i className="m-map-key-you">▲</i> YOU</span><span><i className="m-map-key-acid">●</i> ACID</span>
        <span><i>○</i> EMPTY / UNKNOWN</span><span><i className="m-map-key-lift">▥</i> LIFT</span><span><i className="m-map-key-door">▰</i> RED DOOR</span>
        {bugs.map(b => <span className="m-map-wild-label" key={b.id}><i aria-hidden="true">◆</i> {b.label}</span>)}
      </div>
      <p className="m-map-note">Still on the clock.</p>
    </dialog>
  );
}
