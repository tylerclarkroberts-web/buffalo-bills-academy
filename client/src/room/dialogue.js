import { wealthStage, ROOM_FURNITURE } from '../../../server/catalog/room.js';

export const ROOM_LINES = [
  'My throat still hurts from that mine acid. In my defence, it was a lovely colour.',
  'The foreman said hydrate. I assumed the glowing puddle counted.',
  'I came home to relax. Now the furniture is judging my finances.',
  'I washed the mine out of my clothes. The clothes asked for a transfer.',
  'I should buy a chair. Standing here is becoming a whole personality.',
  'A man at the mine called me dependable. I’ve been avoiding him since.',
  'Had a nice quiet argument on the way home. Won it just now.',
  'I like being indoors. Very few things up here are measured in shafts.',
  'Something in my pocket has been ticking since lunch. I’m giving it privacy.',
  'I have a good side. It faces the wall when company comes.',
  'I can whistle one note. Haven’t found a song that short.',
  'I asked the Foreman for a reference. He drew me from memory.',
  'I waved back at a coat yesterday. In fairness, the coat started it.',
  'I wrote down what I came in here for. It’s in the other trousers.',
  'I spent all morning thinking it was Thursday. Lovely while it lasted.',
  'Took my boots off once. The floorboards kept walking.',
  'I dreamed I was late to the mine. Got there and it was my day off.',
  'A little quiet does me good. I can hear which knee it is.',
  'I like the walk home better. On the way in, there’s a mine at the end.',
  'I know a shortcut to the barn. Slower, but you meet a duck.',
  'Had my fortune told. She asked to start again with a fresh hand.',
  'I’ve been practising small talk. How tall are you in coal?',
  'I miss the hat I had before this haircut. We were all on better terms.',
  'Found a nice smooth pebble outside. Left it there. Big day for me.',
  'On a clear night you can hear somebody trying to shuffle.',
  'Woke up humming the lunch bell. Had breakfast twice by mistake.',
  'Today I said good morning to the same man three times. He’s due two tomorrow.',
  'I can tell north by the moss on my lunch.',
  'If I stand here long enough I’ll remember why I stood up.',
  'I could go down to the barn. Then again, I might get put on a list to fight.',
  'The signpost says three miles to the mines. It has never once made the walk.',
  'I sit on the porch to keep an eye on the road. So far it has stayed where it is.',
];

export const CLICK_LINES = [
  'Oh, hello. I thought that was the beginning of a hat.',
  'Yes? I can turn round if you need the other shoulder.',
  'That’s me. The resemblance is fairly constant.',
  'I felt that in a tooth I don’t have.',
  'Did I have a crumb there? Be honest.',
  'If the Foreman asks, I looked busy from your side.',
  'Oh good, company. I was losing an argument to myself.',
  'Hang on. Were you saying hello or checking a melon?',
  'You caught me between important bits of standing.',
  'Yes, I live here. Sometimes they even let me pick the spot.',
];

export const GUNNAR_LINES = [
  'Sheriff caught Gunnar in my bed. Wrote him up for hogging the quilt.',
  'Gunnar had the good pillow. I had the side with the spring.',
  'Bought a queen mattress for the horse. The clerk asked me to stop saying it like that.',
  'The inn said no guests after ten. Gunnar signed for the room at nine forty-five.',
  'Found a horseshoe under my pillow. Gunnar was subtle when he wanted something.',
  'The barn’s quiet these days. You can hear a man open a bag of carrots for nobody.',
  'The barn bugs want me to come watch a fight. Gunnar could clear the room just by sneezing.',
  'I told the barn I was over it. The barn has agreed to keep that to itself.',
  'Gunnar used to lean on the fence until it took his side.',
  'I bought oats in bulk. Hard to explain a savings like that to an empty stall.',
  'Gunnar ate my hat once. Looked better in it than I ever did.',
  'The new horse is perfectly nice. We’re still very formal with each other.',
  'I heard a hoof on the porch. Turned out to be my own boot. Made me mad at the boot.',
  'I still leave the stall door on the second latch. Gunnar knew how to open the first.',
  'I miss him most around feeding time. And the other times.',
  'I tried talking to the barn cat about it. He sent me a bill.',
];

export const TROUGH_LINES = [
  'Water’s fresh, Gunnar. I still do that.',
  'I miss you, bud. Even the dent you put in the door.',
  'Trough’s holding water again. One of us should.',
  'We had a good run, Gunnar. Even the part where you ran without me.',
  'I put it in the shade for you. Force of habit.',
];

export const REPEAT_CLICK_LINES = [
  'Still me. Check again if you get a different answer.',
  'Have I got a loose bit? You can tell me.',
  'Next shoulder, please. I like to wear evenly.',
  'Oh, are we doing Morse? I’ve just agreed to something, haven’t I?',
  'Yes, that happens every time you press there.',
  'Hold still a moment. I want a turn.',
  'I liked the first poke. It left more to the imagination.',
];

