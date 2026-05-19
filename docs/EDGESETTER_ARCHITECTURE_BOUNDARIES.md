# EdgeSetter Architecture Boundaries

## Executive summary

EdgeSetter is a sports intelligence product. Architecture boundaries should keep live signal generation, replay determinism, validator trust, source reliability, and monetizable edge delivery separate from experimental simulation work. Experimental infrastructure can remain as deterministic compatibility coverage, but it must not shape product APIs or user-facing terminology.

## Core sports intelligence runtime

This boundary contains systems that ingest sports facts, score betting and fantasy signals, calibrate confidence, settle outcomes, and deliver operationally useful intelligence.

Included systems:

- Live sports adapters and ingestion.
- Odds movement, injury, source, and settled outcome processing.
- Signal scoring, confidence calibration, CLV, and settlement.
- Live replay runtime execution and production orchestration.
- User-facing alert quality, freshness, and edge-ranking logic.

Rules:

- Runtime behavior must be deterministic when replayed from the same inputs.
- New APIs must use sports intelligence terms, not experimental simulation terms.
- Product metrics should connect directly to accuracy, speed, confidence calibration, CLV, alert quality, or retention.

## Validator intelligence infrastructure

This boundary contains systems that decide which validators and sources should influence sports intelligence outputs.

Included systems:

- Consensus validators and arbitration.
- Consensus coordination logic formerly named governance where compatibility requires it.
- Validator trust scoring, trust decay, trust recovery, and confidence recalibration.
- Historical calibration, replay memory, lineage, source weighting, and manipulation resistance.
- Validator cluster, validator cohort, specialization profile, validator retirement, and live runtime eligibility compatibility aliases.

Rules:

- Validator scoring must remain explainable from outcomes, CLV, source confirmation accuracy, injury reliability, convergence quality, or manipulation resistance.
- Compatibility aliases may wrap old names, but new work should prefer product-aligned names.
- Persistence may preserve legacy column names until a deterministic migration is designed.

## Experimental simulation systems

This boundary contains long-horizon simulations originally built with civilization, geopolitical, treaty, diplomacy, species, dynasty, empire, and cold-war terminology.

Included systems:

- Historical autonomous league simulation.
- Historical autonomous civilization simulation.
- Civilization meta-selection.
- Meta-civilization governance.

Rules:

- These systems are deprecated product-drift compatibility layers.
- No new routes should expose these names.
- Any retained behavior must translate into validator cluster stress testing, validator cohort reliability, specialization profile selection, source quarantine, manipulation resistance, or live runtime eligibility.
- Removal requires replacement product-named modules and validation parity.

## Boundary rules

- Core runtime may depend on validator intelligence infrastructure.
- Validator intelligence infrastructure may read deterministic historical simulation outputs only through product-aligned aliases.
- Experimental simulation systems must not import core live runtime modules for product decisions.
- User-facing routes must not expose civilization, geopolitical, treaty, diplomacy, species, dynasty, empire, sanction, or cold-war terms.
- Validation scripts may keep legacy names only as compatibility coverage.

## Import and route policy

New code should import product-aligned aliases from `server/pipeline/replay-product-alignment-aliases.ts` when it needs compatibility with experimental snapshots.

Allowed public API terms:

- validator cluster
- validator cohort
- specialization profile
- consensus coordination
- validator retirement
- live runtime eligibility
- specialization adjustment
- long-horizon signal reliability
- manipulation resistance

Legacy API terms remain allowed only in existing compatibility scripts and persisted replay fixtures.

## Naming and compatibility policy

Preferred translations:

| Legacy term | Product-aligned term |
| --- | --- |
| civilization | validator cluster |
| species | specialization profile |
| dynasty | validator cohort |
| governance | consensus coordination |
| extinction | validator retirement |
| promotion | live runtime eligibility |
| mutation | specialization adjustment |

Renames should be additive until deterministic migrations exist. Compatibility aliases must not alter serialization order, persisted values, or deterministic hashes.

## Validation expectations

Consolidation validation must verify:

- Boundary and remove-candidate docs exist.
- Required boundary sections exist.
- Experimental modules carry `@deprecated` annotations.
- Product-aligned compatibility aliases exist.
- Output is deterministic JSON.

## Migration path

1. Keep existing deterministic compatibility modules intact.
2. Add product-aligned aliases and new imports for future code.
3. Build replacement validator cluster and validator cohort modules around measurable sports intelligence outcomes.
4. Move route and dashboard surfaces to product-aligned names only.
5. Freeze legacy simulation outputs as compatibility fixtures.
6. Remove deprecated modules only after replacement validations prove parity for useful behavior.
