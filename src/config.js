// Every tunable number and the palette. Units: metres, seconds. y is up, sea level is y = 0.

export const SEED = 1337;

// Island shape
export const ISLAND_RADIUS = 60;
export const GRASS_RADIUS = 48;
export const SEA_FLOOR_RADIUS = 75;
export const GRASS_HEIGHT = 1.2;
// A big hill with a level summit, a lower shoulder beside it, and a steep seaward face.
export const HILL = { x: -18, z: -22, radius: 30, height: 13, plateau: 6.5 };
export const SHOULDER = { x: -37, z: -3, radius: 12, height: 4.5 };
// The trail that winds up the hill. A level bed is cut into the hillside along it.
// It starts at the camp side and winds two-thirds of the way round the hill, behind it and up
// the far side, gaining height evenly all the way, so it is an easy walk for short legs.
export const HILL_TRAIL = (() => {
  const s = (t) => t * t * (3 - 2 * t), span = HILL.radius - HILL.plateau;
  const pAt = (d) => s(Math.min(1, Math.max(0, 1 - (d - HILL.plateau) / span)));
  const start = { x: 1, z: -2 }, d0 = Math.hypot(start.x - HILL.x, start.z - HILL.z), a0 = Math.atan2(start.z - HILL.z, start.x - HILL.x);
  const dEnd = HILL.plateau + 1, turn = -4.3, N = 18;
  const f0 = pAt(d0) ** 1.2, f1 = pAt(dEnd) ** 1.2;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = (f0 + (f1 - f0) * u) ** (1 / 1.2);
    let lo = dEnd, hi = d0; // find the distance from the top where the hill is this high
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (pAt(mid) > p) lo = mid; else hi = mid; }
    // It heads straight for the hill at first, clear of the headquarters tent, and only then starts to wind.
    const d = i === 0 ? d0 : (lo + hi) / 2, a = a0 + turn * u ** 1.5;
    out.push({ x: +(HILL.x + Math.cos(a) * d).toFixed(2), z: +(HILL.z + Math.sin(a) * d).toFixed(2) });
  }
  return out;
})();
// Behind the hill the island runs on into a wide wild jungle, far bigger than the camp's corner
// of it: the island is mostly jungle, and only the part near you is drawn. There is no fence: the trees simply close in. Past `border` (metres from the middle of
// camp) a warning shows; nobody gets more than `limit` metres beyond that. `trees` is where the
// big jungle trees begin, and `blend` rounds the two parts of the coast into one outline.
export const WILD = { x: -207, z: -253, radius: 300, border: 70, limit: 12, trees: 50, blend: 30 };
export const MAX_WADE_DEPTH = 0.45;
// A shallow pond you can wade right across, and a knoll the windmill stands on.
export const POND = { x: -26, z: 12, rw: 6, bank: 4, depth: 0.4 };
export const KNOLL = { x: 30, z: -22, r: 11, height: 1.4 };
// The camp itself stays level; the land rolls gently further out.
export const CAMP_FLAT = { x: 10, z: 8, inner: 20, outer: 34 };
export const MIN_WADE_SPEED = 0.35;