export const VISITOR_LINES = [
  'Come in. I’ve just been picking which bit to apologise for.',
  'You found the place. I gave those directions very little chance.',
  'Make yourself at home. If you work out how, show me.',
  'Good to see you. I’ve been keeping a patch of floor free for company.',
  'Oh, hello. I had a whole welcome ready and you came in on the wrong foot.',
  'Did you pass a faun on the way in? We take turns being home.',
  'Stay as long as you like. I’ll let you know when I start acting natural.',
  'Wipe your boots on the way out. I’d hate for my floor to get on yours.',
];

export const REARRANGE_LINES = [
  'I’ll carry my tea until the floor settles on a plan.',
  'Could you leave one corner where I remember it?',
  'Lovely. I was worried I’d learn the way to the door.',
  'I’ve walked home three times and I’m still in here.',
  'Hold it there. I’d like to remember us this way.',
  'I put my foot down and apparently that was the old address.',
  'Can I have the pencil when you’ve finished drawing round my feet?',
  'If you find a little patch of dust shaped like me, that was where I was happy.',
  'I liked it two rooms ago.',
];

// What he says on getting to something he was sent to do.
export const TASK_LINES = {
  coffee: ['Coffee’s better out here. All it has to compete with is the road.', 'I take it black. The cow lives eleven miles away.'],
  rock: ['I rock forward to think and back to reconsider. Net progress is nil.', 'This chair has gone further than I have today.'],
  sign: ['Eleven miles to lose it, three miles to earn it. I’ll just stand here in between.', 'It says “then down”. I respect a sign that finishes the thought.'],
  bath: ['I got in with my clothes on. It saves a step on laundry day.', 'The hat stays dry. That’s the system.'],
  cook: ['I’m making an egg. The egg has had no say in this.', 'I cook by ear. It’s done when it stops arguing.'],
  eat: ['Table for one. I had to buy the chair specially.', 'I compliment the chef every night. He never knows what to say.'],
  sit: ['I’m sitting down. If anyone asks, it was planned.', 'From here I can see everything I own. It doesn’t take long.'],
  nap: ['I’m not asleep. I’m reviewing the ceiling.', 'Wake me if anything happens. Use your judgement on what counts.'],
  tidy: ['I pick things up so they know who’s in charge. Then I put them back so they don’t.', 'Just checking it still weighs the same.'],
  corner: ['I’m giving the corner some company. It’s had a quiet year.', 'Nobody’s in trouble. I just like to know where the walls meet.'],
};

