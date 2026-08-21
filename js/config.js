// Tunable sizes for the board. All distances are in world pixels.
window.CONFIG = {
  binWidth: 72,          // width of one bin; also the horizontal peg spacing
  rowHeight: 60,         // vertical distance between peg rows
  binDepth: 500,         // height of the bins at the bottom (long enough for the longest label)
  pegRadius: 8,
  ballRadius: 14,
  // With these radii a falling ball cannot slip straight through the staggered
  // lattice (8 + 14 > half the peg spacing 36/2) and cannot wedge between
  // neighbouring pegs (sum of radii x2 < peg-to-peg distance 70).
  dividerWidth: 6,
  wallThickness: 60,
  categoryWallWidth: 6,
  wallBumpRadius: 28,    // big round bumps on the category walls: close the corridor beside the wall
  wallBouncyRadius: 22,  // some wall bumps are super-bouncy "wall bumpers" instead
  wallBouncyFraction: 0.35,
  wallPegShift: 52,      // offset-row pegs next to a wall move out to this distance from it
  wallGapRows: 2,        // height of an opening in a category wall, in peg rows
  wallGapEvery: [5, 10], // rows between openings (random in this range)

  // Special pegs sprinkled across the board (seeded per run). This is the pick
  // probability per peg; the no-neighbours rule discards some, so the realised
  // density is roughly 0.4x this (0.28 -> about 11% of pegs are special).
  specialPegFraction: 0.28,
  specials: {
    bouncy:  { weight: 0.4, radius: 10, restitution: 1.6, kick: 32 }, // fires the ball away at `kick` px/step on contact
    big:     { weight: 0.25, radius: 20 },                    // boulder
    spinner: { weight: 0.15, arm: 24, thickness: 6, speed: 2.6 }, // rotating cross, rad/s
    flip:    { weight: 0.2, radius: 11 },                     // inverts the ball's +/- sign (only below the zone band)
  },
  // Teleporter pairs (portals), placed below the zone band; touching one drops you out of its partner.
  // The count scales with board area: pairs = pegs / 1000 * teleportPairsPer1000Pegs (clamped).
  teleportPairsPer1000Pegs: 1.6,
  teleportMinPairs: 4,
  teleportMaxPairs: 24,
  teleportRadius: 15,
  teleportMinBinsApart: 10,
  teleportCooldown: 0.7,  // seconds before the same ball can teleport again

  // Launch area (above the first peg row)
  topPadding: 760,       // height of the launch area
  railY: 150,            // cannon rail
  barrelLength: 72,
  cannonMinSpeed: 22,
  cannonMaxSpeed: 36,
  cannonMaxAngle: 62,    // degrees either side of straight up
  aimSeconds: 1.6,       // carriage travel + aim time before the first shot
  shotInterval: 1.3,     // seconds between balls when dropping several (the cannon moves between shots)
  shotIntervalMin: 0.45, // pacing tightens as the ball count grows, down to this
  maxBalls: 40,
  cannonRoamMinBins: 20, // between shots the cannon moves at least this far (in bins) to a new random spot
  bumperRows: [400, 560],
  bumperSpacingBins: 5,
  bumperRadius: 26,
  bumperRestitution: 0.95,

  // Where the special rows sit, as a fraction of the peg rows
  zoneRowFrac: 0.30,     // +/- zone band
  categoryRowFrac: 0.55, // category buckets start here; walls run down to the bins
  zoneHeight: 70,
  zoneMinBins: 3,        // zone segment width range, in bins
  zoneMaxBins: 8,

  // Pooled groups: one bin with an open bottom and a mini board underneath
  subChuteH: 60,          // drop from the main floor to the mini board's ceiling
  subFirstRowGap: 44,     // ceiling to first mini-board peg row
  subBinDepth: 420,       // mini-board bin depth (labels)
  subLabelFont: 15,

  // Physics
  substeps: 3,           // physics sub-steps per 60 Hz frame (fast balls must not skip through pegs)
  gravity: 1.0,
  ballRestitution: 0.45,
  ballFriction: 0.02,
  ballFrictionAir: 0.006,

  // Peg windowing: only pegs within this many columns AND rows of a ball get
  // physics bodies. A ball moves < 2 cells per frame, so a small window is safe
  // and keeps the body count tiny no matter how many balls are in flight.
  pegWindowCols: 4,
  pegWindowRows: 4,

  // Landing detection
  restSpeed: 0.25,
  restFrames: 20,
  maxBinSeconds: 2.5,    // declare the result after this long in a bin even if still jiggling
  stuckSpeed: 0.05,
  stuckFrames: 75,
};

// User-adjustable settings (Options panel). Persisted in localStorage and share links.
window.DEFAULT_SETTINGS = {
  balls: 1,              // balls per drop (1-10)
  rows: 90,              // peg rows = board height
  signs: true,           // +/- zone band on/off
  categories: true,      // category buckets on/off (needs categories in the data)
  pool: true,            // pool grouped options (e.g. Points Allowed ranges) into one bin + mini board
};
