// Offline, dependency-free lexical contender for SYNTHETIC benchmark inputs only.
// Not a trained model, not semantic evidence and never a production authority path.
// Thresholds were set before observing any v3 held-out comparison outcome.
export const LEXICAL_CONFIG = Object.freeze({
  minScore: 0.88,
  minMargin: 0.10,
  gramSize: 3,
  adapterVersion: "1",
});

function fold(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en").trim().replace(/\s+/g, " ");
}

function ngrams(value) {
  const valueWithBounds = `^${fold(value)}$`;
  const grams = new Set();
  for (let i = 0; i <= valueWithBounds.length - LEXICAL_CONFIG.gramSize; i++) {
    grams.add(valueWithBounds.slice(i, i + LEXICAL_CONFIG.gramSize));
  }
  return grams;
}

export function diceScore(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    throw new TypeError("lexical-eval: expected synthetic strings");
  }
  const a = ngrams(left);
  const b = ngrams(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return 2 * shared / (a.size + b.size);
}

// Return a candidate shortlist selection only if its best lexical identity is
// comfortably above the threshold AND clearly separated from the runner-up.
// An unknown, injected or ambiguous string must remain reviewable; policy
// vetoes always return no-match before any lexical scoring.
export function lexicalDiceBaseline(item, catalogById) {
  if (item.hardFlags.length) {
    return {
      selectedId: null, abstained: true,
      modelId: "synthetic-lexical-dice", adapterVersion: LEXICAL_CONFIG.adapterVersion,
    };
  }
  const ranked = item.candidateIds.map((id) => {
    const candidate = catalogById.get(id);
    const similarity = Math.max(...[candidate.name, ...candidate.aliases]
      .map((name) => diceScore(item.rawLine, name)));
    return { id, similarity };
  }).sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id, "en"));
  const best = ranked[0];
  const second = ranked[1];
  const selectedId = best &&
    best.similarity >= LEXICAL_CONFIG.minScore &&
    (!second || best.similarity - second.similarity >= LEXICAL_CONFIG.minMargin)
    ? best.id : null;
  return {
    selectedId, abstained: selectedId === null,
    modelId: "synthetic-lexical-dice", adapterVersion: LEXICAL_CONFIG.adapterVersion,
  };
}
