# Downhill

**You choose the line. Gravity tells the story.**

A hands-off downhill longboard prototype from [HaveAnApp](https://haveanapp.com). Six handcrafted hills, each set as a diorama on a walnut plinth. Drag left or right to set where the rider starts, press **Launch**, and watch. There is no steering after launch: the line you chose either finishes or it doesn't.

| Hill | Length | A run | Lines that finish | What it asks |
|---|---|---|---|---|
| Gravity Hill | 156 m | 13 s | ~30% | Three routes: the Table over the gap, the banked wall, the Kicker and the tyre wall. |
| Roller Hill | 236 m | 20 s | ~30% | Mud slows you; rollers throw fast riders into the air; a narrow plank, a table or the step over the ditch. |
| Pinball Wood | 318 m | 24 s | ~25% | Slalom berms and a chicane decide which of three ways over the creek you take; the gate is off-centre. |
| Sheep Meadow | 400 m | 31 s | ~11% | Sheep cross on a fixed timetable: where you are *and when* both matter. |
| The Quarry | 470 m | 37 s | ~9% | Gap after gap, a bank shot, a step-down, a double and a rock garden. |
| The Long Way Down | 560 m | 44 s | ~5% | Everything, end to end. |

Each hill opens when the one before it is finished. Later hills are true to gravity: a crest taken fast lifts the board (Gravity Hill only lets go at sheer lips, exactly as it always has).

Reading a run is the game: the last three runs stay on the hill as trails, each ending in a red cross (where it went wrong) or a brass ring (the gate); the result card shows how far down the run got, the stretch of hill it stopped at, and your furthest so far; **Watch again** replays it; playback can run at 2× or 4×; **Survey** (the eye) flies the hill again; and the ‹ › buttons beside the line nudge it by 0.02 for the narrow lines on the later hills.

Keyboard: ← → move the line (Shift for 0.02 steps), Space or Enter launches (and skips the survey), F changes playback speed, R retries, W watches again, V surveys the hill, [ ] change hill, M toggles sound.

Downhill started life as a prototype inside [DEAD CENTER](https://github.com/scottyfncodes/dead-center) and shares its design language (linen, walnut, brass, Fraunces and IBM Plex Mono). It now lives here on its own.

## Develop

```sh
npm install
npm run dev              # local server
npm run check            # typecheck, unit tests, production build
npm run sweep -- 0.1 rollers   # what happens from every start line on a hill, in 0.1 steps
npx tsx tools/killers.ts quarry # what ends the runs on a hill, and where
npx tsx tools/at.ts meadow 0.2 100,200   # where every line is, and how fast, at given distances
npx tsx tools/trace.ts longway 3.2      # one run, metre by metre
npm run preview          # serve the production build on :4173
npm run e2e -- http://localhost:4173   # play it in Chromium (emulated iPhone, desktop, landscape)
```

## How it is built

| File | What it does |
|---|---|
| `src/course.ts` | The hill model and its height function (ridges, banks, rollers, ramps, pits with plank bridges, mud, obstacles and sheep), with Gravity Hill as data. One hill is active at a time (`useHill`). |
| `src/hills.ts` | The other five hills, as data. |
| `src/sim.ts` | Deterministic 240 Hz rider physics, computed in full at launch and then played back, so frame rate or a slow device never changes an outcome. The board rolls along its heading and side-slope gravity turns it (a carve) instead of sliding it like a marble; lips launch it, landings are absorbed or crash. |
| `src/rider.ts` | The procedurally posed rider and the crash tumble. |
| `src/world.ts` | The diorama: terrain, features, plank bridges, sheep, signposts, scenery and the plinth, rebuilt per hill. |
| `src/main.ts` | Hill picker and unlocks, survey flyover, chase camera, input and nudges, the run readout, history pegs, run trails, the run report, replay and retry. Saves per hill; Gravity Hill keeps its original save keys. |
| `src/sound.ts` | Web Audio synthesis: wheel roar, pops, landings, crashes. No audio files. |
| `src/base.css`, `src/downhill.css` | Design tokens and the page. |
| `src/analytics/pulse.ts` | HaveAnApp Pulse (`data-app="downhill"`): page views plus `game_start` and `game_complete`. No coordinates or personal data. |

`tests/sim.test.ts` checks determinism, that each route on Gravity Hill has a finishing line, and that different lines produce different outcomes. `tests/hills.test.ts` sweeps every hill at 0.02 steps: each must be finishable on purpose (a window at least three fine steps wide), finish rates must stay between 3% and 50%, each hill must be longer and take longer than the last, and the last three must get harder to finish. A change that breaks a hill fails the build.

Made by HaveAnApp.

## Assets

The icons (`public/icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) and the share image (`public/og.jpg`) are original HaveAnApp artwork, all rights reserved. Everything else on screen (the hills, rider, sheep, signs and sounds) is generated in code at runtime.
