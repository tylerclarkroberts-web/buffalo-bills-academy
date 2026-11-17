import React from 'react';

/**
 * One of the Last Crew, right in your face for under a second. Faceted like everything else in the mine.
 * pointer-events: none, so it can never eat a tap or a held MINE button. `calm` (reduce flashing) fades it in
 * instead of lunging and drops the white flash and the shake.
 */
export default function JumpScare({ calm }) {
  return (
    <div className={`m-scare${calm ? ' calm' : ''}`} data-test="jump-scare" aria-hidden="true">
      <svg viewBox="0 0 200 240" className="m-scare-face">
        {/* dented hard hat with a dead lamp */}
        <polygon points="30,70 50,30 100,16 150,30 172,70 100,62" fill="#5e4f1f" />
        <polygon points="50,30 100,16 100,62 30,70" fill="#4a3e17" />
        <polygon points="88,30 112,30 110,48 90,48" fill="#2b2716" />
        <polygon points="20,74 180,74 172,66 28,66" fill="#3b3212" />
        {/* the skull: facets, lit from one side */}
        <polygon points="34,74 166,74 176,128 160,190 128,224 72,224 40,190 24,128" fill="#e8e2d0" />
        <polygon points="34,74 100,74 92,140 24,128" fill="#f2ede0" />
        <polygon points="166,74 176,128 108,140 100,74" fill="#d6cfba" />
        <polygon points="24,128 92,140 72,224 40,190" fill="#ddd6c2" />
        <polygon points="176,128 160,190 128,224 108,140" fill="#c8c0aa" />
        {/* black-rimmed eyes, too wide open, one a little higher */}
        <polygon points="44,98 86,92 92,124 50,132" fill="#3a2222" />
        <polygon points="112,96 156,100 150,134 108,128" fill="#3a2222" />
        <polygon points="52,102 82,98 86,122 56,127" fill="#000" />
        <polygon points="118,102 150,105 145,129 113,124" fill="#000" />
        <circle cx="70" cy="112" r="2.5" fill="#fff" />
        <circle cx="131" cy="115" r="2.5" fill="#fff" />
        {/* the grin, pulled up nearly to the eyes */}
        <polygon points="26,138 50,168 80,186 120,186 150,168 174,138 150,156 100,164 50,156" fill="#180404" />
        <polygon points="26,138 50,156 100,164 150,156 174,138 172,150 150,176 120,198 80,198 50,176 28,150" fill="#240606" />
        {Array.from({ length: 11 }, (_, i) => {
          const x = 44 + i * 10.4, y = 157 + Math.abs(i - 5) * -1.6 + 6;
          return <polygon key={`t${i}`} points={`${x},${y - 2} ${x + 8},${y - 2} ${x + 6},${y + 9} ${x + 2},${y + 9}`} fill="#ece4c8" />;
        })}
        {Array.from({ length: 10 }, (_, i) => {
          const x = 50 + i * 10.4, y = 186 - Math.abs(i - 4.5) * 1.6;
          return <polygon key={`b${i}`} points={`${x + 2},${y - 8} ${x + 6},${y - 8} ${x + 8},${y + 2} ${x},${y + 2}`} fill="#d9d0b0" />;
        })}
        <polygon points="24,136 30,140 26,146" fill="#6a1a1a" />
        <polygon points="176,136 170,140 174,146" fill="#6a1a1a" />
      </svg>
    </div>
  );
}
