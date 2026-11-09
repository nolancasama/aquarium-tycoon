// Shared seeded saves for the hub and coast review scripts.
let id = 100;
const tank = (type, slot, species = [], decor = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((species) => ({ id: `f${id++}`, species })),
  decor: decor.map(([kind, variant, slot]) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
const tanks = [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
  tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish", "goby"]),
  tank("sharks", "L", ["blacktip", "eagleray"], [["tunnelArch", null, 0]])];
export const hubModel = (introSeen) => ({
  coins: 600, tanks, inv: { fish: [], decor: [], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
    hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
    atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [],
    tunnelOpen: true, tunnelIntroSeen: true, hubIntroSeen: introSeen,
    tunnel: { milestone: 3, observed: 6, helped: 3, findDone: false, whereDone: false, countDone: false, trophy: false } },
  rush: { unlocked: true, introSeen: true, phase: "waiting", untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
    stats: { events: 2, bronze: 1, silver: 1, gold: 0, successes: 2, best: "silver", bestReady: 3 }, rewards: [] },
  stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
});

