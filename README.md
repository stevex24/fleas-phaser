# Fleas — Phaser Port

A browser-based Phaser port of the original **Fleas** game/simulation
written in Greenfoot in 2014.

Original Greenfoot scenario:

https://www.greenfoot.org/scenarios/11467

## Current milestone: pre-physics version

This commit preserves the best working version before replacing the
original prototype movement with parabolic/Newtonian jumping.

The current movement deliberately uses simple deterministic grid-step
motion toward a target flea. This makes the simulation easy to inspect
and provides a reference implementation against which the later physics
version can be compared.

## How to play

1. A random population of fleas is generated.
2. Fleas have random sizes and non-overlapping initial positions.
3. Choose the flea you predict will be the **last flea standing**.
4. Press **JUMP**.
5. Each flea searches for the nearest larger available flea.
6. It travels toward that flea and lands visually above it.
7. The parasite consumes its host:
   - parasite bounding-box area increases;
   - host bounding-box area decreases by exactly the same amount.
8. Several feeding relationships may occur simultaneously, including
   chains of fleas feeding on other feeding fleas.
9. When only one flea remains, the game announces whether your
   prediction won.

## Geometry and conservation

For this version, the simulation treats each flea as having a square
bounding-box area.

If a parasite receives an area increment `dA`, its host loses exactly
`dA`.

Therefore total flea area is conserved throughout the round.

The visible side length is derived from area:

    side = sqrt(area)

The flea artwork is therefore a presentation layer over a simple
geometric simulation.

## Adaptive layout

Initial layout is calculated after the number and sizes of the fleas
are known.

The game:

- scales visual flea size according to population;
- places fleas in a central region;
- rejects initially overlapping bounding boxes;
- computes a safe visual scale from the total conserved area;
- reserves enough edge-to-edge vertical clearance for possible
  feeding stacks.

The goal is to keep parasites visibly above their hosts instead of
forcing later fleas behind earlier sprites or outside the playing field.

## Why preserve this version?

This version separates the game rules from the later physics upgrade.

It provides a known-good baseline for:

- target selection;
- random initialization;
- player prediction;
- area conservation;
- simultaneous feeding;
- stacked feeding relationships;
- elimination;
- win/loss detection;
- adaptive layout;
- sound effects.

The next major version will replace only the travel behavior with a
physical jumping trajectory while preserving these rules.

## Planned next steps

- Two-flea tutorial.
- Difficulty levels with increasing flea counts.
- Player advancement/unlocking.
- Parabolic/Newtonian jumping.
- Tune layout and scaling by difficulty level.
- Later visual/art improvements if useful.

## Technology

- JavaScript
- Phaser 3
- HTML5
- Original Greenfoot artwork and sound assets
