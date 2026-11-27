// Species fact cards: shown once after a successful catch, and from a bug's stall in the barn.
// Found, diet and about three strange facts sit on one card, the most striking fact first.
// Science copy is taken from the roster (bugs.js) and from sources listed there or on a fill below;
// nothing is invented. Where a diet or range was never recorded for that species, the card says so.
// STEEZE, botched rebuilds and Stage II barn names are Academy lore, never presented as natural history.
import { BUGS, BUG_BY_ID } from './bugs.js';

export const FOUND_MAX = 90;
export const EATS_MAX = 90;
export const FACT_MAX = 110;

/** In-world Stage II names used around the barn (client/src/barn/stageTwoArt.js comments). Not wild taxa. */
export const STAGE_II_NAME = {
  ceroplophana: 'Bronze Rhino Knight', lamprima: 'Golden Stag Crown', trachelophorus: 'Crane Weevil',
  graphocephala: 'Candy Dart', mantispa: 'Hornet Reaper', halobates: 'Tide Strider', chrysochroa: 'Emerald Bullet',
  melanophila: 'Cinder Beetle', onymacris: 'Mist Stilt', brachinus: 'Blast Cannon', pheropsophus: 'Hazard Mortar',
  macrodontia: 'Saber Fang', sagra: 'Leap Titan', manticora: 'Scissor Jaw', polyphylla: 'Plume Crown',
  phanaeus: 'Prism Horn', bocydium: 'Signal Orb', phrictus: 'Dragon Lantern', pyrops: 'Candlewick',
  umbonia: 'Thornback', helicopsyche: 'Spiral Hermit', nemoptera: 'Ribbon Dancer', brevisana: 'Siren Cicada',
  bertholdia: 'Cinnabar Fluff', meganeura: 'Sky Lance', ampulex: 'Jade Stinger', megachile: 'Titan Bee',
  pseudocreobotra: 'Bloom Eye', deroplatys: 'Leaf Warden', empusa: 'Cone Oracle', heteropteryx: 'Thorn Bastion',
  peruphasma: 'Night Blade', dryococelus: 'Ancient Lobster', solenopsis: 'Blaze Legion', odontomachus: 'Snap Trap',
  dasymutilla: 'Velvet Fury', colobopsis: 'Plug Bomb', myrmeleon: 'Sand Pit King', platymeris: 'Night Stalker',
  acanthaspis: 'Shroud Ninja', gromphadorhina: 'Iron Hisser', gryllotalpa: 'Burrow Brawler', menacanthus: 'Gobbler Louse',
  eupholus: 'Drill Sapphire', pachyrhynchus: 'Egg Fortress', phrixothrix: 'Night Express', arachnocampa: 'Lantern Weaver',
  lethocerus: 'Tide Crusher', micronecta: 'Oar Rower', notonecta: 'Moon Diver', dytiscus: 'Torrent Diver',
  gyrinus: 'Whirl Spinner', sphaerocoris: 'Canvas Shield', pyrrhocoris: 'Mask Guard', phloeodes: 'Iron Bastion',
  photuris: 'Lantern Hunter',
};

// Sources for diet and range fills that were not already on the roster in bugs.js.
const FILL_SOURCES = {
  ceroplophana: ['https://no.wikipedia.org/wiki/Ceroplophana_modiglianii'],
  eupholus: ['https://doi.org/10.1371/journal.pone.0188044'],
  helicopsyche: ['https://doi.org/10.1139/z83-301'],
  chrysochroa: ['https://www.takao599museum.jp/treasures/insects/%e3%82%bf%e3%83%9e%e3%83%a0%e3%82%b7%e7%a7%91/2913/?lang=en'],
  onymacris: ['https://doi.org/10.14411/eje.2008.110'],
  phrixothrix: ['https://en.wikipedia.org/wiki/Phrixothrix_hirtus', 'https://doi.org/10.1093/aesa/90.3.389', 'https://edis.ifas.ufl.edu/publication/IN610'],
  manticora: ['https://doi.org/10.1163/157075600783538237'],
  heteropteryx: ['https://www.zoologicaljournal.com/article/85/4-1-14-508.pdf'],
  pheropsophus: ['https://doi.org/10.3897/zookeys.14.188'],
  bertholdia: ['https://www.bugguide.net/node/view/128223'],
  gyrinus: ['https://en.wikipedia.org/wiki/Gyrinus'],
};

