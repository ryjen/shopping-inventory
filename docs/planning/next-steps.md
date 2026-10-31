# Next Steps

The repository has completed the architecture, provenance, validation, exact-evidence identity, conservative transaction duplicate/reprocessing, and repository-side security hardening (#16, closed 2026-10-13). **#18 private Cloudflare operational readiness is the critical release blocker.** The connected account has no Shopping Inventory-specific D1/R2 resources as of 2026-10-30. The current private Google Drive/Sheets workspace is manual staging, not the deployed canonical service. Follow [the operator release gate](../runbooks/private-cloudflare-release.md); do not claim the product deployed until the live negative/positive, recovery and authorization gates pass. Historical GitHub PR/commit references still require private GitHub Support follow-up under #10.

## Completed foundation

Merged repository work provides:

- public-code/private-data enforcement and incident remediation;
- authenticated Worker + private R2 evidence storage;
- structured D1 receipt-extraction staging;
- executable JSON Schema contracts for receipt → purchase;
- D1/SQLite item/approval/immutability and supersession invariants;
- append-only actor-attributed review/audit semantics (#14);
- deterministic complete repository validation, relative-link/fixture gates, and local `npm run validate` (#8);
- exact byte-level receipt evidence identity with race-safe R2/D1 idempotency (#13);
- conservative transaction-fingerprint collisions with append-only `distinct` / `confirmed_duplicate` review;
- promotion blocking for unresolved/confirmed duplicates;
- mandatory Purchase supersession when normalization reprocesses the same raw row;
- deterministic synthetic receipt → review → purchase → stock → budget → recommendation acceptance coverage.

These are implementation contracts, not remaining planning tasks.

## Completed P1 repository security track — #16 (closed 2026-10-13)

Outcome:

- public privacy guard covers remaining prohibited personal-data classes with bounded false positives;
- required dependency installs are reproducible from committed lock/version evidence;
- the n8n CLI smoke test uses a governed/pinned version rather than latest global install;
- dependency/secret scanning and update posture are explicit;
- integration OAuth/credential lifecycle is documented;
- private vulnerability reporting and accidental-disclosure response are complete.

Keep the independent n8n import smoke as evidence; improve its reproducibility/latency rather than deleting it.

## P1 operational private-environment track — #18

This may proceed independently where private Cloudflare credentials/resources are available.

Outcome:

- isolated private development/production D1 and R2 resources;
- deployed authenticated Worker;
- one real receipt traverses the private path without Git/Sheets/public intermediates;
- retention/deletion, deterministic export/restore, credential rotation, abuse/rate controls, and quota/cost monitoring are established.

Repository CI remains synthetic and credential-free.

## P2 evaluation expansion — #4

After the current integrity/security contracts are stable:

- add normalization/classification edge cases;
- encode exact/likely/distinct duplicate cases against the accepted duplicate policy;
- expand review-routing, stock-decay, and budget fixtures;
- keep expected outputs executable and materially synthetic.

## Optional model research (not on the critical path)

- **[#42](https://github.com/ryjen/shopping-inventory/issues/42) — P2 semantic normalization benchmark:** After #4's synthetic corpus expands, compare deterministic review routing against optional Jev and local classifiers. The [benchmark design](../specs/semantic-normalization-evaluation.md) and [ADR-0007](../decisions/ADR-0007-advisory-semantic-decision-boundary.md) prohibit production model calls or authority changes from this evaluation issue.
- **[#43](https://github.com/ryjen/shopping-inventory/issues/43) — P3 JEPA feasibility:** Deferred unless separately observed stock/consumption labels and baseline failure justify it. See the [data readiness gate](../research/jepa-stock-prediction-feasibility.md). No runtime/model training work is currently planned.

These are research candidates, not blockers for #16, #18, #23–#26 or the canonical release.

## Product expansion after hardening

Downstream work remains:

- #23 Gmail/ecommerce receipt ingestion;
- #24 explained shopping/deal recommendations;
- #25 meal-planning/nutrition-aware suggestions;
- #26 external budget spreadsheet export.

These must consume the Worker/D1/R2 canonical/private substrate and must not introduce parallel authoritative Sheets or direct integration writes.

## Current priority (2026-10-30)

1. **#18 (P1):** obtain explicit operating/spending authorization, provision isolated private D1/R2, deploy an authenticated Worker, prove synthetic live negative/positive smoke, and validate export/restore, retention and credentials. `node scripts/private-config-preflight.mjs <ignored-private-config> development` validates only local fail-closed setup; follow the operator runbook for remote evidence. No production claim before those gates.
2. **#10 (privacy):** submit the private GitHub Support request to purge server-retained historical private PR/commit views; don't force-push otherwise clean history.
3. **Review usability (release-dependent):** the synthetic review/purchase flow does not expose a complete deployed human review interface. Deliver that after private staging operates; do not silently promote imported Sheet rows.
4. **#4 (P2):** finish remaining synthetic OCR/reprocessing/budget/stock corpus, without delaying deployment.
5. **#23–#26 (P2):** Gmail intake, explained shopping recommendations, meal planning and budget export consume only the canonical private substrate after #18.

#16 is closed. #42 is experimental/advisory, and #43 is deferred research—not release dependencies.
