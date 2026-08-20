# Plinko Selector

A giant Plinko board that picks one outcome from a list of options — live, on a
website, so everyone can watch the randomness happen.

- Every option gets its own bin at the bottom of the board. **Bins are shuffled before every drop.**
- The ball is launched from a **random spot** along the top.
- Halfway down there is a row of **+ / − zones** (random sign per segment, re-rolled every drop).
  Whichever zone the ball falls through decides the sign of the result, so
  **N options = 2N outcomes** (e.g. 150 options → 300 outcomes).
- The camera follows the ball; drag to pan and scroll to zoom whenever you want a closer look.

## Why it's fair

The bin order and the zone signs are both drawn from a uniform random generator for each run.
Because no step ever looks at *which* option sits where, every `(option, sign)` pair has exactly
a `1 / 2N` chance — no matter how center-biased the ball's landing spots are.

Each run has a **seed** shown in the corner. "copy link" gives a URL (`?seed=…`) that rebuilds the
exact same board (same shuffle, same zones, same launch point) so anyone can check that it was not
hand-picked. The physics engine is not guaranteed to be bit-identical across devices, so the same
seed reproduces the *board*, not necessarily the landing spot.

Add `&autodrop=1` to a link to make the ball drop as soon as the page loads.

## Editing the options

The default list lives in [`options.js`](options.js). Replace the placeholder with your own:

```js
window.DEFAULT_OPTIONS = [
  "Tacos",
  "Sushi",
  "Pizza",
  // …one string per option
];
```

Commit and push and the site updates. Visitors can also paste their own list in the **Options**
panel; that list is stored only in their browser (`localStorage`) and "Reset to defaults" brings
back `options.js`.

## Tuning

Sizes, physics and timings are in [`js/config.js`](js/config.js): bin width, number of peg rows,
gravity, bounciness, zone segment sizes, etc. Fewer `pegRows` or higher `gravity` makes a faster drop.

## Running locally

It is a static site — open `index.html` directly, or serve the folder:

```sh
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, save.
4. After a minute the site is live at `https://<user>.github.io/<repo>/`.

## Project layout

```
index.html           page shell + HUD + panels
style.css
options.js           default option list (edit me)
vendor/matter.min.js Matter.js physics engine (vendored)
js/rng.js            seeded RNG + shuffle
js/config.js         tunables
js/layout.js         board geometry (pure math)
js/board.js          Matter.js bodies; pegs are only instantiated near the ball
js/camera.js         follow / zoom / manual pan
js/render.js         canvas renderer with viewport culling
js/game.js           run state machine + landing/sign detection
js/ui.js             buttons, settings panel, seed links
js/main.js           fixed-timestep game loop
```
