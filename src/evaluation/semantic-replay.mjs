// Synthetic-only frozen test-double replay. Never a production model adapter.
// Strictly binds each saved response to its exact public synthetic input and
// candidate ordering, preventing accidental comparison against changed fixtures.
import { validateCatalog, validateCase } from "./semantic-baseline.mjs";

function fail(message) {
  throw new TypeError("semantic-replay: " + message);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createSyntheticReplay(bundle, allCases, catalog) {
  if (!bundle || bundle.synthetic !== true || bundle.contractVersion !== 1 ||
      bundle.source !== "scripted-test-double" ||
      typeof bundle.modelId !== "string" || !bundle.modelId.startsWith("synthetic-") ||
      typeof bundle.adapterVersion !== "string" || !bundle.adapterVersion ||
      !Array.isArray(bundle.entries) || bundle.entries.length === 0) {
    fail("invalid synthetic scripted replay bundle");
  }
  const catalogById = validateCatalog(catalog);
  const known = new Map();
  for (const item of allCases) {
    validateCase(item, catalogById);
    if (known.has(item.caseId)) fail("duplicate evaluation case ID");
    known.set(item.caseId, item);
  }
  const entries = new Map();
  const selectedCases = [];
  for (const entry of bundle.entries) {
    if (!entry || typeof entry.caseId !== "string" || entries.has(entry.caseId)) {
      fail("duplicate or invalid replay case ID");
    }
    const item = known.get(entry.caseId);
    if (!item) fail("unknown case ID in replay");
    if (!same(entry.input, {
      rawLine: item.rawLine,
      candidateIds: item.candidateIds,
      hardFlags: item.hardFlags,
    })) fail("stale replay input or changed candidate order");
    if (!entry.decision || typeof entry.decision !== "object" || Array.isArray(entry.decision)) {
      fail("missing frozen decision");
    }
    const permitted = new Set(["selectedId", "abstained", "probabilities"]);
    if (Object.keys(entry.decision).some((key) => !permitted.has(key))) {
      fail("unexpected decision fields");
    }
    entries.set(entry.caseId, entry);
    selectedCases.push(item);
  }
  return {
    cases: selectedCases,
    decide(item) {
      const entry = entries.get(item.caseId);
      if (!entry) fail("case was not part of the frozen replay subset");
      if (!same(entry.input, {
        rawLine: item.rawLine, candidateIds: item.candidateIds, hardFlags: item.hardFlags,
      })) fail("replay case mutated since binding");
      return {
        ...entry.decision,
        modelId: bundle.modelId,
        adapterVersion: bundle.adapterVersion,
      };
    },
  };
}
