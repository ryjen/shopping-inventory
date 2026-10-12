# Next Steps

The repository has completed the architecture, provenance, validation, exact-evidence identity, and conservative transaction duplicate/reprocessing foundations. The active work is now security/supply-chain hardening and private operational readiness before broader product expansion.

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

## P1 repository security track — #16

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

## Product expansion after hardening

Downstream work remains:

- #23 Gmail/ecommerce receipt ingestion;
- #24 explained shopping/deal recommendations;
- #25 meal-planning/nutrition-aware suggestions;
- #26 external budget spreadsheet export.

These must consume the Worker/D1/R2 canonical/private substrate and must not introduce parallel authoritative Sheets or direct integration writes.

## Current priority

For repository-only work:

1. #16 security/supply-chain hardening
2. #4 evaluation corpus expansion after #16's core reproducibility/security gates

For private operations:

1. #18 can proceed in parallel with repository-only #16 work

Product issues #23–#26 remain P2 until the P1 security/operational boundary is ready.