// Extra in-world lines, clearly marked, never mixed into the science fields.
const LORE_NOTE = {
  menacanthus: 'In the Academy it only comes out in the Acid Mines on Thanksgiving. That is barn lore, not a natural-history fact.',
};

const KIND = { steeze: 'lore' };

// Punchy card copy: found, eats, and two or three strange facts, the most striking first.
const COPY = {
  ceroplophana: {
    found: "North Sumatra, and a subspecies in West Malaysia.",
    eats: "Larvae live in rotting wood. The adult diet is unknown.",
    facts: [
      "The original type specimen later vanished from the Genoa museum.",
      "The whole genus was founded in 1893 on a single specimen.",
      "Males grow a horn on the front of the head; bigger beetles grow bigger horns.",
    ],
  },
  bocydium: {
    found: "Reported from the Americas, Africa, Asia and Australia.",
    eats: "Sap from the underside of leaves.",
    facts: [
      "Nobody is sure what the globes on its back are for. One idea: they put predators off.",
      "Globe-tipped appendages stick straight up from its thorax.",
      "It barely moves.",
    ],
  },
  phrictus: {
    found: "Costa Rica, Panama, Colombia and parts of Brazil.",
    eats: "Tree sap, drunk through a tube.",
    facts: [
      "Its head ends in a long process that splits into five points, like a tiny dragon.",
      "It is also called the wart-headed bug.",
      "Its hind wings are brightly coloured.",
    ],
  },
  pyrops: {
    found: "Southern China and Southeast Asia, including Hong Kong, Vietnam and Thailand.",
    eats: "Phloem sap of trees such as longan and lychee.",
    facts: [
      "It is called a lanternfly, but it does not give off any light.",
      "A long reddish head process, spotted white, sticks out in front of it.",
      "It pierces bark with a slender proboscis to reach the sap.",
    ],
  },
  graphocephala: {
    found: "Meadows and woods from Canada to Panama.",
    eats: "Plant sap.",
    facts: [
      "It can carry Xylella, the bacterium that scorches elms, oaks and other trees.",
      "Wings striped vivid blue or green and red, with a bright yellow head.",
      "In Germany it is a nuisance to people sitting under park trees.",
    ],
  },
  umbonia: {
    found: "Warm country from northern South America to Mexico and Florida.",
    eats: "Sap of ornamental and fruit trees.",
    facts: [
      "It looks like a thorn on the branch, which puts birds off.",
      "If the mother dies, a nearby female can adopt her clutch.",
      "Without their mother, nymph survival falls from 53% to 27%.",
    ],
  },
  trachelophorus: {
    found: "The forests of Madagascar, and nowhere else.",
    eats: "Leaves and sap of two Dichaetanthera trees.",
    facts: [
      "Males' necks are two to three times the females', and they fight by swinging their heads like clubs.",
      "A female rolls a leaf around one egg, binds it, then snips it off to fall to the forest floor.",
      "It spends its whole life on two host trees, nicknamed giraffe beetle trees.",
    ],
  },
  eupholus: {
    found: "New Guinea.",
    eats: "Leaves of toxic wild yams (Dioscorea), like others in its group.",
    facts: [
      "Its blue-green colour comes from tiny scales, not pigment in the shell.",
      "Its legs are bright blue; the tip of the snout and the antennae are black.",
      "It is usually metallic blue-green with black bands across the wing covers.",
    ],
  },
  pachyrhynchus: {
    found: "Mostly on islands in Southeast Asia.",
    eats: "Larvae feed inside the stems of their host plants.",
    facts: [
      "Its bright spots are photonic crystals: nanostructures that reflect light, not pigment.",
      "Its eggs can survive a trip through a bird's gut.",
      "It cannot fly. The wing covers are fused.",
    ],
  },
  platymeris: {
    found: "Humid tropical forest across Africa, in hollow stumps and rotting logs.",
    eats: "Cockroaches, crickets, flies, beetles and caterpillars.",
    facts: [
      "It can spit venom that may cause temporary blindness in people.",
      "Its bite is said to hurt more than a bee sting.",
      "It injects saliva that liquefies prey, then sucks it up.",
    ],
  },
  acanthaspis: {
    found: "Around Lake Victoria, in cracks, mud walls and old termite mounds.",
    eats: "Mostly ants; also flies, small grasshoppers and beetles.",
    facts: [
      "Nymphs wear a backpack of the ants they have eaten: a disguise called corpse camouflage.",
      "Grabbed, it slips out of the mask and runs, leaving a ball of dead ants behind.",
      "A caught nymph will play dead for minutes, even after it is let go.",
    ],
  },
  helicopsyche: {
    found: "Streams worldwide, most diverse in the tropics.",
    eats: "Larvae scrape algae, diatoms and detritus off stones.",
    facts: [
      "The larva builds a case coiled to the right, like a snail shell, with the coils fused.",
      "Fly fishers know it as the Speckled Peter.",
      "Adult antennae can be twice as long as the forewing.",
    ],
  },
  chrysochroa: {
    found: "Woods of Japan and Korea, out in strong summer sun.",
    eats: "Adults eat hackberry and zelkova leaves; larvae tunnel in decaying wood.",
    facts: [
      "The Tamamushi Shrine at Hōryū-ji in Nara is decorated with its wing covers.",
      "Those iridescent covers change colour along their length, depending on the light.",
      "In Japanese, \"tamamushi-iro\" means a statement that can be read two ways.",
    ],
  },
  lamprima: {
    found: "Tasmania and south-eastern Australia, in dry sclerophyll forest.",
    eats: "Adults drink eucalypt nectar; larvae eat rotting logs.",
    facts: [
      "Males fight with forward-pointing mandibles and defend rotting logs as territory.",
      "Males are usually metallic gold or green; females may be blue or dull brown.",
      "In Tasmania it is called a Christmas beetle.",
    ],
  },
  onymacris: {
    found: "The dune fields of the Namib Desert.",
    eats: "Wind-blown plant detritus, and dead insects when it finds them.",
    facts: [
      "On foggy nights it climbs a dune and does a headstand so droplets run down its back into its mouth.",
      "Parts of the Namib it lives in get under 50 mm of rain a year.",
      "Only it and one close relative are known to fog-bask.",
    ],
  },
  brachinus: {
    found: "Europe, western Asia and North Africa; dry ground, often under stones.",
    eats: "Larvae are thought to parasitise the pupae of other beetles.",
    facts: [
      "Disturbed, it fires an exploding spray that heats to near boiling and goes off with a loud pop.",
      "Hydrogen peroxide and hydroquinone meet enzymes in a firing chamber inside it.",
      "Its name comes from the Latin for \"crackling\", for that noise.",
    ],
  },
  phrixothrix: {
    found: "Moist forest soils in Brazil, in the Atlantic Forest and the Cerrado.",
    eats: "Larvae and larviform females hunt millipedes.",
    facts: [
      "It glows in two colours at once: yellow-green windows down the body, and a red lamp on the head.",
      "The two colours come from different enzymes acting on the same luciferin.",
      "It looks like a caterpillar, but it is a beetle.",
    ],
  },
  macrodontia: {
    found: "Rainforests of Colombia, Ecuador, Peru, Bolivia, the Guianas and Brazil.",
    eats: "Larvae bore through rotting softwood.",
    facts: [
      "Counting the jaws, the longest specimen was 17.7 cm, longer than the longest Hercules beetle.",
      "It spends most of its life as a larva, for up to ten years.",
      "Those larvae dig galleries over a metre long and 10 cm wide in rotting wood.",
    ],
  },
  sagra: {
    found: "Thailand, Vietnam, Indonesia, Malaysia and India.",
    eats: "Its wild diet is little recorded. It has been raised on sweet potato.",
    facts: [
      "Males are much larger than females and have huge hind legs, hence \"frog beetle\".",
      "Its cocoons are found on climbing vines such as kudzu.",
      "It is metallic green, with reddish and golden reflections on the wing covers.",
    ],
  },
  manticora: {
    found: "Southern and central Africa, and nowhere else.",
    eats: "Other insects, including grasshoppers and crickets.",
    facts: [
      "Its members are the largest tiger beetles in the world: black, nocturnal and flightless.",
      "The name refers to the legendary man-eating manticore.",
      "Males usually have much bigger mandibles than females.",
    ],
  },
  heteropteryx: {
    found: "The Malay Peninsula, Thailand, Singapore, Sumatra and Sarawak.",
    eats: "Leaves, especially bramble, and other forest plants.",
    facts: [
      "Females weigh 30 to 65 g, among the heaviest insects alive.",
      "Threatened, it rattles its wings and snaps its spiny hind legs shut like scissors.",
      "Females cannot fly; pink hind wings stay hidden under short green forewings.",
    ],
  },
  mantispa: {
    found: "Southern and central Europe.",
    eats: "Adults seize live prey; larvae eat spider eggs.",
    facts: [
      "The larva bites into a wolf or fishing spider's egg cocoon and lives inside it.",
      "Adults strike with their forelegs in under 60 milliseconds.",
      "It is a mantidfly: a lacewing with mantis-like front legs for grabbing prey.",
    ],
  },
  nemoptera: {
    found: "The Balkans and Turkey.",
    eats: "Adults eat pollen; larvae drink water and plant sap.",
    facts: [
      "Its long hind wings end in spoon-like tips.",
      "Its larvae refuse insect prey, unusual for lacewings, and take water and plant sap.",
      "It only flies above 17 °C, with little or no wind.",
    ],
  },
  pseudocreobotra: {
    found: "Southern and eastern Africa.",
    eats: "Flying insects and spiders by preference; almost any insect.",
    facts: [
      "It mimics a flower so well that insects try to pollinate it and get eaten.",
      "It flashes its wings to show a big eyespot and startle predators.",
      "Usually light green, it can also be yellow, pink or red.",
    ],
  },
  deroplatys: {
    found: "Borneo, Indonesia, Malaysia, Sumatra and the Philippines.",
    eats: "Other insects, snatched from among dead leaves.",
    facts: [
      "Its flattened thorax and veined wings look like a dead leaf.",
      "Disturbed, it rocks gently as if blown by a breeze.",
      "It can also flash black underwings with large eyespots.",
    ],
  },
  empusa: {
    found: "The Mediterranean, from Portugal and North Africa to Turkey.",
    eats: "Only live, moving prey.",
    facts: [
      "A tall crest sticks up from its head from birth, giving it an alien look.",
      "To find mates in the dark, when they cannot see, they release a sex pheromone.",
      "It is rarely found in the wild, perhaps because it hides so well.",
    ],
  },
  polyphylla: {
    found: "North Africa, Europe and the Middle East; dunes, pine edges and vineyards.",
    eats: "Adults eat pine needles; larvae eat the roots of grasses and sedges.",
    facts: [
      "Males have a huge fan of antenna plates; Polyphylla means \"many leaves\".",
      "It is the largest of the European Melolonthinae chafers.",
      "Its reddish-brown body is marbled with patches of fine white hair.",
    ],
  },
  phanaeus: {
    found: "Eastern and central United States and northern Mexico.",
    eats: "Dung, at every stage of life. It prefers the dung of omnivores such as pigs.",
    facts: [
      "Males have iridescent shells and a horn; some carry a big one, some a small one.",
      "Pairs tunnel under dung and build pear-shaped brood balls, each with one egg.",
      "It coats those brood balls with a cement-like layer of dung.",
    ],
  },
  lethocerus: {
    found: "Still, weedy waters from India and Indochina to Japan, Korea and the Amur.",
    eats: "Small fish, amphibians and water insects; even water snakes and young turtles.",
    facts: [
      "The male keeps the eggs wet by dripping water on them from his body. Dry eggs fail to hatch.",
      "Females sometimes destroy a male's clutch so he will care for theirs instead.",
      "It hunts at night, and has taken water snakes and young turtles.",
    ],
  },
  sphaerocoris: {
    found: "Tropical and subtropical Africa, from Sierra Leone to South Africa.",
    eats: "Cotton, coffee, citrus and bitter-leaf plants.",
    facts: [
      "It is green with eleven black-edged rings on its back, plus a wavy chevron on its thorax.",
      "Disturbed, it gives off a nasty smell, like its stink-bug relatives.",
      "Nymphs are creamy white with black stripes, and get their colours only as adults.",
    ],
  },
  pheropsophus: {
    found: "Japan, North and South Korea, and Yunnan in China.",
    eats: "Larvae eat mole-cricket eggs; adults hunt other insects and earthworms.",
    facts: [
      "In one study, toads swallowed it, and 43% vomited it back up, 12 to 107 minutes later, alive.",
      "Beetles made to use up their spray first were all eaten and digested.",
      "Its spray is a reaction that makes benzoquinones, heat and pressure.",
    ],
  },
  melanophila: {
    found: "Europe, Asia, North and Central America and the Caribbean.",
    eats: "Adults take sap and other fluids from burned trees.",
    facts: [
      "It has two infrared sensors on its thorax; the water inside them swells when heated.",
      "Females lay eggs in freshly burned bark, sometimes while the wood still smoulders.",
      "Adults swarm to freshly burned conifers.",
    ],
  },
  solenopsis: {
    found: "Native to South America; now an accidental arrival almost worldwide.",
    eats: "Dead animals, insects, seeds and honeydew.",
    facts: [
      "When they sense the water rising, the ants build rafts.",
      "Its venom is about 95% solenopsins. \"Fire ant\" is for how the sting feels.",
      "More than 14 million people are stung by it in the United States every year.",
    ],
  },
  pyrrhocoris: {
    found: "Europe to north-west China; also the United States, India and Australia.",
    eats: "Seeds of lime trees and mallows.",
    facts: [
      "A mating pair can stay joined for anywhere from 12 hours to seven days.",
      "It gathers in groups at the sunny foot of lime trees.",
      "Its red and black pattern makes it easy to recognise.",
    ],
  },
  brevisana: {
    found: "Angola, Zimbabwe, South Africa and Malawi.",
    eats: "Xylem sap, like other cicadas: from roots as a nymph, from stems as an adult.",
    facts: [
      "It is likely the loudest insect on record: its song hit 106.7 decibels from 50 cm away.",
      "The runner-up, a North American cicada, reached 105.9 decibels.",
      "Its genus is spelled both Brevisana and Brevisiana.",
    ],
  },
  micronecta: {
    found: "Freshwater ponds and lakes across Europe.",
    eats: "Algae and plant debris from the pond floor, like other lesser water boatmen.",
    facts: [
      "The male sings underwater by rubbing a ridge on his penis across ridges on his abdomen.",
      "For its size it is the loudest animal known. The song has been recorded at 99.2 decibels.",
      "Almost all of the sound is lost between water and air, but people on the bank can still hear it.",
    ],
  },
  bertholdia: {
    found: "The south-western United States.",
    eats: "Larvae eat lichens, algae, moss and, later, herbaceous plants.",
    facts: [
      "It can jam the sonar of the bats that hunt it.",
      "It has the highest click rate recorded for any moth.",
      "It is one of several moths known to jam a predator's echolocation.",
    ],
  },
  gromphadorhina: {
    found: "Madagascar, in rotting logs.",
    eats: "Mostly vegetable matter.",
    facts: [
      "It hisses by forcing air out through its breathing holes, not by rubbing parts together.",
      "It has three hisses: one for alarm, and two only males make, for courting and for fighting.",
      "Females keep their eggs inside and give birth to live young.",
    ],
  },
  gryllotalpa: {
    found: "South-western Europe.",
    eats: "A species-level diet is unpublished. Other mole crickets eat roots and small soil animals.",
    facts: [
      "The male digs a Y-shaped burrow and sings from a bulb inside it; the burrow is a resonator.",
      "A metre from the burrow the song measures 90 decibels, and it can be heard 600 m away.",
      "One forewing scrapes a row of teeth on the other, 3,500 times a second.",
    ],
  },
  dytiscus: {
    found: "Europe and northern Asia, in still or slow fresh water with plenty of plants.",
    eats: "A wide range of prey, including small fish.",
    facts: [
      "It flies at night and finds water by the moon's reflection, so it sometimes lands on wet roads.",
      "Before a dive it traps air under its wing cases.",
      "Males have suction cups on their front legs, for mating and for gripping prey.",
    ],
  },
  notonecta: {
    found: "Europe, North Africa and east through Asia to Siberia and China.",
    eats: "Prey taken at the surface; females also dive for isopods.",
    facts: [
      "It swims and rests upside down, wearing a film of air that can last up to 120 days.",
      "It knows prey by its ripples: prey makes faster waves than other backswimmers.",
      "It has no gills. That air film covers everything but its head and legs.",
    ],
  },
  gyrinus: {
    found: "Still and slow-moving freshwater around the world.",
    eats: "Adults scavenge and hunt on the surface; larvae hunt on the stream bed.",
    facts: [
      "Each eye is split in two: one half looks above the water, the other below.",
      "The ripples it makes may work like radar, telling it what is on the surface.",
      "Alarmed, it swims in fast circles.",
    ],
  },
  halobates: {
    found: "Tropical and subtropical seas worldwide.",
    eats: "Zooplankton, floating insects, fish eggs and dead jellyfish.",
    facts: [
      "Five of its species live on the open ocean: the only truly oceanic insects known.",
      "One species' skin reflects more than 99.9998% of ultraviolet light. Nobody knows how.",
      "Ocean species lay eggs on anything that floats. One plastic jug held about 70,000, in 15 layers.",
    ],
  },
  phloeodes: {
    found: "California and Baja California, and parts of southern Oregon.",
    eats: "Probably fungus: lichen on bark, and the white rot in dead trees.",
    facts: [
      "Run over it with a car and it lives on.",
      "Its skeleton can take about 39,000 times its own body weight.",
      "A collector cannot push a pin through it. A hole has to be drilled first.",
    ],
  },
  photuris: {
    found: "Temperate North America, mainly from the East Coast to Texas.",
    eats: "The adult female eats other fireflies.",
    facts: [
      "The female copies another species' flash. A male comes down to her, and she kills him and eats him.",
      "Her victims are mostly rover fireflies, which are no close relation.",
      "Some go by names like Christmas lights, July comet, big scary and Florida single snappy.",
    ],
  },
  arachnocampa: {
    found: "Only New Zealand: caves, crevices and damp banks in the bush.",
    eats: "Mostly midges and other small flies. On a bank, spiders too.",
    facts: [
      "The larva hangs up to 30 silk threads and beads them with sticky droplets.",
      "Where it is crowded and food is short, they eat each other.",
      "Every stage glows except the egg.",
    ],
  },
  myrmeleon: {
    found: "Worldwide, mostly where it is warm, dry and sandy.",
    eats: "The larva eats small arthropods, mainly ants. Some adults eat pollen.",
    facts: [
      "The larva has no anus. It keeps all its waste until it is grown, and spins some of it into its cocoon.",
      "It digs a funnel in the sand and waits at the bottom, then throws sand at anything climbing out.",
      "A larva can go many months without food.",
    ],
  },
  odontomachus: {
    found: "Southern Costa Rica through tropical South America, the West Indies and the Galápagos.",
    eats: "Worms, spiders, termites, other ants: soft prey about 3 to 4 mm long.",
    facts: [
      "Its jaws snap shut in about 130 microseconds and hit 126 to 230 km/h.",
      "Snapped against an intruder, they throw the ant up to 40 cm away: the bouncer defence.",
      "They are the second-fastest predatory appendages known. A dracula ant has the fastest.",
    ],
  },
  dasymutilla: {
    found: "The eastern United States: Connecticut to Kansas, south to Florida and Texas.",
    eats: "Adults drink nectar. The larva eats another wasp's larva.",
    facts: [
      "It is not an ant. It is a wasp, and the female has no wings.",
      "Its sting is rated 3 out of 4 on the Schmidt pain index, which is why it is called the cow killer.",
      "Alarmed, it squeaks. A velvet ant's shell took 11 times the force to crush that a honeybee's did.",
    ],
  },
  peruphasma: {
    found: "The Cordillera del Cóndor in northern Peru: in the wild, less than five hectares.",
    eats: "Schinus plants in the wild. In captivity, privet, Aucuba and honeysuckle.",
    facts: [
      "Its whole wild range is less than five hectares.",
      "Disturbed, it sprays a liquid from glands behind its head that irritates skin and eyes.",
      "It is black, with yellow eyes and small bright red wings.",
    ],
  },
  ampulex: {
    found: "Tropical Africa, South and Southeast Asia and the Pacific islands.",
    eats: "The larva eats a living cockroach, first from the outside and then from the inside.",
    facts: [
      "It stings a cockroach in the brain, then leads it to a burrow by an antenna, like a dog on a lead.",
      "The cockroach can still walk, but for about 72 hours it has very little interest in surviving.",
      "The wasp bites off half of each antenna and drinks from the stumps.",
    ],
  },
  colobopsis: {
    found: "Thailand, Malaysia and Borneo.",
    eats: "Workers graze plants on tree bark; they will also eat dead insects and fish.",
    facts: [
      "A worker flexes its abdomen until it bursts. It does this on purpose.",
      "What comes out is a bright, toxic sludge that smells of spice, informally called yellow goo.",
      "Bursting yourself on purpose is called autothysis. Some termites do it too.",
    ],
  },
  dryococelus: {
    found: "Lord Howe Island. In the wild today, only Ball's Pyramid, a sea stack 23 km away.",
    eats: "On Ball's Pyramid, the leaves of one Melaleuca shrub (Melaleuca howeana).",
    facts: [
      "Believed extinct after rats reached Lord Howe Island. In 2001 it was found alive on Ball's Pyramid.",
      "A pair named Adam and Eve went to Melbourne Zoo. Eve laid 248 eggs; the zoo has bred thousands since.",
      "Pairs often rest together, the male with three legs protectively over the female.",
    ],
  },
  megachile: {
    found: "Three islands of the North Moluccas: Bacan, Halmahera and Tidore.",
    eats: "Nectar and pollen. It gathers tree resin for its nest.",
    facts: [
      "It is the largest known living bee. Only the females are giants; males are little more than half as long.",
      "It was believed extinct until 1981, and nobody saw one alive again until 2019.",
      "It nests inside active termite nests in trees, lined with resin carried in its huge jaws.",
    ],
  },
  meganeura: {
    found: "Known from fossils in the coal measures of Commentry, in central France.",
    eats: "A predator. It ate other insects.",
    facts: [
      "With a wingspan of about 65 to 70 cm, it is one of the largest flying insects known.",
      "It lived about 300 million years ago. It looks like a dragonfly but is a griffinfly, an order now gone.",
      "Why insects grew so big then is still argued over. One idea is that the air held more oxygen.",
    ],
  },
  steeze: {
    found: "The Acid Mines, usually standing in a tunnel as if he had always been there.",
    eats: "Chicken fingers, ordered at a restaurant. He does not eat acid.",
    facts: [
      "STEEZE was found in the mines already wearing the outfit, already mid-swing.",
      "He hordes wealth. The spelling is his.",
      "He plays golf in the tunnels. The ball usually comes back.",
    ],
  },
  menacanthus: {
    found: "Poultry yards worldwide, on chickens, turkeys and other galliform birds.",
    eats: "Skin debris, feather parts and blood from damaged skin, taken on the host.",
    facts: [
      "The whole life cycle stays on the host. It does not drop off to lay eggs somewhere else.",
      "It is only two to three millimetres long: easy to miss until it is already on you.",
      "The body is flattened and straw-coloured, which is how it got the name stramineus.",
    ],
  },
};