// ---- The bigger island ------------------------------------------------------------------
// Across a river to the north-east lies the locals' land; a rock massif closes the river's
// northern end, with a lake at its foot and a waterfall off the cliff. Every place an area
// builder needs is named here, so the land and the things on it agree. The terrain is built
// from these numbers (src/logic/terrain.js); change them and the ground follows.
export const AREAS = (() => {
  // The river, from the lake at its head down to the sea. `w` is its half width in metres.
  // It runs along what used to be the camp's north-east coast, a stride off the old waterline.
  const river = [
    { x: 63, z: -113, w: 5 }, { x: 57.7, z: -101.5, w: 5 }, { x: 53.5, z: -93, w: 4.6 }, { x: 48.3, z: -84.8, w: 5.6 },
    { x: 42.9, z: -76.8, w: 5.8 }, { x: 39, z: -69.7, w: 6 }, { x: 37.4, z: -63.7, w: 6 }, { x: 38.4, z: -58.2, w: 5.8 },
    { x: 42.4, z: -51.6, w: 5.8 }, { x: 49, z: -43.8, w: 6 }, { x: 55.7, z: -35.1, w: 6.2 }, { x: 60.9, z: -26.6, w: 6.5 },
    { x: 64.1, z: -17.7, w: 7 }, { x: 66.4, z: -8.5, w: 7 }, { x: 69, z: 2, w: 7 },
  ];
  // A plank bridge at the camp end, on the line from camp to the village: `a` on the camp bank.
  const bridge = { a: { x: 53.4, z: -21.2 }, b: { x: 69.6, z: -29 }, width: 2.4, arch: 0.7 };
  // Stepping stones across a shallow ford near the lake, a stride apart, camp side first.
  const ford = { x: 55.6, z: -97.2 }, across = { x: 0.897, z: 0.443 };
  const AREAS_BRIDGE_B = bridge.b;
  const stones = Array.from({ length: 11 }, (_, i) => { const k = (i - 5) * 1.12; return { x: +(ford.x + across.x * k).toFixed(2), z: +(ford.z + across.z * k).toFixed(2), r: 0.55 }; });
  // ---- The locals' hillside (see docs/superpowers/specs/2026-11-16-living-village-design.md) ----
  // The village climbs a spur that rises away from the bridge's east landing. Village plans are
  // given in the village frame: `u` metres uphill (from the landing toward the top terrace), `v`
  // metres across (positive toward the south coast). The terraces' faces bow down toward the
  // bridge like the contours of a spur, so they are measured along `ue = u - bow * (v - vc)^2`.
  const VF = (() => {
    const ux = 0.81, uz = -0.5864, l = Math.hypot(ux, uz);
    return { o: { x: 69.6, z: -29 }, ux: ux / l, uz: uz / l, vx: -uz / l, vz: ux / l, bow: 0.012, vc: -3 };
  })();
  // A point of the village plan (ue, v) in the world, and the heading (rotation about y, as used by
  // three.js: 0 faces +z) that looks along the frame: 'up' (uphill), 'down', 'south' (+v), 'north' (-v).
  const vw = (ue, v) => { const u = ue + VF.bow * (v - VF.vc) ** 2; return { x: +(VF.o.x + VF.ux * u + VF.vx * v).toFixed(2), z: +(VF.o.z + VF.uz * u + VF.vz * v).toFixed(2) }; };
  const HEAD = { up: Math.atan2(VF.ux, VF.uz), down: Math.atan2(-VF.ux, -VF.uz), south: Math.atan2(VF.vx, VF.vz), north: Math.atan2(-VF.vx, -VF.vz) };
  const head = (d) => +HEAD[d].toFixed(4);
  // Four level terraces, 1.3 m apart. Each spans ue u0..u1 and v v0..v1 (level all over; at the sides
  // a 2 m soft rim outside v0..v1 blends into the hillside). Between terrace k and k+1 the ground climbs over 1 m of ue, from
  // u1 of the lower (the foot of the face) to u0 of the upper (its top): that is where a retaining
  // wall stands (front on the foot line, top at the upper level). The faces cannot be walked up.
  const TER = [
    { id: 'low', y: 1.4, u0: 6, u1: 17, v0: -23, v1: 12 },
    { id: 'second', y: 2.7, u0: 18, u1: 31, v0: -23, v1: 13 },
    { id: 'square', y: 4.0, u0: 32, u1: 50, v0: -20, v1: 16 },
    { id: 'top', y: 5.3, u0: 51, u1: 62, v0: -16, v1: 16 },
  ];
  const STAIR_V = -3; // the main stair line, straight up the middle of the village
  const terraces = TER.map((t, k) => {
    const outline = [];
    for (let v = t.v0; v <= t.v1 + 1e-6; v += (t.v1 - t.v0) / 8) outline.push(vw(t.u0, v));
    for (let v = t.v1; v >= t.v0 - 1e-6; v -= (t.v1 - t.v0) / 8) outline.push(vw(t.u1, v));
    const next = TER[k + 1], face = next ? { v0: Math.max(t.v0, next.v0), v1: Math.min(t.v1, next.v1) } : null;
    return {
      ...t, centre: vw((t.u0 + t.u1) / 2, (t.v0 + t.v1) / 2), outline,
      // The foot of the face up to the next terrace (where the wall's front stands), north end first.
      wallFoot: face ? Array.from({ length: 9 }, (_, i) => vw(t.u1, face.v0 + (face.v1 - face.v0) * (i / 8))) : null,
      wallTop: next ? next.y : null,
    };
  });
  // Steps: where a face is replaced by an even slope 2.8 m long (1.3 m rise, about 25 degrees), 2.4 m
  // wide, centred on the face. Lay stone steps on it: `foot` on the lower terrace, `top` on the upper.
  const STEP_RUN = 2.8, STEP_W = 2.4;
  const steps = [[0, STAIR_V], [1, STAIR_V], [2, STAIR_V], [0, -14.5], [1, -14.5]].map(([k, v]) => {
    const c = (TER[k].u1 + TER[k + 1].u0) / 2;
    return { from: TER[k].id, to: TER[k + 1].id, ue: c, v, ...vw(c, v), foot: vw(c - STEP_RUN / 2, v), top: vw(c + STEP_RUN / 2, v), y0: TER[k].y, y1: TER[k + 1].y, width: STEP_W, run: STEP_RUN, rot: head('up') };
  });
  // The cart ramp: a lane `zone` m wide past the south ends of the terraces (v1 .. v1 + zone). In it each
  // terrace runs on at its own level, and where a wall would be the ground is an even ramp `run` m long
  // (1.3 m up, 16%), centred on the face line. `slopes` are those ramps (foot on the lower terrace).
  const RAMP_ZONE = 5, RAMP_RUN = 8, laneV = (k) => TER[k].v1 + 2.5;
  const rampSlopes = TER.slice(0, -1).map((t, k) => {
    const c = (t.u1 + TER[k + 1].u0) / 2, v = (laneV(k) + laneV(k + 1)) / 2;
    return { from: t.id, to: TER[k + 1].id, v, foot: vw(c - RAMP_RUN / 2, v), top: vw(c + RAMP_RUN / 2, v), y0: t.y, y1: TER[k + 1].y, rot: head('up') };
  });
  const ramp = {
    width: 3, zone: RAMP_ZONE, run: RAMP_RUN, slopes: rampSlopes,
    path: [vw(1, laneV(0)), vw(11.5, laneV(0)), rampSlopes[0].foot, rampSlopes[0].top, vw(24.5, laneV(1)), rampSlopes[1].foot, rampSlopes[1].top, vw(41, laneV(2)), rampSlopes[2].foot, rampSlopes[2].top, vw(56.5, laneV(3)), vw(62, laneV(3))],
  };
  const square = { ...vw(41, STAIR_V), r: 8, y: 4.0 };
  // House plots, 7 m wide (across) and 6 m deep including the yard, backs 1 m off the face behind them.
  // `front` is the heading the door looks (downhill, onto the terrace walk in front).
  const plot = (k, v) => { const t = TER[k]; return { terrace: t.id, ue: t.u1 - 4, v, ...vw(t.u1 - 4, v), y: t.y, w: 7, d: 6, front: head('down') }; };
  const plots = [plot(0, -19.5), plot(0, -9.5), plot(0, 5.5), plot(1, -19.5), plot(1, -9.5), plot(1, 7), plot(3, -12), plot(3, 11.5)];
  const hall = { ue: 57, v: -1, ...vw(57, -1), y: 5.3, w: 12, d: 9, front: head('down') };
  const stalls = [36, 41, 46].map((ue) => ({ ue, v: 8.5, ...vw(ue, 8.5), y: 4.0, front: head('north') }));
  const banyan = { ue: 41, v: -15.5, ...vw(41, -15.5), y: 4.0, r: 4.5 };
  const well = { ue: 43.5, v: -1, ...vw(43.5, -1), y: 4.0 };
  // Walks along the front of each terrace, from end to end (out to the ramp lane on the south).
  const walk = (ue, v0, v1) => { const n = Math.ceil((v1 - v0) / 4); return Array.from({ length: n + 1 }, (_, i) => vw(ue, v0 + ((v1 - v0) * i) / n)); };
  // ---- The farm valley: a broad shallow valley north of the village, between the spur, the ridge and the
  // cliffs. A stream rises at a spring under the ridge and runs west into the river.
  const stream = [
    { x: 136, z: -106.5 }, { x: 127, z: -106.5 }, { x: 117, z: -105.5 }, { x: 106, z: -104 }, { x: 95, z: -101 },
    { x: 85, z: -96.5 }, { x: 75, z: -90 }, { x: 65, z: -83 }, { x: 55.5, z: -77 }, { x: 46.5, z: -73.6 },
  ];
  // ---- The wooded ridge: its crest from the top of the village round to the cliffs. `rise` is how much it
  // stands above the land round it, `hw` how far its flanks reach either side.
  const ridge = [
    { ...vw(64, STAIR_V), rise: 3.2, hw: 14 }, { x: 131, z: -68, rise: 4.6, hw: 17 }, { x: 140, z: -73.5, rise: 6, hw: 19 },
    { x: 147, z: -79, rise: 7, hw: 20 }, { x: 151, z: -89, rise: 8, hw: 21 }, { x: 150, z: -101, rise: 8.2, hw: 21 },
    { x: 143, z: -112, rise: 7.2, hw: 20 }, { x: 132, z: -121, rise: 6, hw: 18 },
  ];
  const clearing = { x: 147, z: -79, r: 6, y: 9.9 };
  // The ridge trail: from the top terrace (between the hall and the south house) up the spur's crest to the clearing, about 14%.
  const ridgeTrail = [vw(61, 6.2), vw(66, 5), { x: 131, z: -67 }, { x: 137.5, z: -71.5 }, { x: 142.5, z: -75.5 }, { x: 146.2, z: -78.6 }];
  // Paddy fields stepping down the valley sides: rectangles (centre, heading `rot`, half sizes: `hw`
  // along the heading's right-hand axis (cos rot, -sin rot), `hd` along the heading). Each is levelled
  // by the terrain (0.7 m soft rim); its level is written into `y` when the terrain loads. Change this
  // list and the ground follows.
  const paddyFields = [
    // the spur's north flank under the village, and by the river below the low terrace
    ...[[86, -88], [81, -75], [92, -83], [62, -61], [59, -69]].map(([x, z]) => ({ zone: 'south', x, z, rot: 0.9, hw: 5.2, hd: 3 })),
    // the valley's north side, under the cliffs
    ...[[85, -109], [89, -118], [101, -118], [113, -118]].map(([x, z]) => ({ zone: 'north', x, z, rot: 0.06, hw: 5.2, hd: 3 })),
  ];
  for (const f of paddyFields) { f.x = +f.x.toFixed(2); f.z = +f.z.toFixed(2); f.rot = +f.rot.toFixed(4); }
  const valley = {
    // The valley floor and its gentle sides (farm country), as an outline.
    outline: [{ x: 50, z: -71 }, { x: 64, z: -72 }, { x: 80, z: -78 }, { x: 98, z: -84 }, { x: 116, z: -88 }, { x: 128, z: -94 }, { x: 138, z: -101 },
      { x: 136, z: -112 }, { x: 122, z: -119 }, { x: 100, z: -122 }, { x: 80, z: -120 }, { x: 74, z: -106 }, { x: 62, z: -96 }, { x: 54, z: -84 }],
  };
  const spring = { x: 137.5, z: -106.8, r: 2.2 };
  // The paths the village and farm are meant to have (polylines). The ground is painted along them.
  const paths = {
    // From the bridge straight up the stairs, across the square, to the hall.
    main: [AREAS_BRIDGE_B, vw(3, STAIR_V + 2), vw(7.5, STAIR_V), vw(19.5, STAIR_V), vw(33.5, STAIR_V), vw(48.5, STAIR_V), vw(52.5, STAIR_V)],
    walkLow: walk(7.5, -23, laneV(0)), walkSecond: walk(19.5, -23, laneV(1)), walkSquare: walk(33.5, -20, laneV(2)), walkTop: walk(52.5, -16, laneV(3)),
    ramp: ramp.path,
    // North off the village: from the low terrace's north end and from beside the banyan, across the stream to the north fields.
    toFarmWest: [vw(7.5, -23), { x: 67, z: -62 }, { x: 70.5, z: -70 }, { x: 75, z: -80 }, { x: 78.5, z: -88 }, { x: 80.6, z: -93.6 }, { x: 83.5, z: -101.5 }],
    toFarmEast: [vw(33.5, -20), vw(37, -24), { x: 96, z: -78 }, { x: 101.5, z: -88 }, { x: 104.5, z: -97 }, { x: 106, z: -108.5 }],
    // Along the valley's north side, from the stepping stones to the spring.
    valley: [{ x: 61.5, z: -94.2 }, { x: 72, z: -96 }, { x: 83.5, z: -101.5 }, { x: 95, z: -105.5 }, { x: 106, z: -108.5 }, { x: 117, z: -109.8 }, { x: 127, z: -110.2 }, { x: 133.5, z: -109.8 }],
    // From the top of the ramp lane east over the low country to the jetty.
    jetty: [vw(62, laneV(3)), { x: 145, z: -42 }, { x: 156, z: -44 }, { x: 165, z: -51 }, { x: 170, z: -57 }, { x: 172.5, z: -62 }],
    ridgeTrail,
  };
  const A = {
    river,
    riverMouth: { x: 64.1, z: -17.7 },          // where the river meets the sea; land on both sides ends here
    locals: { x: 120, z: -70, r: 60 },          // the locals' land: a round of land across the river
    // Old keys, kept pointing at the new places: the square (village), the valley's farm, its north fields.
    village: { x: square.x, z: square.z, r: 18 },
    farm: { x: 100, z: -98, r: 30 },
    orchard: { x: 122, z: -98, r: 8 },
    paddies: { x: 97, z: -113, r: 14 },
    jetty: { x: 177, z: -62, rot: Math.PI / 2 }, // the fishing jetty on the far shore, pointing out to sea (east)
    // The hillside (see the comments above for what each means).
    villageFrame: VF, terraces, steps, ramp, square, plots, hall, stalls, banyan, well,
    valley, stream, spring, paddyFields, ridge, ridgeTrail, clearing, paths,
    // Where paths cross the stream (plank crossings go here): filled in below.
    streamCrossings: [],
    lake: { x: 63, z: -113, r: 12.5, depth: 1.8 },
    // The massif: a ridge of rock along a spine from `a` to `b`, `r` wide, `height` tall, stepped into ledges.
    massif: { a: { x: 40, z: -146 }, b: { x: 120, z: -144 }, r: 21, height: 12, ledge: 4 },
    cliffFace: [{ x: 50, z: -125.5 }, { x: 63, z: -124.6 }, { x: 78, z: -124.2 }, { x: 118, z: -123 }], // the foot of the cliff, west to east
    waterfall: { top: { x: 63, z: -131, y: 12.4 }, foot: { x: 63, z: -124.6, y: 0 } },
    lookout: { x: 56, z: -133, r: 4 },            // a level ledge on the cliff top beside the fall
    // The cliff path: from the lake's west shore it zig-zags up the gentler west end of the massif
    // (about 14% all the way, a little gentler than the hill trail), then runs along the top to the lookout.
    cliffPath: [{ x: 50, z: -119 }, { x: 30, z: -125 }, { x: 27, z: -133 }, { x: 44, z: -136 }, { x: 40, z: -145 }, { x: 52, z: -142 }, { x: 56, z: -135.5 }],
    bridge,
    stones,
    ford,
    dock: { x: 53.45, z: 17.37, rot: 1.257 },     // today's dock: its shore end and heading (see DOCK in layout.js)
    // Trails on the new land: from the windmill knoll along the camp-side bank to the lake, and to the bridge.
    trails: [
      [{ x: 42.5, z: -19 }, { x: 43, z: -25 }, { x: 39.5, z: -31 }, { x: 34, z: -40.5 }, { x: 29, z: -50 }, { x: 24.5, z: -62 }, { x: 25.5, z: -75 },
        { x: 31, z: -84.6 }, { x: 36.5, z: -92.5 }, { x: 42, z: -100 }, { x: 46.5, z: -108 }, { x: 50, z: -119 }],
      [{ x: 42.5, z: -19 }, { x: 47.5, z: -19.6 }, { x: 53.4, z: -21.2 }],
    ],
    // The village plan as code: a point of the plan (ue, v) in the world.
    villagePoint: vw,
  };
  // Where each path crosses the stream: { x, z, path (its name), heading across }.
  for (const [name, pts] of Object.entries(paths)) for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < stream.length - 1; j++) {
    const p = pts[i], q = pts[i + 1], a = stream[j], b = stream[j + 1];
    const d = (q.x - p.x) * (b.z - a.z) - (q.z - p.z) * (b.x - a.x);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((a.x - p.x) * (b.z - a.z) - (a.z - p.z) * (b.x - a.x)) / d, s = ((a.x - p.x) * (q.z - p.z) - (a.z - p.z) * (q.x - p.x)) / d;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) A.streamCrossings.push({ x: +(p.x + (q.x - p.x) * t).toFixed(2), z: +(p.z + (q.z - p.z) * t).toFixed(2), path: name, rot: +Math.atan2(q.x - p.x, q.z - p.z).toFixed(4) });
  }
  return A;
})();