// Each pair describes the piece on display, then the same piece still put away.
const pieces = {
  'odd-lamp': [
    'I lit a match to admire the oil lamp. That’s as far as we’ve got.',
    'I put the lamp away until I can afford the part of a lamp that burns.',
  ],
  'odd-wagon': [
    'Some evenings I sit in the wagon and make a little horse noise myself.',
    'I’ve got a covered wagon in storage. That was some box.',
  ],
  'odd-vaccine': [
    'Smallpox hasn’t shown its face since I put that there. You’re welcome.',
    'I’ve put the vaccine somewhere safe. I’ve got until 1980 to remember where.',
  ],
  'odd-anvil': [
    'If anyone asks, the anvil is load-bearing.',
    'I put the anvil away. I’ll get it back out when the feeling returns to my arms.',
  ],
  'odd-spittoon': [
    'Look at the shine on that spittoon. Anybody spits in it, they’re polishing it.',
    'Wrapped the spittoon in my good shirt. I’d rather wash the shirt than polish it again.',
  ],
  'odd-rock': [
    'That’s the good side of the rock. Took me most of Sunday.',
    'I was going to save money. Then the store had a completely ordinary rock.',
  ],
  'odd-telegraph': [
    'I’ve been tapping out HELLO on that key. Yesterday my knuckle tapped back.',
    'I put the telegraph key away for some quiet. It wasn’t plugged into anything.',
  ],
  'odd-snakeoil': [
    'I read the fine print on the snake oil. The snake gets better.',
    'I put the tonic away from the cooking oil. That was a very confident egg.',
  ],
  'odd-piano': [
    'If I squint at the piano roll, I can see where I’d clap.',
    'I’ve kept the piano roll. Tiny bit closer to a piano than I was before.',
  ],
  'odd-horseshoe': [
    'I hung out that lucky horseshoe. Somewhere a horse is having the opposite day.',
    'I wrapped the horseshoe in paper to keep the luck from rubbing off.',
  ],
  'odd-sheriffbadge': [
    'Anyone know a fish from 1887? I’ve got the paperwork.',
    'I keep my fishing licence handy in case they ever bring back 1887.',
  ],
  'odd-bigrock': [
    'Getting that big rock in was easy. We just decided the room started there.',
    'I bought the bigger rock. Had to go back for a bigger bag.',
  ],
  'odd-railroad': [
    'According to that certificate I own part of a railroad. I’d like the bit near home.',
    'I’ve filed my railroad share under things that used to go places.',
  ],
  'odd-charter': [
    'That mark on the charter is the witness. Lovely penmanship for a horse.',
    'I keep the charter folded where the horse lost interest.',
  ],
  'odd-skull': [
    'Bill takes his hat off when he sees that skull. I started doing it too.',
    'I put the buffalo skull away carefully. Some things you use both hands for.',
  ],
  'odd-pickaxe': [
    'The Foreman took one look at that gold pick and went outside to be alone.',
    'I’ve wrapped the gold pick in a towel. Even the towel left a dent.',
  ],
  'odd-deed': [
    'Apparently a deed to the moon does not include parking.',
    'I’ve got the moon deed folded up. Quite a small piece of paper, considering.',
  ],
  'odd-jackolantern': [
    'The Foreman says that pumpkin looks like me. I don’t have that many teeth.',
    'I put the pumpkin away facing the wall. I don’t like how well it knows me.',
  ],
  'odd-ghost': [
    'I’ve been meaning to wash that ghost. Feels rude to ask what cycle.',
    'I folded the ghost. It unfolded at the elbows. Sheets don’t have elbows.',
  ],
  'odd-cornucopia': [
    'We’re having plenty for supper. It’s gourd again.',
    'I kept the receipt from the Horn of Plenty. That leaves three gourds of plenty.',
  ],
  'odd-turkey': [
    'The turkey’s been pardoned. From the way he looks at me, I haven’t.',
    'I put the turkey out of sight. No point letting him see where I sleep.',
  ],
  'odd-stocking': [
    'I know that lump of coal. Worked together down in Seven.',
    'Packed the stocking away with the coal still in it. I’m sentimental about Shaft 7.',
  ],
  'odd-tumbletree': [
    'I mark where the tree is before bed. Just to see how far Christmas travels.',
    'You ever tried packing up a tree while it’s rolling?',
  ],
  'odd-medal': [
    'That medal’s for golf. I let people finish guessing first.',
    'I put my medal away. I only wear it for formal golf.',
  ],
  'odd-flipflop': [
    'That flip-flop’s still wet. I don’t think it’s water’s fault any more.',
    'I’ve put the wet flip-flop away. Every other shoe I own has filed for a transfer.',
  ],
  'odd-drone': [
    'If that bagpipe starts up again, hum a little flat. It hates that.',
    'I wrapped the bagpipe drone in a sock. Now the sock hums.',
  ],
  'odd-abalone': [
    'Put your ear to the abalone. I can still hear somebody arguing about the bill.',
    'I kept the shell. At forty dollars I was tempted to keep the plate too.',
  ],
  'odd-boardingpass': [
    'That boarding pass still has a sasquatch hair stuck to the back.',
    'Kept my boarding pass. Helps when I try to tell that story in order.',
  ],
  'furn-case': [
    'I dust the inside of the case first. Gives the dust outside something to aspire to.',
    'I bought a display case and put it away. It’s doing a poor job of displaying itself.',
  ],
  'furn-pokertable': [
    'I like to fold at my own table. Walk home’s much shorter.',
    'My poker table is still put away. Best run of luck I’ve had in years.',
  ],
};

const POOR_LINES = [
  'I turned out my pockets. The left one owes the right one money.',
  'Lunch was going to be on me. It got wind of the situation.',
  'I’ve already spent the money I imagine finding in the street.',
  'I can make a little money go a long way. Usually away from me.',
  'If the faun comes asking for change, pretend I’m asleep.',
  'I found a button in my pocket. For a second there, things were looking up.',
  'My budget allows me to smell bread on the way home.',
  'I count the money every day. It is still mostly table.',
];

// Something on show in a room other than the parlour, and a few pairings worth a remark of their own.
const ELSEWHERE = {
  kitchen: [['range', 'worktable', 'floor-kitchen'], 'I keep a little something in the kitchen. Gives the stove someone to talk to.'],
  bedroom: [['nightstand', 'bed', 'floor-bedroom'], 'I sleep better with something odd keeping an eye on me. Not well. Better.'],
  bathroom: [['toilet', 'linen', 'floor-bath'], 'Every bathroom needs a conversation piece. Ours starts the conversation.'],
  porch: [['floor-porch'], 'I put something on the porch so the neighbours know a person of means lives here. Or at least a person.'],
};
const PAIRINGS = [
  ['odd-skull', ['toilet', 'linen', 'floor-bath'], 'The buffalo skull in the bathroom watches me shave. I’ve started doing a better job.'],
  ['odd-ghost', ['bed'], 'There’s a ghost on my bed. We take turns being under the sheet.'],
  ['odd-turkey', ['floor-kitchen'], 'The pardoned turkey lives in the kitchen now. Bold choice, for him.'],
  ['odd-anvil', ['floor-porch'], 'The anvil keeps the porch from blowing away. Nobody has proved otherwise.'],
  ['odd-snakeoil', ['toilet'], 'I keep the snake oil by the toilet. That way, whichever way it works, I’m ready.'],
  ['odd-jackolantern', ['range', 'worktable'], 'The pumpkin in the kitchen keeps asking what’s for supper. I keep not saying.'],
  ['odd-rock', ['nightstand'], 'I keep the rock by the bed. In case of what, I haven’t decided.'],
];

