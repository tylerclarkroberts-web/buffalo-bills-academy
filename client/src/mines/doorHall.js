// The Hall of Doors (v89): what's behind the mine door now. Four open doors (Doom, Nanosaur, EL HALO and, at the far
// end where the daylight comes in, the company picnic) and a row of locked ones for whatever gets built next. The hall
// is laid out for nine doors, so a new one takes a locked one's place. Pure data so the tests can read it without a browser.
export const HALL_DOORS = [
  { id: 'doom', name: 'DOOM', style: 'hell', open: true, blurb: 'RIP AND TEAR' },
  { id: 'nanosaur', name: 'NANOSAUR', style: 'jungle', open: true, blurb: '1998 · PANGEA' },
  { id: 'elhalo', name: 'EL HALO', style: 'sol', open: true, blurb: '¡ÓRALE!' },
  { id: 'vault', name: 'VAULT 7', style: 'vault', open: false, blurb: 'SEALED' },
  { id: 'arcade', name: 'ARCADE', style: 'neon', open: false, blurb: 'COMING SOON' },
  { id: 'deep', name: 'THE DEEP', style: 'deep', open: false, blurb: 'FLOODED' },
  { id: 'mystery', name: '? ? ?', label: 'Mystery', style: 'mystery', open: false, blurb: 'DO NOT KNOCK' },
  { id: 'gilded', name: 'THE GILDED', style: 'gold', open: false, blurb: 'MEMBERS ONLY' },
  { id: 'picnic', name: 'PICNIC', style: 'sky', open: true, blurb: 'BRING A HAT' },
];

export const LOCKED_LINES = [
  "LOCKED. SOMETHING'S BEING BUILT BACK THERE.",
  'IT WON’T BUDGE. COMING SOON.',
  'YOU HEAR HAMMERING ON THE OTHER SIDE.',
  'LOCKED TIGHT. CHECK BACK LATER.',
  'A NOTE ON THE KNOB: "NOT YET."',
];
