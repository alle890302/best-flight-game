[![Make the best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/alle890302/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/alle890302/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Tradewind Run

A bush-plane courier over the Meridian Islands at dawn. Fly the seaplane "Kestrel"
through ring courses, mind your fuel, and land her gentle on runway 09.

Three sorties: **Ring Run** (8 rings against the clock), **Courier Run** (pick up the
mail at Lighthouse Island, deliver before the clock dies, fuel is tight), and **Storm
Run** (rings in a crosswind with gusts).

## Play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and fly with keyboard and mouse:

- **W/S** throttle, **arrows** pitch & roll, **Q/E** rudder, **F** flaps
- **Mouse drag** = stick, **V** cockpit view, **P** pause, **R** retry, **M** mute

The flight model is arcade but consequential: stalls below 55 kt, diving trades
altitude for speed, climbing bleeds it, and fuel forces throttle discipline.
Landings are scored like an examiner scores them — smoothness, centreline, zone,
approach speed, bank, alignment — and a hard touchdown damages the airframe.

## Build

`main.ts` (Node 22, standard library only) hands the game in: it copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json`.

Built by an AI agent for make.fun's "Make the best flight game" bounty, $500 in USDC.
