# EdgeSetter Product Alignment Audit

## Executive summary

EdgeSetter has a strong core: live sports ingestion, replay determinism, consensus validation, arbitration, validator trust, historical calibration, and observability all support the product mission. These systems improve signal accuracy, confidence calibration, source weighting, validator quality, replay accuracy, and autonomous operations.

The codebase has also accumulated a large amount of non-product abstraction around autonomous leagues, civilizations, meta-civilization governance, diplomacy, treaties, geopolitical systems, species, dynasties, empires, sanctions, and cold-war simulations. Some of the underlying concepts are useful when translated into sports-intelligence terms, especially validator cohort scoring, specialization profiles, manipulation resistance, long-horizon reliability, and live-runtime eligibility. The current naming and scope obscure product purpose and risk distracting the platform from monetizable edge delivery.

This audit recommends keeping the product-aligned replay and validator systems, simplifying or renaming the useful parts of simulation infrastructure, deprecating civilization/geopolitical layers behind boundaries, and removing only after replacements exist. No code deletion is recommended in this pass.

## KEEP systems

| Subsystem | Product relevance score | Reason |
| --- | ---: | --- |
| `server/pipeline/ingestion.ts`, adapters, store | 5 | Core live sports data collection and persistence. Directly supports signal speed and accuracy. |
| `server/pipeline/processor.ts`, `scorer.ts`, `calibration.ts`, `clv.ts`, `settlement.ts` | 5 | Converts sports events into scored signals and outcomes. Directly supports predictive advantage and confidence calibration. |
| Replay parity, archive, diff, verification, lineage, reconstruction | 5 | Preserves deterministic replay and historical correctness. Critical for trust, auditability, and regression protection. |
| Consensus validators and arbitration | 5 | Improves validator trust quality and adversarial resistance. |
| Replay validator trust infrastructure | 5 | Uses outcomes, CLV, source reliability, and consensus convergence to improve future validator weighting. |
| Live intelligence bridge and live runtime integration | 5 | Connects live sports facts to replay intelligence and validator scoring. |
| Production orchestration and survivability | 4 | Supports autonomous operations and recovery. Keep focused on runtime reliability. |
| Observability and replay intelligence APIs | 4 | Supports operations, debugging, and future dashboard workflows. |
| Historical replay calibration | 5 | Initializes trust priors from past sports behavior. Directly useful for accuracy and calibration. |
| Source reliability, injury reliability, odds movement scoring | 5 | Product-critical sources of edge quality. |

## SIMPLIFY systems

| Subsystem | Product relevance score | Recommendation |
| --- | ---: | --- |
| `replay-historical-simulation-runtime*` | 3 | Keep only as historical validator pretraining and stress-test scaffolding. Remove generalized “simulation runtime” breadth that does not map to signal quality. |
| `replay-historical-autonomous-league*` | 2 | Reduce to validator cohort tournament, specialization profile selection, and live eligibility scoring. |
| `replay-historical-autonomous-civilization*` | 1 | Preserve only recoverable ideas: validator cluster stress tests, manipulation resistance, cohort reliability, retirement/degradation, and live eligibility gates. |
| `replay-civilization-meta-selection*` | 2 | Convert to validator cluster selection and long-horizon cohort ranking. Keep scoring, ranking, eligibility, and lineage concepts. |
| `replay-meta-civilization-governance*` | 1 | Keep only consensus control policy evaluation, manipulation resistance, federation eligibility if translated to cluster eligibility. Remove geopolitical framing. |
| Numerous validation scripts for speculative layers | 2 | Consolidate into fewer product-named validations once renamed modules exist. |
| Generic self-healing and coordination mesh | 3 | Keep only runtime recovery behavior tied to live replay execution and alert delivery. |

## RENAME recommendations

| Current term/module | Product-aligned name |
| --- | --- |
| `civilization` | `validator-cluster` |
| `meta-civilization-governance` | `validator-cluster-consensus-policy` |
| `autonomous civilization runtime` | `validator-cluster-stress-runtime` |
| `autonomous intelligence league` | `validator-cohort-tournament` |
| `species` | `validator-specialization-profile` |
| `dynasty` | `long-horizon-validator-cohort` |
| `empire` | `cluster-coverage-footprint` |
| `treaty`, `alliance`, `diplomacy` | `cluster-cooperation`, `shared-source-agreement`, or remove if non-product |
| `cold-war`, `geopolitical`, `sanctions` | `manipulation-resistance`, `source-quarantine`, or remove |
| `extinction` | `validator-retirement` or `validator-degradation` |
| `promotion` | `live-runtime-eligibility` |
| `reputation` | `validator/source trust score` |
| `mutation` | `deterministic specialization adjustment` |
| `survivability` | `long-horizon signal reliability` |

## DEPRECATE recommendations

Deprecate behind boundaries, but do not delete yet:

- `server/pipeline/replay-historical-autonomous-civilization*`
- `server/pipeline/replay-civilization-meta-selection*`
- `server/pipeline/replay-meta-civilization-governance*`
- `server/scripts/validate-replay-historical-autonomous-civilization.ts`
- `server/scripts/validate-replay-civilization-meta-selection.ts`
- `server/scripts/validate-replay-meta-civilization-governance.ts`

Deprecation criteria:

- No production routes should depend on these names.
- No paid-user or alert workflow should reference civilization/geopolitical terminology.
- Replacement modules should expose product terms before these are removed.
- Validation can remain as compatibility coverage until replacements exist.

