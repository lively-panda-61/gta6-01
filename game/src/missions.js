// Port Solano — the story: 8 missions, in order.
// Pure data (no three.js, no DOM) so the test suite can import it in Node.
// Every objective names a place in the city by coordinates; the runner
// turns them into waypoints, timers and combat encounters.
// The story: you are Maya "Vex" Solano, a driver fresh out of prison,
// working for fixer Rico Delgado to buy back your late brother's garage
// from the Marlow crew — one job at a time, until the Kingpin falls.
export const MISSIONS = [
  {
    id: 'm1-first-job',
    title: 'First Job',
    giver: 'Rico Delgado',
    briefing: 'Welcome home, Vex. Your brother\'s garage is Marlow\'s now — unless you earn it back. First, prove you can still drive: pick up a package at the East Port docks and bring it to the Marina safehouse. No questions, no cops, no shortcuts through the plaza.',
    objectives: [
      { type: 'goto', text: 'Pick up the package at the East Port docks', target: { x: 168, z: 48 }, radius: 8 },
      { type: 'delivery', text: 'Deliver the package to the Marina safehouse', target: { x: -120, z: 168 }, radius: 8 },
    ],
    reward: 500,
  },
  {
    id: 'm2-harbor-run',
    title: 'Harbor Run',
    giver: 'Rico Delgado',
    briefing: 'A client\'s yacht leaves the Sunset Pier in four minutes and the cargo is still at the stadium. Drive like the harbor depends on it — because it does. Late means the cargo sleeps with the fishes, and so does your cut.',
    objectives: [
      { type: 'goto', text: 'Collect the cargo at Harbor Stadium', target: { x: -168, z: 24 }, radius: 8 },
      { type: 'timed', text: 'Reach Sunset Pier before the yacht leaves', target: { x: -120, z: 200 }, radius: 10, seconds: 150 },
    ],
    reward: 800,
  },
  {
    id: 'm3-turf-war',
    title: 'Turf War',
    giver: 'Lena Cross',
    briefing: 'Marlow\'s boys are shaking down every shop on Civic Plaza. Lena wants them gone — all of them — before the market opens. On foot, loud if you have to be. The plaza is yours after this.',
    objectives: [
      { type: 'goto', text: 'Get to Civic Plaza', target: { x: 24, z: 24 }, radius: 12 },
      { type: 'eliminate', text: 'Clear out Marlow\'s crew at the plaza', target: { x: 24, z: 24 }, radius: 20, count: 4 },
    ],
    reward: 1200,
  },
  {
    id: 'm4-getaway',
    title: 'The Getaway',
    giver: 'Rico Delgado',
    briefing: 'A customer left a Comet GT parked outside the Solano Tower and never came back. Take it. The owner\'s friends will call the police — lose them, then bring the car to the Old Town garage. Don\'t scratch the paint. Actually, scratch it. It\'s Marlow\'s car.',
    objectives: [
      { type: 'goto', text: 'Steal the Comet GT at Solano Tower', target: { x: 24, z: -48 }, radius: 8 },
      { type: 'escape', text: 'Lose the police, then reach the Old Town garage', target: { x: -168, z: -120 }, radius: 10 },
    ],
    reward: 1500,
  },
  {
    id: 'm5-cash-drop',
    title: 'Cash Drop',
    giver: 'Lena Cross',
    briefing: 'A Marlow courier van is moving the week\'s take from the port to the tower. Ram it until it drops the cash, grab the bag, and get out before their backup arrives. The van won\'t stop for you.',
    objectives: [
      { type: 'chase', text: 'Chase down the courier van', target: { x: 120, z: 0 }, radius: 14 },
      { type: 'goto', text: 'Collect the dropped cash bag', target: { x: 96, z: -24 }, radius: 6 },
      { type: 'escape', text: 'Escape to the Marina safehouse', target: { x: -120, z: 168 }, radius: 10 },
    ],
    reward: 2200,
  },
  {
    id: 'm6-port-heist',
    title: 'Port Heist',
    giver: 'Rico Delgado',
    briefing: 'Marlow keeps his ledger in a container at the East Port — every name, every debt, every deal. Get in, grab the ledger, and get out. His guards shoot first. So do we, tonight.',
    objectives: [
      { type: 'goto', text: 'Infiltrate the East Port container yard', target: { x: 168, z: 96 }, radius: 10 },
      { type: 'heist', text: 'Grab the ledger from the marked container', target: { x: 192, z: 96 }, radius: 6 },
      { type: 'eliminate', text: 'Fight through the port guards', target: { x: 168, z: 96 }, radius: 22, count: 3 },
      { type: 'escape', text: 'Escape with the ledger to the safehouse', target: { x: -120, z: 168 }, radius: 10 },
    ],
    reward: 3000,
  },
  {
    id: 'm7-vip-escort',
    title: 'VIP Escort',
    giver: 'Lena Cross',
    briefing: 'The city councillor who can bury Marlow is landing at the Marina — but Marlow knows it too. Escort her limousine to the downtown hotel and keep it in one piece. If that car takes a bullet, the whole plan dies with it.',
    objectives: [
      { type: 'goto', text: 'Meet the limousine at the Marina', target: { x: -72, z: 192 }, radius: 10 },
      { type: 'defend', text: 'Escort the limousine to the downtown hotel', target: { x: 48, z: -24 }, radius: 12 },
    ],
    reward: 3500,
  },
  {
    id: 'm8-kingpin',
    title: 'Kingpin',
    giver: 'Rico Delgado',
    briefing: 'This is it, Vex. Marlow is on the roof of Solano Tower with his whole crew, watching his empire. End him, take the garage papers from his office, and disappear before the helicopters arrive. Your brother\'s name goes back on that door tonight.',
    objectives: [
      { type: 'goto', text: 'Reach Solano Tower', target: { x: 0, z: -24 }, radius: 14 },
      { type: 'eliminate', text: 'Take down Marlow and his crew', target: { x: 0, z: -24 }, radius: 24, count: 5 },
      { type: 'escape', text: 'Escape the police and reach the garage', target: { x: -168, z: -120 }, radius: 10 },
    ],
    reward: 5000,
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function nextMissionId(completedIds) {
  const done = new Set(completedIds || []);
  const next = MISSIONS.find((m) => !done.has(m.id));
  return next ? next.id : null;
}
