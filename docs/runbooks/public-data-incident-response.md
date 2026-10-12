# Public Data Incident Response

## Purpose

Use this runbook when private household data, credentials, private infrastructure identifiers, or other prohibited material reaches Git, a pull request, CI output, an issue, or another public project surface.

The primary objective is containment without reproducing the sensitive payload during investigation.

## Immediate containment

1. Stop additional publication or automation touching the affected material.
2. Close, block, or restrict the affected pull request/workflow where practical.
3. Do not copy the private payload into another issue, PR comment, chat transcript, or diagnostic artifact.
4. If credentials or access URLs were exposed, revoke or rotate them before broader cleanup.
5. Preserve only opaque evidence needed to identify affected Git objects, workflow runs, or storage records.

## Scope the exposure

Identify affected:

- commits and branches;
- pull requests and review comments;
- issues/discussions;
- Actions logs or uploaded artifacts;
- releases/tags;
- forks, clones, mirrors, or caches known to contain the object.

Record object IDs, commit SHAs, run IDs, and timestamps rather than private content.

## Remediation

1. Move any required source data into the approved private D1/R2 path.
2. Remove the prohibited material from the working tree.
3. Determine whether Git history rewrite is required.
4. Purge generated artifacts/logs where the platform allows it.
5. Rotate credentials/resource identifiers when exposure could grant access.
6. Re-run repository privacy validation before reopening the affected branch or workflow.

History rewriting reduces future discoverability but cannot guarantee erasure from existing clones, forks, screenshots, caches, or external copies.

## Validation

Before declaring containment complete:

- `npm run privacy:check` passes against the complete tracked tree;
- any exposed credential is no longer valid;
- public artifacts/logs no longer expose the data where deletion is supported;
- the private canonical copy, if required, exists only in approved storage;
- a regression test or guard is added when the incident represents a generalizable failure mode.

## Documentation boundary

Document:

- incident class;
- affected public surfaces;
- containment/remediation actions;
- opaque object/run identifiers;
- control or regression-test changes.

Do not document the sensitive payload itself.

## Historical reference

Issue #10 records the original receipt-derived public-data remediation that motivated the repository publication gate. Reuse its lessons, not its sensitive data.

See also:

- [Private Data Policy](../security/private-data-policy.md)
- [Threat Model and Privacy Considerations](../security/threat-model-and-privacy.md)
- [Security Policy](../../SECURITY.md)