## REMOVE recommendations

No immediate deletion in this pass.

Future remove candidates:

- Treaty negotiation records with no source-quality or validator-consensus use.
- Cold-war simulation records with no manipulation-resistance output.
- Sanction/isolation systems unless rewritten as source quarantine or validator quarantine.
- Empire/geopolitical abstractions that do not affect validator weighting, alert ranking, or source trust.
- Civilization diplomacy state machines unless converted into cluster cooperation controls.

## Product relevance score for each major subsystem, 0-5

| Subsystem | Score |
| --- | ---: |
| Live feed ingestion and adapters | 5 |
| Signal processing and scoring | 5 |
| CLV and settlement | 5 |
| Replay archive/diff/verification/lineage | 5 |
| Replay consensus | 5 |
| Replay arbitration | 5 |
| Replay governance / consensus control logic | 4 |
| Validator trust evolution | 5 |
| Replay memory | 4 |
| Live replay runtime | 5 |
| Production orchestration | 4 |
| Replay observability | 4 |
| Live sports runtime integration | 5 |
| Historical replay calibration | 5 |
| Historical simulation runtime | 3 |
| Autonomous intelligence league | 2 |
| Autonomous civilization runtime | 1 |
| Civilization meta-selection | 2 |
| Meta-civilization governance | 1 |
| Replay intelligence dashboard/export APIs | 4 |
| Geopolitical/treaty/diplomacy abstractions | 0 |

## Risk assessment

- Product focus risk: High. Civilization and geopolitical terminology suggests the product is drifting away from sports intelligence.
- Maintenance risk: High. Many additive modules and validation scripts increase compile and cognitive load.
- Route exposure risk: Medium. Existing replay intelligence routes are product-relevant, but speculative modules should remain unexposed.
- User-value risk: High for civilization/geopolitical layers. Users pay for better sports edges, not generalized simulations.
- Technical debt risk: Medium. Deterministic patterns are consistent, but over-abstraction makes future product work slower.
- Deletion risk: Medium. Some speculative modules encode reusable scoring ideas, so remove only after product-named replacements exist.

## Recommended next 10 implementation priorities

1. Rename and consolidate validator trust, historical calibration, and live-runtime eligibility around sports intelligence terms.
2. Build a real validator cluster scoring module that replaces civilization meta-selection.
3. Build source manipulation resistance from real source outcomes, not geopolitical simulations.
4. Add route/API surfaces only for product dashboards: signal quality, validator trust, source reliability, replay accuracy.
5. Consolidate validation scripts into product domains: live ingestion, replay determinism, trust scoring, historical calibration, operations.
6. Add metrics linking validator changes to hit rate, CLV, alert precision, and user-facing confidence.
7. Create a source quarantine and validator degradation workflow from settled outcome evidence.
8. Add historical season backtest reports for MLB/NBA/NFL/CFB signal accuracy and CLV.
9. Add product-facing alert ranking validation for speed, freshness, confidence, and edge strength.
10. Deprecate speculative civilization/geopolitical modules after replacement modules pass validation.

## Files likely affected

Product-aligned keep/simplify areas:

- `server/pipeline/replay-consensus*`
- `server/pipeline/replay-arbitration*`
- `server/pipeline/replay-governance*`
- `server/pipeline/replay-validator-trust*`
- `server/pipeline/replay-live-intelligence-bridge*`
- `server/pipeline/replay-live-runtime*`
- `server/pipeline/replay-live-sports-runtime-integration*`
- `server/pipeline/replay-historical-calibration*`
- `server/pipeline/replay-historical-simulation-runtime*`
- `server/pipeline/routes.ts`
- `server/scripts/validate-replay-*.ts`

Product-drift areas:

- `server/pipeline/replay-historical-autonomous-league*`
- `server/pipeline/replay-historical-autonomous-civilization*`
- `server/pipeline/replay-civilization-meta-selection*`
- `server/pipeline/replay-meta-civilization-governance*`
- `server/scripts/validate-replay-historical-autonomous-league.ts`
- `server/scripts/validate-replay-historical-autonomous-civilization.ts`
- `server/scripts/validate-replay-civilization-meta-selection.ts`
- `server/scripts/validate-replay-meta-civilization-governance.ts`

## No-code-change cleanup plan

1. Adopt `docs/EDGESETTER_PRODUCT_ALIGNMENT_RULES.md` as the naming and architecture standard.
2. Mark civilization/geopolitical modules as experimental in documentation.
3. Prevent new routes from exposing civilization/geopolitical terminology.
4. Require every new replay module to include a product metric in its validation output.
5. Track risky drift terms with `server/scripts/validate-product-alignment-audit.ts`.
6. Use the translation map when writing tickets and PR descriptions.

## Code-change cleanup plan

1. Add replacement modules with product names before deleting old modules.
2. Replace `civilization meta-selection` with `validator-cluster-selection`.
3. Replace `meta-civilization governance` with `validator-cluster-consensus-policy`.
4. Replace `species evolution` with `validator-specialization-profile tracking`.
5. Replace `dynasty survivability` with `long-horizon validator cohort reliability`.
6. Replace `sanctions` with `source/validator quarantine`.
7. Move any useful scoring formulas into product-named modules.
8. Keep deterministic hashes and persistence patterns, but simplify record counts and validation scope.
9. Remove unused speculative tables only after route and validation references are gone.
10. Run full validation after each module replacement.
