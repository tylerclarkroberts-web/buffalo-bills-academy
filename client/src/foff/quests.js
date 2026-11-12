// Foff's Bachelor Party: the side quests, in itinerary order, and the trip they hang off. A quest is a stage
// (stages-move.js, stages-think.js) with a title, something to say before it, and a few different things that
// might be said after winning or losing (one is picked each time). `need` is the golf match that has to be won
// first (0: none), so each day opens as the one before is finished.
import { MATCHES } from './course.js';
import { banya, carmel, dessert, drive, edibles, mystery, piper, sardine } from './stages-move.js';
import { bakery, burma, chinese, dametra, luggage } from './stages-think.js';

// What the end screen says under the title, whoever was talking.
export const DONE = ['Done. It goes on the trip.', 'That happened. There are witnesses.', 'Nobody will believe it, but it counts.', 'One more thing to bring up at the wedding.', 'Add it to the story Foff tells.'];
export const NOPE = ['It will still be there.', 'Nobody saw that. Several people saw that.', 'The trip continues regardless.', 'Try it again before anyone brings it up.', 'This one stays in Monterey.'];

export const QUESTS = [
  { id: 'van', title: 'The van', make: drive('van'), need: 0,
    intro: [['Foff', 'Sixteen seats. Twelve men. Keetch drives.'], ['Keetch', 'I\'ve only driven things with a mouth.'], ['Squanto', 'Dude. Fun fact: a van is a horse with doors.']],
    win: [
      [['Gunt', 'We have arrived. Several of us are still attractive.']],
      [['Squanto', 'Dude. Parked as can be.'], ['Keetch', 'It\'s across three spaces.'], ['Squanto', 'Fun fact: that is still parked.']],
      [['Mr. Joe Jack', 'Good driving. Not as good as mine. But good.']],
    ],
    lose: [
      [['Steeze', 'Run over my head. The deposit.']],
      [['BMehl', 'That was a f***ing cable car.'], ['Keetch', 'It came out of nowhere.'], ['BMehl', 'It\'s on rails.']],
      [['Kashely', 'Son, a horse would have stopped by itself.']],
    ] },
  { id: 'luggage', title: 'The lockers', make: luggage, need: 0,
    intro: [['Bent', '*cough* The bath house has thirty lockers\' worth of locker.'], ['Squanto', 'Dude. My duffel is big as can be.']],
    win: [
      [['Bent', '*cough* It shut. Nobody open it.']],
      [['Squanto', 'Dude. Snug as can be.']],
      [['Gunt', 'My garment bag is lying down. I asked for it to hang.']],
    ],
    lose: [] },
  { id: 'banya', title: 'The cold plunge', make: banya, need: 0,
    intro: [['Attendant', 'WHO. Who puts SHOES in plunge.'], ['Squanto', 'Dude. Floating as can be.'], ['Steeze', 'Run over my head. They were new.'], ['Keetch', 'I\'ll get them.']],
    win: [
      [['Attendant', 'Good. Now you sit in heat until you are sorry.']],
      [['Attendant', 'Two shoes. Now I count the towels.']],
      [['Steeze', 'Run over my head, they\'re soaked.'], ['Squanto', 'Dude. Fun fact: they float.']],
    ],
    lose: [
      [['Attendant', 'OUT. All twelve. And the hairy one twice.']],
      [['Attendant', 'You are banned. He is banned. The shoes can stay.']],
      [['Keetch', 'She has a very good arm.']],
    ] },
  { id: 'burma', title: 'Burma Love', make: burma, need: 0,
    intro: [['Steeze', 'I don\'t see anything I can eat.'], ['Foff', 'There are sixty things.'], ['Kashely', 'I could order us a pizza.'], ['Foff', 'No. When you order pizza it is somehow twenty-seven dollars a person.'], ['Kashely', 'That\'s with the dipping sauces.'], ['Steeze', 'Run over my head. Order for me.']],
    win: [
      [['Squanto', 'Dude. I ate four dinners. Full as can be.']],
      [['Steeze', 'It\'s fine. Run over my head, it\'s actually fine.']],
      [['Foff', 'He\'s eating. Nobody look at him or he\'ll stop.']],
    ],
    lose: [
      [['Steeze', 'I\'ll have a mint. Run over my head.']],
      [['Squanto', 'Dude. I can\'t. Fun fact: I am full as can be.']],
      [['Bent', '*cough* There\'s a gas station on the way back.']],
    ] },
  { id: 'dessert', title: 'The dessert walk', make: dessert, need: 0,
    intro: [['Foff', 'Dessert. It\'s six blocks.'], ['Gunt', 'In these shoes?'], ['Keetch', 'Stay behind me. Step where I step.']],
    win: [
      [['Landon', 'Ice cream. That\'s a buzzer beater.']],
      [['Gunt', 'One scoop. In a cup. I\'m not an animal.']],
      [['Foff', 'Who wants to do that again tomorrow?'], ['Keetch', 'Nobody.']],
    ],
    lose: [
      [['Gunt', 'We are going back. I am going back.']],
      [['Landon', 'Shop\'s closed. That\'s the final whistle.']],
      [['Steeze', 'Run over my head. I need a tetanus shot and a sorbet.']],
    ] },

  { id: 'bakery', title: 'The bakery', make: bakery, need: 0,
    intro: [['Foff', 'Keetch is ordering. Everyone tell him what you want. Once.'], ['Korn', 'Cuck me, there\'s a lot of options.']],
    win: [
      [['Bent', '*cough* That\'s mine. That\'s actually mine.']],
      [['Korn', 'Cuck me, you remembered.']],
      [['Foff', 'Every one of them right. Where were you conceived?!']],
    ],
    lose: [
      [['Tcut', 'THIS IS A BAGEL. I\'m fine. It\'s fine.']],
      [['Korn', 'Cuck me, this is what I ordered the first time.']],
      [['Gunt', 'I\'ll eat it. I won\'t enjoy it.']],
    ] },
  { id: 'mystery', title: 'The Mystery Spot', make: mystery, need: 0,
    intro: [['Squanto', 'Dude. Fun fact: gravity is different here. They have a sign.'], ['Keetch', 'I brought a ball.']],
    win: [
      [['Squanto', 'Dude. Uphill as can be.']],
      [['Keetch', 'I don\'t trust this place.'], ['Squanto', 'Fun fact: it doesn\'t trust you either.']],
      [['Kashely', 'Never seen a ball do that. Seen a horse do it once.']],
    ],
    lose: [
      [['Mr. Joe Jack', 'Fake. The whole spot. Everybody knows it.']],
      [['Squanto', 'Dude. Gravity won.']],
      [['Bent', '*cough* I feel sick. *cough* It\'s the floor.']],
    ] },
  { id: 'chinese', title: 'The lazy Susan', make: chinese, need: 2,
    intro: [['Foff', 'One order for the table. Keetch has the pen.'], ['Korn', 'Orange chicken. Cuck me if there\'s no orange chicken.'], ['Bent', '*cough* Nothing too hot.']],
    win: [
      [['Landon', 'That\'s a full stat line.']],
      [['Korn', 'Orange chicken. Cuck me, he did it.']],
      [['Mr. Joe Jack', 'Under budget. I would have done it for less.']],
    ],
    lose: [] },

  { id: 'piper', title: 'The bagpiper', make: piper, need: 2,
    intro: [['Bent', '*cough* There is a man in the living room.'], ['Foff', 'In a KILT. Where was HE conceived?!'], ['Keetch', 'Somebody hand me a wedge.']],
    win: [
      [['Michele', '...'], ['Bent', '*cough* He let himself out.'], ['Keetch', 'Nobody tell the horse.']],
      [['Foff', 'Who WAS that?'], ['Squanto', 'Dude. Fun fact: nobody knows.']],
      [['Tcut', 'Is it over? I\'m calm. I\'ve been calm.']],
    ],
    lose: [
      [['Tcut', 'I\'M AWAKE. EVERYONE IS AWAKE.']],
      [['Gunt', 'He has started the second verse.']],
      [['Kashely', 'Out here we\'d call that a wake-up call. Then we\'d call the sheriff.']],
    ] },
  { id: 'dametra', title: 'Dametra Cafe', make: dametra, need: 4,
    intro: [['Foff', 'The waiters are singing.'], ['Kashely', 'Clap along, partner. It\'s the law here.']],
    win: [
      [['Kashely', 'Son, you clap like you ride.']],
      [['Foff', 'They\'re bringing him a tambourine.']],
      [['Gunt', 'On the beat. I\'m as surprised as you are.']],
    ],
    lose: [
      [['Gunt', 'You were early, late and then early again.']],
      [['Landon', 'That\'s a shot clock violation.']],
      [['Steeze', 'Run over my head. They\'ve stopped the music to look at us.']],
    ] },
  { id: 'carmel', title: 'Carmel-by-the-Sea', make: carmel, need: 4,
    intro: [['Keetch', 'Does anybody know where a bathroom is?'], ['Gunt', 'This town doesn\'t have them. It has galleries.']],
    win: [
      [['Keetch', 'Nobody talk to me for a minute.']],
      [['Gunt', 'You were gone eleven minutes. I bought a candle.']],
      [['Squanto', 'Dude. Relieved as can be.']],
    ],
    lose: [
      [['Keetch', 'I\'m buying a painting. I need to buy a painting right now.']],
      [['Kashely', 'Out on the range this ain\'t a problem.']],
      [['Keetch', 'Nobody look at the fountain.']],
    ] },

  { id: 'sardine', title: 'The Sardine Factory', make: sardine, need: 8,
    intro: [['Mr. Joe Jack', 'Abalone. The best shellfish. Forty dollars. Tremendous.'], ['Keetch', 'It\'s moving.'], ['Korn', 'Cuck me, don\'t let it off the plate.']],
    win: [
      [['Keetch', 'It tastes like a wallet.']],
      [['Mr. Joe Jack', 'Forty dollars. Worth every dollar. Maybe more.']],
      [['Squanto', 'Dude. Fun fact: I had six.']],
    ],
    lose: [
      [['Mr. Joe Jack', 'Sad. Forty dollars, on the floor.']],
      [['Korn', 'Cuck me. Five-second rule?']],
      [['Squanto', 'Dude. I\'ll eat it.']],
    ] },
  { id: 'edibles', title: 'Gunt\'s evening', make: edibles, need: 8,
    intro: [['Gunt', 'I had one. Possibly four.'], ['Gunt', 'The hallway has been redecorated since I sat down.']],
    win: [
      [['Gunt', 'A bed. Finally, something with clean lines.']],
      [['Gunt', 'Goodnight, hallway. You were a lot.']],
      [['Gunt', 'Tell the others I was magnificent.']],
    ],
    lose: [
      [['Gunt', 'The carpet and I have come to an arrangement.']],
      [['Gunt', 'I live here now. Bring me a throw pillow.']],
      [['Bent', '*cough* He\'s asleep in the hall.'], ['Foff', 'Leave him. He looks tailored.']],
    ] },

  { id: 'hmb', title: 'Half Moon Bay', make: drive('hmb'), need: 8,
    intro: [['Squanto', 'Dude. I had the abalone. All the abalone.'], ['Foff', 'Windows don\'t open in the back. Hold your breath, Keetch.']],
    win: [
      [['Bent', '*cough* Air. Real air.']],
      [['Squanto', 'Dude. Sorry as can be.'], ['Foff', 'Where was that CONCEIVED?!']],
      [['Gunt', 'I\'m burning this jacket.']],
    ],
    lose: [
      [['Gunt', 'Pull over. I am walking to Half Moon Bay.']],
      [['Steeze', 'Run over my head. Actually do it.']],
      [['Squanto', 'Dude. Fun fact: that one surprised me too.']],
    ] },
  { id: 'sfo', title: 'The race to SFO', make: drive('sfo'), need: 8,
    intro: [['Steeze', 'Run over my head. The flight is in an hour.'], ['Keetch', 'Everybody hold on to something that isn\'t me.']],
    win: [
      [['Foff', 'Best bachelor party I\'ve ever had.'], ['Keetch', 'I wasn\'t even supposed to be here.'], ['Foff', 'Where were you conceived?!']],
      [['Steeze', 'We made it. Run over my head, we made it.']],
      [['Squanto', 'Dude. Fun fact: I don\'t have a ticket.']],
    ],
    lose: [
      [['Mr. Joe Jack', 'We missed it. I blame the airport. Terrible airport.']],
      [['Korn', 'Cuck me. When\'s the next one?'], ['Bent', '*cough* Tuesday.']],
      [['Landon', 'That\'s the buzzer. We lost by one gate.']],
    ] },
];

// The trip, a day at a time. Golf matches are numbers; everything else is a quest id.
export const TRIP = [
  ['Wednesday', ['van', 'luggage', 'banya', 'burma', 'dessert']],
  ['Thursday', ['bakery', 'mystery', 1, 2, 'chinese']],
  ['Friday', ['piper', 3, 4, 'dametra', 'carmel']],
  ['Saturday', [5, 6, 7, 8, 'sardine', 'edibles']],
  ['Sunday', ['hmb', 'sfo']],
].map(([day, stops]) => ({ day, stops: stops.map((s) => (typeof s === 'number' ? { match: MATCHES.find((m) => m.id === s) } : { quest: QUESTS.find((q) => q.id === s) })) }));
