# Downhill

**You choose the line. Gravity tells the story.**

A hands-off downhill longboard prototype from [HaveAnApp](https://haveanapp.com). Six handcrafted hills, each set as a diorama on a walnut plinth. Drag left or right to set where the rider starts, press **Launch**, and watch. There is no steering after launch: the line you chose either finishes or it doesn't.

Each hill opens when the one before it is finished. From Roller Hill on, there is a second choice besides the line: the **stance** for the whole run. **Tuck** cuts the air and is fastest, **Cruise** is the classic stance, **Tall** catches the air and is slowest. Speed decides whether a gap is cleared or a lip is slammed, when you reach a sheep, and how far a bank throws you, so the line and the stance are read together. Gravity Hill stays line only, exactly as it has always been.

| Hill | Length | A run | Finishing (line × stance) | What it asks |
|---|---|---|---|---|
| Gravity Hill | 156 m | 13 s | 31% (line only) | Three routes: the Table over the gap, the banked wall, the Kicker and the tyre wall. |
| Roller Hill | 236 m | 18–25 s | 20% | Three lanes: only a tucked rider clears the centre table; cruise takes the step after the mud; tall walks the plank. |
| Pinball Wood | 318 m | ~24 s | 11% | One bank throws you across the hill, further the faster you go; three ways over the creek (a tuck-only kicker, two planks); an off-centre gate. |
| Sheep Meadow | 400 m | ~31 s | 8% | An open meadow (your line keeps its place) where sheep cross on fixed timetables: the stance decides when you arrive. |
| The Quarry | 470 m | ~37 s | 7.5% | Three hedged lanes and four gaps; each lane wants a different speed: too slow falls short, too fast slams the next lip. |
| The Long Way Down | 560 m | ~44 s | 6% | Everything, end to end. |

Later hills are true to gravity: a crest taken fast lifts the board (Gravity Hill only lets go at sheer lips).

**Reading a run is the game.** The result card says where the run stopped and *why*, with numbers measured from the run: "Came down 0.7 m short of the far side of The Plank, taking off at 46 km/h", "Reached the sheep 0.4 s too early", "Reached The Creek 0.8 m to the right of the Kicker". It then says what to try. That advice is checked, not guessed: a stance is only suggested if, ridden from the same line, it gets further, and a direction for the line is only given if moving the line that way (by a little and by more) moves the path the right way at that spot. Where a bank turns things round, it says so ("nudge the line right (the hill turns it round)"). Tests hold the advice to that: a suggested stance always gets further, and following the line advice gets further in over three quarters of cases.

The last three runs stay on the hill as trails (red cross where it went wrong, brass ring at the gate), each remembered with its stance; **Watch again** replays a run; playback runs at 1×, 2× or 4×; **Survey** (the eye) flies the hill; and the ‹ › buttons nudge the line by 0.02.

Keyboard: ← → move the line (Shift for 0.02 steps), ↑ ↓ change the stance, Space or Enter launches (and skips the survey), F changes playback speed, R retries, W watches again, V surveys the hill, [ ] change hill, M toggles sound.

Downhill started life as a prototype inside [DEAD CENTER](https://github.com/scottyfncodes/dead-center) and shares its design language (linen, walnut, brass, Fraunces and IBM Plex Mono). It now lives here on its own.

## Develop

```sh
npm install
npm run dev              # local server
npm run check            # typecheck, unit tests, production build
npm run sweep -- 0.1 rollers   # what happens from every start line on a hill, in 0.1 steps
npx tsx tools/killers.ts quarry # what ends the runs on a hill, and where
npx tsx tools/at.ts meadow 0.2 100,200   # where every line is, and how fast, at given distances
npx tsx tools/trace.ts longway 3.2      # one run, metre by metre (STANCE=tuck|cruise|tall for any tool)
npx tsx tools/map.ts quarry             # every line under every stance, and how smooth the outcomes are
npx tsx tools/curve.ts                  # the difficulty curve across all six hills
npx tsx tools/why.ts meadow tuck        # the run report's reading for a spread of lines
npm run preview          # serve the production build on :4173
npm run e2e -- http://localhost:4173   # play it in Chromium (emulated iPhone, desktop, landscape)
```

## How it is built

| File | What it does |
|---|---|
| `src/course.ts` | The hill model and its height function (ridges, banks, rollers, ramps, pits with plank bridges, mud, obstacles and sheep), with Gravity Hill as data. One hill is active at a time (`useHill`). |
| `src/hills.ts` | The other five hills, as data. |
| `src/analysis.ts` | The run report's reading: why a run ended and what to try, checked against the simulation. |
| `src/sim.ts` | Deterministic 240 Hz rider physics, computed in full at launch and then played back, so frame rate or a slow device never changes an outcome. The board rolls along its heading and side-slope gravity turns it (a carve) instead of sliding it like a marble; lips launch it, landings are absorbed or crash. |
| `src/rider.ts` | The procedurally posed rider and the crash tumble. |
| `src/world.ts` | The diorama: terrain, features, plank bridges, sheep, signposts, scenery and the plinth, rebuilt per hill. |
| `src/main.ts` | Hill picker and unlocks, survey flyover, chase camera, input and nudges, the run readout, history pegs, run trails, the run report, replay and retry. Saves per hill; Gravity Hill keeps its original save keys. |
| `src/sound.ts` | Web Audio synthesis: wheel roar, pops, landings, crashes. No audio files. |
| `src/base.css`, `src/downhill.css` | Design tokens and the page. |
| `src/analytics/pulse.ts` | HaveAnApp Pulse (`data-app="downhill"`): page views plus `game_start` and `game_complete`. No coordinates or personal data. |

`tests/sim.test.ts` checks determinism, that each route on Gravity Hill has a finishing line, and that different lines produce different outcomes. `tests/hills.test.ts` sweeps every hill at 0.02 steps: each must be finishable on purpose (a window at least three fine steps wide), finish rates must stay between 3% and 50%, every stance on offer must have a real window, the outcome may change only a few dozen times across the line (nearby lines behave alike), and each hill must be longer, slower and harder to finish than the one before. The run report is tested for honesty too. A change that breaks a hill fails the build.

Made by HaveAnApp.

## Assets

The icons (`public/icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) and the share image (`public/og.jpg`) are original HaveAnApp artwork, all rights reserved. Everything else on screen (the hills, rider, sheep, signs and sounds) is generated in code at runtime.
