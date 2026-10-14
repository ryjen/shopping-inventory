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
  if (!manifest || manifest.synthetic !== true || ![2, 3].includes(manifest.schemaVersion) ||
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
    const normalized = item.rawLine.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
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


// No v2 test case can silently disappear or change in the extended v3 study.
// The original v2 catalog remains a separate immutable benchmark input.
export function validateSemanticPartitionEvolution(
  parentCases, parentCatalog, parentManifest,
  currentCases, currentCatalog, currentManifest,
) {
  const parent = validateSemanticPartition(parentCases, parentCatalog, parentManifest);
  const current = validateSemanticPartition(currentCases, currentCatalog, currentManifest);
  if (parent.schemaVersion !== 2 || current.schemaVersion !== 3 ||
      currentManifest.parentManifest !== "semantic-split-v2.synthetic.json") {
    fail("v3 must explicitly extend the declared v2 benchmark");
  }
  if (current.cases <= parent.cases || current.catalogItems <= parent.catalogItems ||
      current.frozenTestCases < parent.frozenTestCases) {
    fail("v3 must extend, not shrink, the v2 corpus");
  }
  const currentByCase = new Map(currentCases.map((item) => [item.caseId, item]));
  for (const item of parentCases) {
    if (!same(item, currentByCase.get(item.caseId))) {
      fail("v2 case changed or was dropped in v3");
    }
  }
  const currentByItem = new Map(currentCatalog.items.map((item) => [item.id, item]));
  for (const item of parentCatalog.items) {
    if (!same(item, currentByItem.get(item.id))) {
      fail("v2 catalog identity changed or was dropped in v3");
    }
  }
  for (const [family, split] of Object.entries(parentManifest.familySplits)) {
    if (currentManifest.familySplits[family] !== split) {
      fail("v2 family was reassigned in v3");
    }
  }
  for (const [id, family] of Object.entries(parentManifest.catalogItemFamilies)) {
    if (currentManifest.catalogItemFamilies[id] !== family) {
      fail("v2 catalog item changed family in v3");
    }
  }
  return {
    ...current,
    parentVersion: parent.schemaVersion,
    parentCases: parent.cases,
    parentFrozenTestCases: parent.frozenTestCases,
  };
}
