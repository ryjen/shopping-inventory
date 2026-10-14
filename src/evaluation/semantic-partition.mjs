// Versioned, synthetic-only case-family partition evidence. Not a runtime model gate.
// This validates a public, predeclared holdout, NOT a blind unseen-item test.
import { validateCatalog, validateCase } from "./semantic-baseline.mjs";

const SPLITS = new Set(["development", "validation", "test"]);
const CASE_FIELDS = [
  "synthetic", "caseId", "split", "familyId", "cohort",
  "rawLine", "candidateIds", "expectedId", "hardFlags",
];

function fail(reason) {
  throw new TypeError("semantic-partition: " + reason);
}
function record(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function snapshot(item) {
  return Object.fromEntries(CASE_FIELDS.map((key) => [key, item[key]]));
}
function sortById(rows) {
  return [...rows].sort((a, b) => a.caseId.localeCompare(b.caseId, "en"));
}

export function validateSemanticPartition(cases, catalog, manifest) {
  if (!manifest || manifest.synthetic !== true || manifest.schemaVersion !== 2 ||
      manifest.partitionKind !== "case-family-disjoint" ||
      !record(manifest.familySplits) || !record(manifest.catalogItemFamilies) ||
      !Array.isArray(manifest.frozenTestCases)) {
    fail("missing or invalid version 2 synthetic partition manifest");
  }
  const catalogById = validateCatalog(catalog);
  if (!Array.isArray(cases) || cases.length === 0) fail("empty corpus");
  const familySplits = manifest.familySplits;
  if (!Object.keys(familySplits).length ||
      Object.values(familySplits).some((split) => !SPLITS.has(split))) {
    fail("invalid family-to-split mapping");
  }

  const itemFamily = manifest.catalogItemFamilies;
  if (Object.keys(itemFamily).length !== catalogById.size ||
      Object.keys(itemFamily).some((id) => !catalogById.has(id) ||
        typeof itemFamily[id] !== "string" || !Object.hasOwn(familySplits, itemFamily[id]))) {
    fail("catalog identities are not fully assigned to known families");
  }

  const caseIds = new Set();
  const seenRawText = new Map();
  const familyCounts = Object.fromEntries(Object.keys(familySplits).sort()
    .map((family) => [family, 0]));
  const splitCounts = { development: 0, validation: 0, test: 0 };

  for (const item of cases) {
    validateCase(item, catalogById);
    if (!same(Object.keys(item).sort(), [...CASE_FIELDS].sort())) fail("unexpected case fields");
    if (caseIds.has(item.caseId)) fail("duplicate case ID");
    caseIds.add(item.caseId);
    if (!Object.hasOwn(familySplits, item.familyId) ||
        familySplits[item.familyId] !== item.split) {
      fail("case family crosses split boundary");
    }
    if (item.expectedId !== null && itemFamily[item.expectedId] !== item.familyId) {
      fail("gold identity belongs to a different case family");
    }
    if (!item.candidateIds.some((id) => itemFamily[id] === item.familyId)) {
      fail("case has no candidate belonging to its declared family");
    }
    const normalized = item.rawLine.normalize("NFKC").trim().replace(/\\s+/g, " ").toLocaleLowerCase("en");
    const previous = seenRawText.get(normalized);
    if (previous && previous !== item.split) fail("same input text crosses split boundary");
    seenRawText.set(normalized, item.split);
    splitCounts[item.split]++;
    familyCounts[item.familyId]++;
  }

  if (Object.values(familyCounts).some((count) => count === 0) ||
      Object.values(splitCounts).some((count) => count === 0)) {
    fail("split or mapped family has no cases");
  }

  const actualTest = sortById(cases.filter((item) => item.split === "test").map(snapshot));
  if (!same(actualTest, sortById(manifest.frozenTestCases))) {
    fail("frozen held-out data differs from the declared version 2 snapshot");
  }

  return {
    schemaVersion: manifest.schemaVersion,
    partitionKind: manifest.partitionKind,
    cases: cases.length,
    catalogItems: catalogById.size,
    splitCounts,
    familyCounts,
    frozenTestCases: actualTest.length,
  };
}