export const PALETTE = {
  grass: 0xe6c56f,
  grassDark: 0xd9b45c,
  grassHill: 0xedd183,
  sand: 0xf4dfb4,
  sandWet: 0xe9cfa0,
  path: 0xf6e2b0,
  water: 0x8cc3d2,
  waterDeep: 0x5a8fb6,
  foam: 0xffffff,
  wood: 0xb98a5e,
  woodDark: 0x8c6444,
  stone: 0xbdb4bb,
  stoneDark: 0xa198a6,
  trunk: 0xb08663,
  leafA: 0x8fd69a,
  leafB: 0x9bd67a,
  leafC: 0x74c4a0,
  blossom: 0xf7b7cf,
  // Traditional wooden houses: plank walls in warm wood tones under thatched roofs.
  walls: [0xc79d6e, 0xb88a5e, 0xd2ab7c, 0xc29469, 0xad8158, 0xcba373],
  roofs: [0xd9634a, 0x5fa8a0, 0xcf5a45, 0xe07a4f, 0x4f9aa6, 0xd4694c],
  thatchDark: 0xb88f4c,
  tents: [0xf3e6c8, 0xe9a27a, 0xe8c66a],
  flowers: [0xe8503a, 0x5b6fe0, 0xe8503a, 0xffffff, 0xffd75a],
  treeTrunk: 0x7c6b5c,
  villagers: [0xf6a6b2, 0xa6d8f6, 0xf9dc8b, 0xc3b1f2, 0xa8e3c0, 0xf7b98b],
  player: 0xf2785a,
  windowGlow: 0xffd68a,
  lantern: 0xffc97a,
  fire: 0xff9a4a,
};

// Day cycle. Time of day is a fraction in [0, 1), 0 = midnight.
export const DAY_LENGTH = 480;
export const START_TIME = 0.64;

// Player and camera
export const WALK_SPEED = 1.9;
export const RUN_SPEED = 3.9; // a child's run, not a sprinter's
export const HOP_VELOCITY = 5;
export const GRAVITY = 15;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_START = { x: 10, z: 14 };
export const MAX_DT = 0.05;
export const CAMERA = { distance: 6.2, minDistance: 4, maxDistance: 11, minPitch: 10, maxPitch: 60 }; // degrees

// Interaction
export const INTERACT_RANGE = 2.2;
export const INTERACT_CLOSE = 0.8;
export const INTERACT_CONE = 0.2;

// Villagers
export const VILLAGER_COUNT = 6;
export const VILLAGER_SPEED = 1.2;
export const VILLAGER_RADIUS = 0.35;
export const VILLAGER_PAUSE = [2, 6];
export const NUDGE_DISTANCE = 1.2;
export const NUDGE_TIME = 0.4;
export const NUDGE_COOLDOWN = 1.5;
export const BELL_HEAR_RANGE = 25;
export const BELL_LOOK_TIME = 2;
export const MIN_DRY_HEIGHT = 0.3;
