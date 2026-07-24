# Ontology — Technique strokes & footwork events

See `packages/contracts/src/ontology/strokes.ts` for the versioned source of truth.

## Technique Lab strokes

serve, forehand, backhand, smash, clear, drop, drive, net_shot, lift, block, defensive_return, jump_smash

Each stroke module id: `technique:<stroke>`

## Footwork

- Pure lab: `footwork:pure`
- Layer per stroke: `footwork:layer:<stroke>`

Events: split_step, first_step, chasse, crossover, lunge, hop, recovery_step, base_return

## Movement phases

ready → loading → backswing → acceleration → contact → follow_through → landing → recovery
