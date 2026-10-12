# Security Policy

## Supported scope

Shopping Inventory is a public-code/private-data personal project. Security reports are relevant when they affect:

- the public repository or CI publication boundary;
- the authenticated Worker API;
- D1/R2 authorization, evidence isolation, or provenance controls;
- secret/credential handling;
- review, duplicate, or authoritative-purchase integrity;
- accidental disclosure of private household data.

## Reporting privately

Do **not** include real receipts, household purchase history, credentials, private resource identifiers, or other sensitive evidence in a public issue, pull request, discussion, or commit.

Preferred reporting path:

1. Open the repository's **Security** tab.
2. Use **Report a vulnerability** when GitHub private vulnerability reporting is available.
3. Repository maintainers may also create a **draft security advisory** under Security → Advisories for internally discovered issues.
4. Use synthetic reproduction data and opaque identifiers whenever possible.

If GitHub does not expose a private reporting action to the reporter, do not publish the sensitive details. Contact the repository owner through an already-established private channel and provide only the repository name and a request to establish a private security thread.

## Accidental private-data exposure

If a report concerns private data already committed or published, follow the [Public Data Incident Response runbook](docs/runbooks/public-data-incident-response.md).

Removing a file in a later commit does not remove it from Git history, caches, forks, artifacts, or clones.

## Response expectations

Security reports should be triaged by impact to confidentiality, integrity, and the authority boundaries documented in the threat model. Containment takes precedence over feature work when private data, credentials, or authoritative-state integrity are at risk.

Do not promise public disclosure dates before containment and remediation evidence are complete.
