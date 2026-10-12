// Offline, synthetic-only benchmark baseline; not part of the Worker or authority path.
const SPLITS = new Set(["development", "validation", "test"]);

function fail(message) {
  throw new TypeError("semantic-eval: " + message);
}

function fold(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function validateCatalog(catalog) {
  if (!catalog || catalog.synthetic !== true || !Array.isArray(catalog.items) || catalog.items.length === 0) {
    fail("catalog must be nonempty and explicitly synthetic");
  }
  const ids = new Set();
  for (const item of catalog.items) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) fail("invalid or duplicate catalog item ID");
    if (typeof item.name !== "string" || !item.name.trim()) fail("catalog item name missing");
    if (!Array.isArray(item.aliases) || item.aliases.some((alias) => typeof alias !== "string" || !alias.trim())) {
      fail("invalid catalog aliases");
    }
    ids.add(item.id);
  }
  return new Map(catalog.items.map((item) => [item.id, item]));
}

export function validateCase(item, catalogById) {
  if (!item || item.synthetic !== true) fail("case must be explicitly synthetic");
  if (typeof item.caseId !== "string" || !/^[a-z][a-z0-9_]*$/.test(item.caseId)) fail("invalid case ID");
  if (!SPLITS.has(item.split) || typeof item.cohort !== "string" || !item.cohort) fail("invalid split or cohort");
  if (typeof item.rawLine !== "string" || !item.rawLine.trim()) fail("invalid raw line");
  if (!Array.isArray(item.candidateIds) || item.candidateIds.length === 0) fail("empty candidate shortlist");
  if (new Set(item.candidateIds).size !== item.candidateIds.length ||
      item.candidateIds.some((id) => typeof id !== "string" || !catalogById.has(id))) fail("unknown/duplicate candidate ID");
  if (item.expectedId !== null && !item.candidateIds.includes(item.expectedId)) {
    fail("expected ID must be null or in the candidate shortlist");
  }
  if (!Array.isArray(item.hardFlags) ||
      item.hardFlags.some((flag) => typeof flag !== "string" || !flag.trim())) fail("invalid hard-policy flags");
}

export function validateProposal(proposal, item) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) fail("invalid provider proposal");
  const allowedKeys = new Set(["selectedId", "abstained", "modelId", "adapterVersion", "probabilities"]);
  if (Object.keys(proposal).some((key) => !allowedKeys.has(key))) fail("unexpected provider fields");
  if (typeof proposal.abstained !== "boolean" ||
      !("selectedId" in proposal) ||
      (proposal.selectedId !== null && !item.candidateIds.includes(proposal.selectedId)) ||
      proposal.abstained !== (proposal.selectedId === null)) fail("invalid provider selection/abstention");
  if (typeof proposal.modelId !== "string" || !proposal.modelId ||
      typeof proposal.adapterVersion !== "string" || !proposal.adapterVersion) fail("missing provider version");
  if (proposal.probabilities !== undefined) {
    if (!proposal.probabilities || typeof proposal.probabilities !== "object" || Array.isArray(proposal.probabilities)) {
      fail("invalid probability object");
    }
    const expected = [...item.candidateIds, "no_match"];
    const actual = Object.keys(proposal.probabilities);
    if (actual.length !== expected.length || expected.some((id) => !Object.hasOwn(proposal.probabilities, id))) {
      fail("probability keys must match shortlist plus no_match");
    }
    const values = actual.map((id) => proposal.probabilities[id]);
    if (values.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)) {
      fail("non-finite or out-of-range probability");
    }
    if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.001) fail("probabilities do not sum to one");
  }
  return proposal;
}

// Intentionally conservative exact alias baseline: this is a benchmark reference,
// not a claim that production normalizers already implement fuzzy catalog retrieval.
export function exactAliasBaseline(item, catalogById) {
  const input = fold(item.rawLine);
  const matches = item.candidateIds.filter((id) => {
    const entry = catalogById.get(id);
    return [entry.name, ...entry.aliases].some((text) => fold(text) === input);
  });
  const selectedId = item.hardFlags.length === 0 && matches.length === 1 ? matches[0] : null;
  return {
    selectedId,
    abstained: selectedId === null,
    modelId: "synthetic-exact-alias",
    adapterVersion: "1",
  };
}

function summarize(rows) {
  const total = rows.length;
  const resolved = rows.filter((row) => row.selectedId !== null).length;
  const correctSelected = rows.filter((row) =>
    row.selectedId !== null && row.selectedId === row.expectedId).length;
  const falseMatches = rows.filter((row) =>
    row.selectedId !== null && row.selectedId !== row.expectedId).length;
  const missedMatches = rows.filter((row) =>
    row.selectedId === null && row.expectedId !== null).length;
  const correctAbstentions = rows.filter((row) =>
    row.selectedId === null && row.expectedId === null).length;
  return {
    total, resolved, correctSelected, falseMatches, missedMatches, correctAbstentions,
    coverage: total ? resolved / total : null,
    selectivePrecision: resolved ? correctSelected / resolved : null,
    selectiveRisk: resolved ? falseMatches / resolved : null,
  };
}

export function evaluateSemanticCases(cases, catalog, decide = exactAliasBaseline) {
  const catalogById = validateCatalog(catalog);
  if (!Array.isArray(cases) || cases.length === 0) fail("no cases");
  const caseIds = new Set();
  const rows = [];
  let provider = null;
  for (const item of cases) {
    validateCase(item, catalogById);
    if (caseIds.has(item.caseId)) fail("duplicate case ID");
    caseIds.add(item.caseId);
    const proposal = validateProposal(decide(item, catalogById), item);
    if (provider === null) provider = { modelId: proposal.modelId, adapterVersion: proposal.adapterVersion };
    if (provider.modelId !== proposal.modelId || provider.adapterVersion !== proposal.adapterVersion) {
      fail("inconsistent provider version within one evaluation");
    }
    // A provider suggestion may never bypass a deterministic hard-policy veto.
    const selectedId = item.hardFlags.length ? null : proposal.selectedId;
    rows.push({ cohort: item.cohort, split: item.split, selectedId, expectedId: item.expectedId });
  }
  const cohorts = [...new Set(rows.map((row) => row.cohort))].sort();
  const splits = [...SPLITS];
  return {
    schemaVersion: 1,
    modelId: provider.modelId,
    adapterVersion: provider.adapterVersion,
    note: "Synthetic-only offline coverage; no evidence of production accuracy or purchase authority.",
    summary: summarize(rows),
    bySplit: Object.fromEntries(splits.map((split) =>
      [split, summarize(rows.filter((row) => row.split === split))])),
    byCohort: Object.fromEntries(cohorts.map((cohort) =>
      [cohort, summarize(rows.filter((row) => row.cohort === cohort))])),
  };
}
