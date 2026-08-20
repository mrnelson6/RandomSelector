// Tunable sizes for the board. All distances are in world pixels.
window.CONFIG = {
  binWidth: 72,          // width of one bin; also the horizontal peg spacing
  rowHeight: 60,         // vertical distance between peg rows
  binDepth: 230,         // height of the bins at the bottom
  pegRadius: 6,
  ballRadius: 12,
  dividerWidth: 6,
  wallThickness: 60,
  categoryWallWidth: 6,

  // Launch area (above the first peg row)
  topPadding: 760,       // height of the launch area
  railY: 150,            // cannon rail
  barrelLength: 72,
  cannonMinSpeed: 9,
  cannonMaxSpeed: 13.5,
  cannonMaxAngle: 62,    // degrees either side of straight up
  aimSeconds: 1.6,       // carriage travel + aim time before the first shot
  shotInterval: 0.9,     // seconds between balls when dropping several
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

  // Physics
  gravity: 1.0,
  ballRestitution: 0.45,
  ballFriction: 0.02,
  ballFrictionAir: 0.006,

  // Peg windowing: only pegs within this many columns of a ball get physics bodies
  pegWindowCols: 16,

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
};
