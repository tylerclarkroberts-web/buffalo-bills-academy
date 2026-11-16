// The Barn's ring announcer. Each line is one recorded clip: client/public/barn/announcer/<key>-<n>.mp3, made from
// this list by scripts/announcer-clips.mjs. He never says a bug's name; the plates do that. Keep lines short: the
// intro is 2.6 seconds long and he is not allowed to hold up the fight. Add new lines at the end of a list: a clip
// is found by its place in it.
export const LINES = {
  intro: [
    'Ladies and gentlemen... the bottle caps are set!',
    'Live from the barn! Four bottle caps! Two bugs! No refunds!',
    'Tonight, in the straw... it gets personal!',
    'Welcome back to the barn. Please do not feed the fighters.',
    'In this corner, a bug! In that corner... also a bug!',
    'The Foreman has asked me to say this fight is NOT sanctioned!',
    'Two bugs enter! Both bugs probably leave!',
    'The twine is tight! The straw is fresh! And I have a sandwich!',
    'No biting! I am told that is most of what they do!',
  ],
  crit: [
    'OHHH! Right in the thorax!',
    'That one had paperwork on it!',
    'Somebody call the Bug Center!',
    'He felt that in all six legs!',
    'A CRITICAL! I have dropped my sandwich!',
    'OH! That is going in the field notes!',
    'Right in the antennae!',
    'I felt that from the rafters!',
    'That was NOT in the brochure!',
    'Somebody stop the... no, keep going!',
    'The chicken has looked away!',
    'MERCY! That bug has a family! Probably thousands!',
  ],
  won: [
    'It is OVER! And for once, yours is the one standing!',
    'We have a winner! A ribbon for the stall!',
    'Victory! The chicken has returned to watch!',
    'YOUR bug wins! Act like you expected it!',
    'It is all over! Yours takes a slow lap of the bottle caps!',
    'Winner! The other one is suddenly very interested in the ceiling!',
    'What a fight! What a bug! What a barn!',
  ],
  lost: [
    'It\'s OVER! And yours is the one face down in the straw!',
    'And that is that. It says it slipped on some straw.',
    'A tough night in the bottle caps. No refunds.',
    'DOWN it goes! And it was yours! I am so sorry! I am not sorry!',
    'It\'s OVER! Yours is demanding a rematch from the floor!',
    'Stop the fight! Yours has seen enough of the ceiling!',
    'A loss! A LOSS! The Bug Center is open late!',
  ],
  draw: [
    'A draw! Nobody is happy! Least of all me!',
    'That is time. Both of them are claiming it.',
    'A DRAW! I want my evening back!',
    'Time! Nobody wins! The barn wins!',
    'It is a draw! Somebody is writing to the Foreman!',
  ],
};
