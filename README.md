# Plinko Selector

A giant Plinko board that picks outcomes from a list of options — live, on a website, so everyone
can watch the randomness happen. Built for drawing scoring-rule modifications for the
*A Clash of Units* fantasy league, but it takes any list.

**Live:** https://plinko.ttnelson.com/ (also https://mrnelson6.github.io/RandomSelector/)

## How a drop works

1. **The cannon** rides its rail to a random spot along the top, swings to a random angle and fires —
   hard. There is no ceiling, so the ball flies far above the board and arcs back down through a
   field of pinball bumpers before it reaches the pegs. With several balls the cannon roams to a new
   spot between shots.
2. **The +/− zones** a third of the way down decide the sign. Each option carries an increment
   (`Passing Yards +0.04`); falling through a `−` zone flips it to `Passing Yards −0.04`. So
   *N options = 2N outcomes*. The ball turns green or red to show its sign. The zone segments are
   re-rolled every drop.
3. **The category buckets** halfway down funnel the ball into one group — Passing, Rushing, Kicking,
   Team Defense, … — with walls down to the bins. Each bucket's width is proportional to how many
   options it holds; their order is shuffled every drop. The walls have a few openings, so a ball
   can occasionally slip into the neighbouring lane.
4. **The bins** at the bottom, one per option, shuffled every drop (within their bucket).

Sprinkled through the peg field (about 1 in 9 pegs, placed by the seed) are **special pegs**:

| Peg | Look | Effect |
|---|---|---|
| Super bouncy | pink with a pulsing halo | fires the ball away at high speed on contact, whatever speed it arrived with |
| Boulder | big grey disc | a wide deflector |
| Spinner | cyan rotating cross | bats the ball sideways |
| Flip peg | half green / half red `±` | inverts the ball's sign (only placed below the +/− band) |
| Teleporter | coloured dashed ring with a letter | pairs scale with board size (9 on the short board, 22 on the default); enter one, drop out of its partner (same colour + letter), anywhere on the board |

The category walls carry large round **bumps** on alternating rows — about a third of them are
super-bouncy **wall bumpers** that blast the ball back into the lane — and the pegs next to a wall
are pushed outward. Together with the openings this means a ball can neither slide down a wall nor
wedge between wall and peg, and there is no straight vertical channel anywhere in the lattice.

**Sound** is synthesised in the browser (no audio files): cannon, peg clicks, boings, the sign
chime (rising for +, falling for −), a whoosh entering a lane, and a fanfare at the end. The
🔊 button mutes it; browsers only allow audio after a click, so auto-dropped links are silent until
you press something.

The camera follows the ball; the **"Under the ball"** panel lists the seven bins directly beneath
it, with the sign applied once it's known. Drag to pan and scroll to zoom whenever you like.

## Settings (⚙ Options)

| Setting | What it does |
|---|---|
| Balls per drop | 1–10 balls fired in sequence from the same cannon position. Each gets its own sign and bin. |
| Board height | Number of peg rows: 36 (short, ~15 s) up to 180. Default is 90 (~30 s a drop). |
| +/− zones | Turn the sign band off to draw plain options. |
| Category buckets | Turn the mid-board buckets off for one flat shuffle. Needs categories in the list. |

Settings and custom lists are saved in your browser only. Share links carry the settings too.

## Fairness

All randomness (bin order, bucket order, zone signs, cannon position and shots) comes from a seeded
RNG, shown as the **seed** in the corner. "copy link" gives a URL that rebuilds the same board so
anyone can check it wasn't hand-picked. (The physics engine isn't guaranteed to be bit-identical
across devices, so the same seed reproduces the *board*, not necessarily the landing spot.)

- **Buckets off:** every `(option, sign)` pair has *exactly* a `1 / 2N` chance, because the bins
  are a uniform shuffle and the signs are a fair coin — no matter how centre-biased the ball's
  landing spots are.
- **Buckets on:** options inside a bucket are exactly equally likely. Across buckets, odds are
  proportional to bucket width (= option count) only as far as the ball's landing position is
  spread evenly over the board; with a random cannon position and a tall board it is close to
  even, but not mathematically exact. Turn buckets off when you need the strict guarantee.

Add `&autodrop=1` to a link to make the ball drop as soon as the page loads.

## Editing the options

The default list lives in [`options.js`](options.js) as `{ label, value, category }` entries:

```js
window.DEFAULT_OPTIONS = [
  { label: "Passing Yards", value: "0.04", category: "Passing" },
  { label: "Rushing TD",    value: "3",    category: "Rushing" },
  // value and category are optional
];
```

Commit and push and the site updates. In the Options panel the same list is shown one per line as
`Name +0.04 | Category`, and visitors can paste their own.

The default list was generated from `random_srm_pool.csv` (the options) and
`Appendix _A__ … Rules by Year.csv` (the section headers that became the categories).

## Tuning

Sizes, physics and timings are in [`js/config.js`](js/config.js): bin width, gravity,
bounciness, cannon speed/angle, bumper layout, zone segment sizes, where the zone and bucket rows
sit, and the defaults for the user settings.

## Running locally

It is a static site — open `index.html` directly, or serve the folder:

```sh
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

Pushing to `main` redeploys the site (Settings → Pages → Deploy from branch `main` / root).

## Project layout

```
index.html           page shell + HUD + PIP + panels
style.css
options.js           default option list (edit me)
vendor/matter.min.js Matter.js physics engine (vendored)
js/rng.js            seeded RNG + shuffle
js/config.js         tunables + default settings
js/layout.js         board geometry and per-run arrangement (pure math)
js/board.js          Matter.js bodies; pegs are only instantiated near the balls
js/camera.js         follow / zoom / manual pan
js/render.js         canvas renderer with viewport culling
js/game.js           run state machine: cannon, balls, signs, landing
js/ui.js             buttons, settings panel, PIP, results, seed links
js/main.js           fixed-timestep game loop
```
