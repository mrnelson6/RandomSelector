// Tunable sizes for the board. All distances are in world pixels.
window.CONFIG = {
  binWidth: 72,          // width of one bin; also the horizontal peg spacing
  pegRows: 36,           // rows of pegs above the bins
  rowHeight: 60,         // vertical distance between peg rows
  topPadding: 260,       // empty space above the first peg row (launch area)
  binDepth: 230,         // height of the bins at the bottom
  pegRadius: 6,
  ballRadius: 12,
  dividerWidth: 6,
  wallThickness: 60,

  zoneRow: 18,           // zone band sits between this peg row and the next
  zoneHeight: 70,
  zoneMinBins: 3,        // zone segment width range, in bins
  zoneMaxBins: 8,

  // Physics
  gravity: 1.0,
  ballRestitution: 0.45,
  ballFriction: 0.02,
  ballFrictionAir: 0.006,
  launchSpeedX: 6,       // max |initial horizontal velocity|

  // Peg windowing: only pegs within this many columns of the ball get physics bodies
  pegWindowCols: 24,

  // Landing detection
  restSpeed: 0.25,
  restFrames: 20,
  maxBinSeconds: 2.5,    // declare the result after this long in a bin even if still jiggling
  stuckSpeed: 0.05,
  stuckFrames: 75,
};
