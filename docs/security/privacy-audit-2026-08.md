# Privacy Audit — August 2026

## Scope

This audit reviewed the public default branch, recent repository commits, open pull requests, and active receipt-import branches against the [Private Data Policy](private-data-policy.md).

## Findings

Five receipt-derived real transactions were found in public GitHub surfaces:

- four files reachable from the default branch;
- one additional transaction in an open pull request and its source branch.

The records omitted some direct identifiers, but still contained combinations of real merchants or store context, timestamps, product baskets, quantities, prices, totals, loyalty/payment metadata, and household consumption patterns. Under the current policy, redaction is insufficient and these records are prohibited from the public repository.

No receipt images or active credentials were identified in the audited changes.

## Immediate remediation

- remove all four receipt-derived files from the current default-branch tree;
- close the open receipt-data pull request without merging;
- prohibit further real-data imports through the pull request privacy gate;
- route future real evidence to private Cloudflare R2 and structured records to private Cloudflare D1;
- use materially synthetic fixtures for public regression coverage.

## Residual exposure

Deleting files in a new commit does not remove earlier blobs, commit diffs, pull-request diffs, forks, caches, or existing clones. Historical objects remain reachable until repository history is rewritten and GitHub completes object cleanup.

The remaining exposure is personal shopping-pattern data rather than credentials or identity documents. A history rewrite is therefore recommended, but it must be treated as a coordinated destructive operation because commit identifiers change and every clone must be re-synchronized.

## History rewrite decision gate

Before rewriting history:

1. preserve any needed records in approved private storage;
2. identify protected branches, tags, open branches, forks, Actions artifacts, and external references;
3. prepare a path-based `git filter-repo` removal plan covering the affected receipt-import paths and pull-request branch;
4. pause repository writes;
5. force-push rewritten branches and tags;
6. delete obsolete remote branches;
7. request GitHub cached-view and dangling-object cleanup where applicable;
8. require collaborators to re-clone or hard-reset;
9. verify the known blobs and transaction markers are no longer reachable.

## Status

Current-tree remediation is implemented by the associated pull request. Historical cleanup remains open under issue #10 until the coordinated rewrite and verification steps are completed.