export const FACTS = Object.fromEntries(BUGS.map((bug) => {
  const copy = COPY[bug.id];
  if (!copy) throw new Error(`bug-facts: no card copy for ${bug.id}`);
  const sources = [...new Set([...(bug.sources || []), ...(FILL_SOURCES[bug.id] || [])])];
  return [bug.id, {
    id: bug.id,
    name: bug.name,
    sci: bug.sci,
    genus: !!bug.genus,
    order: bug.order,
    kind: KIND[bug.id] || 'science',
    found: copy.found,
    eats: copy.eats,
    facts: copy.facts,
    sources,
    lore: LORE_NOTE[bug.id] || null,
  }];
}));

export const factsFor = (id) => FACTS[id] || null;

/** Whether the post-catch fact card should open. Shown once per catch, never on a replay. */
export function shouldShowCatchFacts({ reason, replay = false, dismissed = false, tossing = false } = {}) {
  return reason === 'jarred' && !replay && !dismissed && !tossing;
}

/**
 * Everything the fact card shows at once: range, diet, the strange facts (most striking first),
 * then any clearly marked lore (Thanksgiving note, a Stage II barn name such as Bloom Eye, a botched rebuild).
 */
export function factCard(id, { evo = 0, botched = null } = {}) {
  const f = FACTS[id];
  if (!f) return null;
  const lore = [];
  if (f.lore) lore.push({ key: 'note', text: f.lore, label: 'Academy lore' });
  const stage = evo >= 1 && STAGE_II_NAME[id] && id !== 'steeze';
  if (stage) {
    const who = BUG_BY_ID[id]?.name || f.name;
    lore.push({
      key: 'stage2',
      text: `In the barn, a Stage II ${who} is called ${STAGE_II_NAME[id]}. That form is Bug Center work, not a wild insect.`,
      label: 'Academy lore',
    });
  }
  if (botched) {
    lore.push({
      key: 'botched',
      text: `This one came back from the Bug Center botched (${botched}): a porcelain face and an arm on the wrong side. That is a rebuild gone wrong, not natural history.`,
      label: 'Academy lore',
    });
  }
  return {
    ...f,
    foundLabel: f.kind === 'lore' ? 'Where' : 'Found',
    eatsLabel: 'Eats',
    factsLabel: f.kind === 'lore' ? 'Academy lore' : 'Strange facts',
    lore,
  };
}

/** @deprecated use factCard; kept as a thin wrapper for older tests. */
export function factPages(id, opts = {}) {
  const c = factCard(id, opts);
  if (!c) return [];
  return [
    { key: 'about', kind: c.kind, found: c.found, eats: c.eats, foundLabel: c.foundLabel, eatsLabel: c.eatsLabel },
    ...c.facts.map((text, i) => ({ key: `fact${i}`, kind: c.kind, fact: text, label: c.factsLabel })),
    ...c.lore.map((l) => ({ key: l.key, kind: 'lore', fact: l.text, label: l.label })),
  ];
}
