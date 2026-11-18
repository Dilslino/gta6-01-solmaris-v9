# Solmaris — a coastal sunset open-world crime game

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?ref=5548afh3)
[![rank](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v9/rank.svg)](https://make.fun/bounty/gta6-01?ref=5548afh3)
[![reward](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v9/reward.svg)](https://make.fun/bounty/gta6-01?ref=5548afh3)

Solmaris is an original 3D open-world crime game set in a coastal island city at
sunset, built with three.js (vendored) and plain WebGL — no build step, no network
at runtime. Explore the city on foot, steal and drive cars, run six missions, dodge
the police, survive the police helicopter's searchlight, and shoot your way out.

Play it: serve `game/` with `node serve.ts` and open http://localhost:8080,
or run `MAKEFUN_OUTPUT_DIR=out node main.ts` to build the hand-in bundle.

## Controls

- **W A S D** — move / drive (arcade steering: full-speed U-turns work)
- **Mouse** — aim, **click / F** — shoot (aim up to ~77° to hit the helicopter)
- **E** — steal / enter / exit a car
- **Shift** — sprint on foot
- **M** — mute / unmute sound, **P** or **Esc** — pause
- **Enter / Space** — start, continue after WASTED

## Systems

- On foot (~6 m/s) and driving (~14 m/s) with a chase camera
- 6 missions: pickups, deliveries, a walkable downtown run, a dock shootout,
  and a helicopter takedown — cash rewards, HUD marker + distance
- Wanted level 1–3+: police cars chase and ram; at wanted 3 a police helicopter
  hunts you with an interactive searchlight — break line of sight (hide in the
  Parking Garage) and the SPOTTED meter drains back to zero
- WASTED costs $100; Continue restores your exact cash, position, wanted level
  and mission state from before you died
- Sunset lighting, ocean, beach, palm trees, traffic cars and pedestrians,
  synthesized WebAudio sound (engine, siren, gunshots, pickups) with a working
  mute toggle, HUD with minimap, health, cash and wanted stars

All names, art and sounds are original — no assets from GTA or any commercial game.

Entry for the [gta6-01 bounty](https://make.fun/bounty/gta6-01?ref=5548afh3).
