import React, { useEffect, useRef } from 'react';
import { RUBBLE } from '../../../server/engine/maze.js';

export default function MineMap({ maze, explored, pools, pose, onClose, returnFocus }) {
  const dialog = useRef(null);
  useEffect(() => {
    const el = dialog.current; el.showModal();
    return () => { el.close(); returnFocus.current?.focus({ preventScroll: true }); };
  }, []);
  const knownPools = pools.filter(p => explored.pools.has(p.id));
  const wet = knownPools.filter(p => p.remaining > 0).length;
  const door = explored.tiles.has(`${maze.start.x},${maze.start.y}`);
  const behindX = maze.facing === 0;
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
          {[...explored.tiles].map(key => {
            const [x, y] = key.split(',').map(Number), tile = maze.grid[y][x];
            return <g key={key}>
              <rect x={x - 0.5} y={y - 0.5} width="1" height="1" className={tile === 0 ? 'm-map-tunnel' : 'm-map-rock'} />
              {tile === RUBBLE && <path d={`M${x - 0.3},${y - 0.3}l.6,.6m0,-.6l-.6,.6`} className="m-map-rubble" />}
            </g>;
          })}
          {knownPools.map(p => <circle key={p.id} data-pool={p.id} cx={p.x} cy={p.y} r=".32" className={`m-map-pool${p.remaining > 0 ? ' wet' : ''}`}><title>{p.remaining > 0 ? 'Acid pool' : p.quantity == null ? 'Seeping pool' : 'Empty pool'}</title></circle>)}
          {door && <rect data-test="map-door" x={maze.start.x - (behindX ? 0.6 : 0.38)} y={maze.start.y - (behindX ? 0.38 : 0.6)} width={behindX ? 0.22 : 0.76} height={behindX ? 0.76 : 0.22} className="m-map-door"><title>Red door · Hall of Doors</title></rect>}
          <path data-test="map-player" d="M0,-.46 L.3,.3 0,.16 -.3,.3 Z" transform={`translate(${pose.x} ${pose.y}) rotate(${-pose.yaw * 180 / Math.PI})`} className="m-map-you"><title>You · facing this way</title></path>
        </svg>
      </div>
      <div className="m-map-legend">
        <span><i className="m-map-key-you">▲</i> YOU</span><span><i className="m-map-key-acid">●</i> ACID</span>
        <span><i>○</i> EMPTY / SEEPING</span><span><i className="m-map-key-door">▰</i> RED DOOR</span>
      </div>
      <p className="m-map-note">Still on the clock.</p>
    </dialog>
  );
}
