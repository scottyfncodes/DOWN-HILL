# Downhill

**You choose the line. Gravity tells the story.**

A hands-off downhill longboard prototype from [HaveAnApp](https://haveanapp.com). One handcrafted hill, Gravity Hill, set as a diorama on a walnut plinth. Drag left or right to set where the rider starts, press **Launch**, and watch. There is no steering after launch: the line you chose either finishes or it doesn't.

Gravity Hill has three routes: the Table (a long ramp over a gap) in the middle, a banked turf wall on the left, and the Kicker (a short steep ramp over a boulder row into a tyre wall) on the right.

Keyboard: ← → move the line (Shift for fine steps), Space or Enter launches (and skips the preview), R retries, M toggles sound.

Downhill started life as a prototype inside [DEAD CENTER](https://github.com/scottyfncodes/dead-center) and shares its design language (linen, walnut, brass, Fraunces and IBM Plex Mono). It now lives here on its own.

## Develop

```sh
npm install
npm run dev              # local server
npm run check            # typecheck, unit tests, production build
npm run sweep -- 0.1     # what happens from every start line, in 0.1 steps
npm run preview          # serve the production build on :4173
npm run e2e -- http://localhost:4173   # play it in Chromium (emulated iPhone, desktop, landscape)
```

## How it is built

| File | What it does |
|---|---|
| `src/course.ts` | Gravity Hill as data plus a height function: three lanes, the Table, the gap, the Kicker, the boulder row, the banked wall, the tyre wall, pines, rocks and the finish gate. |
| `src/sim.ts` | Deterministic 240 Hz rider physics, computed in full at launch and then played back, so frame rate or a slow device never changes an outcome. The board rolls along its heading and side-slope gravity turns it (a carve) instead of sliding it like a marble; lips launch it, landings are absorbed or crash. |
| `src/rider.ts` | The procedurally posed rider and the crash tumble. |
| `src/world.ts` | The diorama: terrain, features, scenery and the plinth. |
| `src/main.ts` | Course preview (skippable), chase camera, input, the line readout, history pegs, previous-run trail, results and retry. |
| `src/sound.ts` | Web Audio synthesis: wheel roar, pops, landings, crashes. No audio files. |
| `src/base.css`, `src/downhill.css` | Design tokens and the page. |
| `src/analytics/pulse.ts` | HaveAnApp Pulse (`data-app="downhill"`): page views plus `game_start` and `game_complete`. No coordinates or personal data. |

`tests/sim.test.ts` checks determinism, that each route has a finishing line, and that different lines produce different outcomes, so a physics change that breaks the hill fails the build.

Made by HaveAnApp.
