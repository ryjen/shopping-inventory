# JEPA-Style Prediction for Stock Estimates: Feasibility Gate

**Status:** Deferred research / no implementation approved  
**Tracking:** [#43](https://github.com/ryjen/shopping-inventory/issues/43)

## Executive decision

Do **not** add a JEPA training stack, V-JEPA inference service, stock-prediction weights or visual pantry-monitoring pipeline to Shopping Inventory today. The current evidence establishes purchases, not ongoing physical possession or consumption. A sophisticated latent-prediction objective does not repair missing outcome labels.

Reconsider this decision only when the project can independently measure stock/consumption, and simpler forecasting baselines demonstrably fail on a practical decision.

## What JEPA would and would not mean here

A Joint Embedding Predictive Architecture (JEPA) learns representations by predicting latent features of withheld or future observations rather than reconstructing every input. Meta's I-JEPA/V-JEPA research is an architectural family, not a general grocery forecasting service.

- **V-JEPA / V-JEPA 2 / 2.1**: video/image representation learning and temporal predictive features. The released checkpoints are not trained to predict household item depletion from purchase receipts.
- **Hypothetical tabular/temporal JEPA-style model**: could learn embeddings of household event windows and predict held-out or later latent representations, but would still require a separately validated downstream stock target and calibration.
- **Simple supervised hazard/stock models**: likely cheaper and easier to validate when data is scarce; benchmark them before introducing representation learning.

JEPA's latent-prediction objective is not itself a probability of an item being on hand. Translating a representation into a meaningful inventory decision requires labeled evaluation and a task-specific head or decision rule. External research benchmark gains must not be treated as evidence on this product's domain.

## Evidence and missing target

The current [stock heuristics](../specs/inventory-decay-heuristics.md) consider purchase recency, quantities, perishability and cadence, and intentionally emit coarse `none`, `low`, `available`, `stocked` or `unknown`.

A receipt can establish that a synthetic 1 kg package was bought, but not whether it was shared, consumed immediately, frozen, discarded, gifted or still in storage. Labeling current stock by applying the existing heuristics would only train a model to imitate those heuristics, not improve ground truth.

Potential **independent** observations:
- explicit stock confirmation at a timestamp with a known item/quantity granularity;
- consumption, disposal/spoilage or use events where recorded;
- corrections to a prior estimated stock state;
- contextual storage state only when explicitly supplied and authorized.

Absence of a confirmation is **not** evidence of zero stock; missing labels are not negative examples. Gaps are likely non-random and must be treated as censoring/selection bias.

## Preconditions (all required before a prototype)

1. State a concrete utility-driven prediction target, e.g. `P(stock_low_or_none at next planned shopping check)`, with the horizon and acceptable error costs.
2. Collect sufficient independently confirmed outcomes across time and relevant product categories; record observation rate, missingness and consent/privacy posture.
3. Demonstrate that current deterministic category/cadence estimates are causing consequential, measurable errors.
4. Define practical thresholds for improvement in stock-out avoidance, excess purchasing, review friction and compute/maintenance costs.
5. Confirm the private data processing/storage boundary and forbid public Git, hosted benchmark uploads and unapproved downstream model transfer.

If these preconditions are not met, leave #43 research-only or close as not currently actionable.

## Recommended validation hierarchy

| Order | Comparator | Reason |
| --- | --- | --- |
| 0 | Current category-decay / purchase cadence heuristic | Product baseline; transparent fallback |
| 1 | Per-item survival/hazard model with censored observations | Matches depletion-time interpretation |
| 2 | Small regularized tabular or time-series predictor | Handles useful interactions without heavy infrastructure |
| 3 | Temporal latent-prediction / JEPA-inspired encoder plus calibrated head | Investigate only if enough sequential observations exist |

Use chronological train/validation/test splits and rolling-origin evaluation. Keep observations from the future out of features and normalization. Where multiple households are ever available, report cross-household generalization separately; never infer it from a single household. Evaluate cold-start items and changes in shopping habits.

The system's action metric matters more than reconstruction or representation loss: evaluate calibrated stock-low probabilities, stock-out recall, false replenishment/overbuy rate, abstention/unknown coverage, drift, latency and maintenance burden. Compare against a last-observation/recency baseline to avoid apparent gains caused by temporal leakage.

## Suggested data contract for future research (not implemented)

A private study could represent each observation as a tuple:

```text
(observation_time, canonical_item_id, observed_stock_state,
 observation_source, observation_confidence, scope)
```

Link it to earlier **authoritative** acquisitions without mutating them. Do not promote estimates, synthetic labels or model predictions into observed stock. Track provenance and distinct observation-vs-inference types. Derived predictions must remain recomputable and advisory; explicit manual overrides still take priority.

Any future training or evaluation data is private. New persisted fields or services require a separate migration/ADR and threat model; this document authorizes none.

## Security, governance, and cost risks

- Model learning or exports can reveal consumption, household routines, health-adjacent purchases or occupancy patterns.
- Time leakage, feedback loops (predictions influencing later shopping), sparse labels and unobserved use can produce convincingly wrong confidence.
- Cameras/video would introduce a qualitatively different surveillance/privacy boundary. They are not proposed.
- GPU-heavy V-JEPA checkpoints introduce nontrivial inference and deployment maintenance and have no established transfer benefit for tabular purchase streams.
- A predictive service must not alter Purchase authority, review events, duplicate disposition, or stock overrides. Unknown must remain an acceptable outcome.

## Decision checkpoint

Produce a short feasibility memo only after prerequisites are satisfied:

1. inventory observations and missingness audit;
2. baselines and out-of-time evaluation results;
3. counterfactual utility and model calibration analysis;
4. JEPA-style experiment if justified, otherwise explicit rejection;
5. operational/security comparison and a separate proposed production issue only if value is demonstrated.

No model training, artifact download, external data egress, CI GPU job or feature flag is required now.

## Related work

- [Inventory decay heuristics](../specs/inventory-decay-heuristics.md)
- [Recommendation architecture](../specs/recommendation-engine.md)
- [ADR-0006 private substrate](../decisions/ADR-0006-public-code-private-cloudflare-substrate.md)
- [ADR-0007 advisory semantic decisions](../decisions/ADR-0007-advisory-semantic-decision-boundary.md)
- Issues [#24](https://github.com/ryjen/shopping-inventory/issues/24), [#25](https://github.com/ryjen/shopping-inventory/issues/25), and [#43](https://github.com/ryjen/shopping-inventory/issues/43).

## Research references

- Meta FAIR V-JEPA 2 / 2.1 official implementation and release details: https://github.com/facebookresearch/vjepa2
- Original Meta V-JEPA implementation: https://github.com/facebookresearch/jepa
