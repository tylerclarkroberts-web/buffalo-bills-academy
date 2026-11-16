// v89: the nine mine dances. Shared by the server (which only accepts these ids) and the page (which draws them).
// The moves themselves are drawn procedurally in client/src/mines/dance.js; nothing here is anyone else's choreography.
export const DANCES = [
  { id: 'hipthrust', name: 'Hip Thrust', icon: '🍑', line: 'YOU THRUST AT THE ROCK. THE ROCK DOES NOT THRUST BACK.' },
  { id: 'tuktuk', name: 'Tuk Tuk', icon: '🦶', line: 'TUK TUK TUK. THE TUNNEL SHAKES A LITTLE. THAT WAS NOT YOU. PROBABLY.' },
  { id: 'robot', name: 'The Robot', icon: '🤖', line: 'BEEP. BOOP. THE FOREMAN WANTS TO KNOW IF ROBOTS NEED PAYING.' },
  { id: 'sprinkler', name: 'Sprinkler', icon: '💦', line: 'THE SPRINKLER. THE ONLY WATER DOWN HERE IS ACID.' },
  { id: 'disco', name: 'Disco Point', icon: '🕺', line: 'YOU POINT AT THE CEILING. SOMETHING UP THERE POINTS BACK.' },
  { id: 'runningman', name: 'Running Man', icon: '🏃', line: 'RUNNING MAN. YOU HAVE GONE NOWHERE, VERY FAST.' },
  { id: 'swing', name: 'The Swing', icon: '🪢', line: 'SWING. SWING. A BAT LEFT.' },
  { id: 'spin', name: 'Floor Spin', icon: '🌀', line: 'YOU SPIN ON THE FLOOR. THE FLOOR HAS SEEN THINGS. NOW THIS.' },
  { id: 'bootscoot', name: 'Boot Scoot', icon: '🤠', line: 'HEEL, TOE, SCOOT. BUFFALO BILL WOULD BE PROUD. HE IS NOT HERE.' },
];
export const DANCE_IDS = DANCES.map((d) => d.id);
export const DANCE_BY_ID = Object.fromEntries(DANCES.map((d) => [d.id, d]));
/** A dance id the server will pass on, or null. */
export const danceId = (v) => (typeof v === 'string' && Object.hasOwn(DANCE_BY_ID, v) ? v : null);