export function roomContextLines(view, visitor = false) {
  if (!view) return [];
  const lines = [];
  const displayed = new Set(view.placements?.map(place => place.itemId));
  const furniture = view.furniture;
  const shownAt = new Map(view.placements?.map(place => [place.anchorId, place.itemId]));
  for (const [spots, line] of Object.values(ELSEWHERE)) if (spots.some(spot => shownAt.has(spot))) lines.push(line);
  for (const [item, spots, line] of PAIRINGS) if (spots.some(spot => shownAt.get(spot) === item)) lines.push(line);
  if (!visitor) {
    const moved = id => furniture?.[id] && (furniture[id].r || Math.hypot(furniture[id].x - ROOM_FURNITURE[id].home[0], furniture[id].z - ROOM_FURNITURE[id].home[1]) > 0.5);
    if (moved('bed')) lines.push('I moved the bed. I still wake up in the old spot, on the floor.');
    if (moved('tub')) lines.push('I moved the bathtub. The plumbing is taking it personally.');
    if (moved('range')) lines.push('I moved the stove. Now I walk into the wall every morning with real confidence.');
    if (moved('porchChair')) lines.push('I moved the porch chair. The sprinkler found it anyway.');
    if (furniture?.nightstand?.off) lines.push('I put the nightstand away. My glass of water lives on the floor now, like an animal.');
    if (furniture?.linen?.off) lines.push('I put the linen cupboard away. The towels are on the honour system.');
  }
  if (furniture?.case && !furniture.case.off) displayed.add('furn-case');
  if (furniture?.poker && !furniture.poker.off) displayed.add('furn-pokertable');
  for (const [id, [shown, stored]] of Object.entries(pieces)) {
    if (displayed.has(id)) lines.push(shown);
    else if (!visitor && view.owned?.includes(id)) lines.push(stored);
  }
  if (displayed.has('odd-rock') && displayed.has('odd-bigrock')) {
    lines.push('The little rock was here first. I’ve told the big one that.');
  }
  if (displayed.size >= 4) lines.push('This is not hoarding. It is a museum with no funding.');
  if (furniture?.couch && !furniture.couch.off) {
    lines.push('The couch was free. I have not stopped wondering why.',
      'There’s a soft spot on the couch. Whoever had it before me had one very determined elbow.');
  }
  if (furniture?.wardrobe && !furniture.wardrobe.off) {
    lines.push('The wardrobe creaks at night. My good shirt must be out dancing again.');
  }
  if (view.finishes?.floor?.typeId === 'stone') lines.push('That floor is lovely in bare feet, provided they belong to somebody else.');
  if (view.finishes?.rug?.typeId === 'striped') lines.push('I count the stripes in the rug when I can’t sleep. I always end up over here.');
  if (view.finishes?.rug?.typeId === 'none') lines.push('Without a rug, I can tell exactly which floorboard misses me.');
  if (view.pet?.stage === 'egg') {
    lines.push('I said good morning to the egg. Polite little nod. Could’ve been the table.',
      'I’m reading to the egg. Skipping the chapter on breakfast.');
  }
  if (view.pet?.stage === 'creature') {
    lines.push('The bug has a better healthcare plan than I do. Someone mists him.',
      'I tried to teach the bug to come when called. Now I come when called.');
    if (view.pet.feeder) lines.push('The bug has an automatic feeder. I’m still doing breakfast by hand.');
    if (view.pet.toy === 'toy-wheel') lines.push('All that running and the bug’s still home. We have that in common.');
    if (view.pet.gear || view.pet.defense) lines.push('Mind your manners by the glass. That bug’s better equipped than either of us.');
  }
  if (view.pet?.stage === 'dead') lines.push('I still say goodnight to that corner. Habit, I suppose.');
  const stage = wealthStage(view.worth?.total);
  if (stage === 0 || stage === 1) lines.push(...POOR_LINES);
  if (stage === 0) lines.push('Went to count my money. Finished early.');
  if (stage >= 4) lines.push('I could retire on this. The Foreman says to practise on my lunch break first.',
    'Strange, having money. I still shake out my trousers over the bed.');
  return lines;
}
