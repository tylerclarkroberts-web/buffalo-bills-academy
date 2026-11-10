export const PAID_RANTS = [
  [
    "Dad-gummit, got yer pay and now yer sneakin' off?",
    "I seen mice with a better work ethic. And they pay rent in chewed wires.",
    "You brought somethin' up, I'll give ya that. Go on, sport.",
  ],
  [
    "Dagnabbit. Soon as payroll opens, everybody remembers somewhere to be.",
    "We're payin' too much. Petunia works all day for oats.",
    "Fine. You earned it. Scoot.",
  ],
  [
    "Well butter my biscuit. Money in yer pocket and one boot out the door.",
    "Earl's tiki bar don't run on good intentions, partner.",
    "Go on, then. I'll grumble enough for both of us.",
  ],
  [
    "Headin' home already, sugar britches?",
    "Got more hurry in ya leavin' than ya had comin' in.",
    "Keep yer pay. Leave the bucket. I know that look.",
  ],
  [
    "Horse apples. Payroll's turnin' miners into tourists.",
    "Couple coins in yer pocket and suddenly yer too fancy for a shovel.",
    "All right, you did the work. Don't make me say it twice.",
  ],
  [
    "Off to the card room, are ya? Dagnabbit.",
    "I pay ya to haul things up, then ya go sit down. Backwards economy.",
    "Go on, sport. Tell them cards I want ya back in one piece.",
  ],
  [
    "Shoot fire. You heard that pay hit yer pocket from three tunnels away.",
    "Can't hear me holler for a shovel, though. Curious ears on you.",
    "Go on. I'll put the shovel away myself.",
  ],
  [
    "Well, there goes another pair of boots toward daylight.",
    "Even a tumbleweed hangs around till the wind tells it to move.",
    "You earned yer walk home. Don't take the wind with ya.",
  ],
  [
    "Cheese and crackers. Look at that grin.",
    "My dog smiles like that after stealin' a biscuit. You got paid proper.",
    "Go enjoy it, then. Quit lookin' so pleased where I can see ya.",
  ],
  [
    "You got a supper bell nobody else can hear, partner?",
    "Mine ain't rung. Unless that was my knee again.",
    "Fine, get along. Leave some daylight for the rest of us.",
  ],
  [
    "Dad-gummit. Just when I got used to yer boots makin' useful noises.",
    "Now all I hear is jingle, jingle, goodbye.",
    "Take yer pay and scoot before I get sentimental.",
  ],
  [
    "Well, don't wear a trail rushin' out.",
    "I just filled that rut from the last payday.",
    "You did yer bit, sport. Use the other footpath.",
  ],
  [
    "Dagnabbit, everybody's got plans once the envelope's full.",
    "My plan was a chair and a peach. Look how that turned out.",
    "Go on. One of us oughta get the peach.",
  ],
  [
    "Off already? I oughta put the pay window at the bottom of the shaft.",
    "Then at least I'd get a little exercise outta ya.",
    "Aw, keep walkin'. That was a grumble, not a new rule.",
  ],
  [
    "Rattlesnakes and rhubarb. You're spry for a tired miner.",
    "A milk cow moves slower with the barn on fire.",
    "Go on, sugar britches. Try not to sprain yer paycheck.",
  ],
  [
    "Headin' out? Well, take yer fancy pockets with ya.",
    "Mine are full of bolts. Yours got money. Seems lopsided.",
    "You earned it. I earned these bolts, apparently. Get along.",
  ],
  [
    "Horse apples. I just learned which helmet was yours.",
    "Now I gotta remember a face. That's extra work for me.",
    "Fine. Take the face home. Bring it back sometime.",
  ],
  [
    "Well butter my biscuit. Clock's still tickin', but you ain't.",
    "That clock works all day on one battery. Payroll oughta meet it.",
    "Go on, partner. You got paid. The clock can keep me company.",
  ],
];

// Paid departures are flavor only; never create a server-held math problem.
export function paidFarewell(result, random = Math.random) {
  if (!result || result.outcome === 'dud' || !(result.amount > 0)) return null;
  return { id: 'paid', reason: 'paid', lines: PAID_RANTS[Math.floor(random() * PAID_RANTS.length)] };
}
