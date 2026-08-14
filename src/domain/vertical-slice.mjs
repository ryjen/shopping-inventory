const INVENTORY_LINE_TYPE = "item";
const RECEIPT_ADJUSTMENT_TYPES = new Set(["fee", "deposit", "discount", "coupon", "tax"]);

function pad(index) {
  return String(index).padStart(3, "0");
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundMoney(value) {
  return round(value, 2);
}

function roundQuantity(value) {
  return round(value, 4);
}

function daysBetween(earlier, later) {
  const earlierMs = Date.parse(earlier);
  const laterMs = Date.parse(later);
  if (!Number.isFinite(earlierMs) || !Number.isFinite(laterMs)) {
    throw new TypeError("vertical-slice timestamps must be valid date-times");
  }
  return Math.max(0, (laterMs - earlierMs) / 86_400_000);
}

function catalogByCanonicalItem(catalog) {
  return new Map(
    Object.values(catalog).map((entry) => [entry.canonical_item_id, entry]),
  );
}

function effectivePurchases(purchases) {
  const supersededIds = new Set(
    purchases.map((purchase) => purchase.supersedes_id).filter(Boolean),
  );
  return purchases.filter((purchase) => !supersededIds.has(purchase.purchase_id));
}

export function flattenReceiptEnvelope(envelope, { createdAt }) {
  return envelope.lines.map((line, index) => ({
    schema_version: "1.0.0",
    record_kind: "import_raw_row",
    import_id: `imp_syn_slice_${pad(index + 1)}`,
    envelope_id: envelope.envelope_id,
    line_id: line.line_id,
    source: { ...envelope.source },
    line_number: line.line_number,
    line_type: line.line_type,
    raw_text: line.raw_text,
    quantity: line.quantity ?? null,
    unit: line.unit ?? null,
    unit_price: line.unit_price ?? null,
    extended_price: line.extended_price ?? null,
    parse_confidence: line.parse_confidence,
    review_state: "new",
    created_at: createdAt,
  }));
}

export function normalizeItemRows(rawRows, catalog, { createdAt }) {
  const itemRows = rawRows.filter((row) => row.line_type === INVENTORY_LINE_TYPE);

  return itemRows.map((row, index) => {
    const rule = catalog[row.raw_text];
    if (!rule) {
      throw new Error(`synthetic normalization catalog has no rule for ${row.import_id}`);
    }
    if (typeof row.quantity !== "number" || row.quantity <= 0) {
      throw new Error(`synthetic item ${row.import_id} has no positive quantity`);
    }

    return {
      schema_version: "1.0.0",
      record_kind: "purchase_candidate",
      candidate_id: `cand_syn_slice_${pad(index + 1)}`,
      source_import_id: row.import_id,
      canonical_item_id: rule.canonical_item_id,
      quantity: row.quantity,
      unit: row.unit,
      amount: row.extended_price,
      normalization_confidence: rule.normalization_confidence,
      review_state: "needs_review",
      created_at: createdAt,
    };
  });
}

export function applyReviewDecisions(candidates, decisions) {
  return candidates.map((candidate) => {
    const decision = decisions[candidate.candidate_id];
    if (decision === undefined) return { ...candidate };
    if (decision !== "approved" && decision !== "rejected") {
      throw new TypeError(`unsupported synthetic review decision for ${candidate.candidate_id}`);
    }
    return { ...candidate, review_state: decision };
  });
}

export function promoteApprovedCandidates(candidates, { acquiredAt, createdAt }) {
  return candidates
    .filter((candidate) => candidate.review_state === "approved")
    .map((candidate, index) => ({
      schema_version: "1.0.0",
      record_kind: "purchase",
      purchase_id: `pur_syn_slice_${pad(index + 1)}`,
      source_candidate_id: candidate.candidate_id,
      canonical_item_id: candidate.canonical_item_id,
      quantity: candidate.quantity,
      unit: candidate.unit,
      amount: candidate.amount,
      acquired_at: acquiredAt,
      supersedes_id: null,
      created_at: createdAt,
    }));
}

function stockState(remainingRatio) {
  if (remainingRatio <= 0.1) return "none";
  if (remainingRatio <= 0.5) return "low";
  if (remainingRatio <= 1.25) return "available";
  return "stocked";
}

export function deriveStockSnapshots(purchases, catalog, { asOf }) {
  const policies = catalogByCanonicalItem(catalog);
  const groups = new Map();

  for (const purchase of effectivePurchases(purchases)) {
    const current = groups.get(purchase.canonical_item_id) ?? [];
    current.push(purchase);
    groups.set(purchase.canonical_item_id, current);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([canonicalItemId, itemPurchases], index) => {
      const policy = policies.get(canonicalItemId);
      if (!policy || typeof policy.half_life_days !== "number" || policy.half_life_days <= 0) {
        throw new Error(`missing stock policy for ${canonicalItemId}`);
      }

      const units = new Set(itemPurchases.map((purchase) => purchase.unit ?? null));
      const sourcePurchaseIds = itemPurchases.map((purchase) => purchase.purchase_id).sort();
      if (units.size !== 1 || itemPurchases.some((purchase) => purchase.acquired_at === null)) {
        return {
          schema_version: "1.0.0",
          record_kind: "stock_snapshot",
          snapshot_id: `stock_syn_slice_${pad(index + 1)}`,
          canonical_item_id: canonicalItemId,
          state: "unknown",
          quantity_estimate: null,
          unit: units.size === 1 ? [...units][0] : null,
          confidence: 0.5,
          as_of: asOf,
          source_purchase_ids: sourcePurchaseIds,
          method: { name: "exponential_decay_v1", half_life_days: policy.half_life_days },
        };
      }

      const startingQuantity = itemPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
      const estimate = itemPurchases.reduce((sum, purchase) => {
        const ageDays = daysBetween(purchase.acquired_at, asOf);
        return sum + purchase.quantity * (0.5 ** (ageDays / policy.half_life_days));
      }, 0);
      const ratio = startingQuantity > 0 ? estimate / startingQuantity : 0;
      const oldestAge = Math.max(...itemPurchases.map((purchase) => daysBetween(purchase.acquired_at, asOf)));
      const confidence = roundQuantity(Math.max(0.5, 0.9 - 0.05 * (oldestAge / policy.half_life_days)));

      return {
        schema_version: "1.0.0",
        record_kind: "stock_snapshot",
        snapshot_id: `stock_syn_slice_${pad(index + 1)}`,
        canonical_item_id: canonicalItemId,
        state: stockState(ratio),
        quantity_estimate: roundQuantity(estimate),
        unit: itemPurchases[0].unit,
        confidence,
        as_of: asOf,
        source_purchase_ids: sourcePurchaseIds,
        method: { name: "exponential_decay_v1", half_life_days: policy.half_life_days },
      };
    });
}

export function deriveBudgetExport(purchases, catalog, { period, currency, generatedAt }) {
  const policies = catalogByCanonicalItem(catalog);
  const grouped = new Map();

  for (const purchase of effectivePurchases(purchases)) {
    if (purchase.acquired_at === null || !purchase.acquired_at.startsWith(period)) continue;
    if (purchase.amount === null) continue;
    const policy = policies.get(purchase.canonical_item_id);
    if (!policy?.budget_category) {
      throw new Error(`missing budget category for ${purchase.canonical_item_id}`);
    }

    const current = grouped.get(policy.budget_category) ?? { amount: 0, purchase_ids: [] };
    current.amount = roundMoney(current.amount + purchase.amount);
    current.purchase_ids.push(purchase.purchase_id);
    grouped.set(policy.budget_category, current);
  }

  const rows = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, value]) => ({
      category,
      amount: roundMoney(value.amount),
      purchase_ids: [...value.purchase_ids].sort(),
    }));

  return {
    schema_version: "1.0.0",
    record_kind: "budget_export",
    export_id: "budget_syn_slice_001",
    period,
    currency,
    rows,
    total_amount: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
    generated_at: generatedAt,
  };
}

export function deriveShoppingRecommendations(stockSnapshots, { generatedAt }) {
  return stockSnapshots
    .filter((snapshot) => snapshot.state === "low" || snapshot.state === "none")
    .map((snapshot, index) => {
      const none = snapshot.state === "none";
      const quantityText = snapshot.quantity_estimate === null
        ? "unknown quantity"
        : `${snapshot.quantity_estimate} ${snapshot.unit ?? "units"}`;
      return {
        schema_version: "1.0.0",
        record_kind: "shopping_recommendation",
        recommendation_id: `rec_syn_slice_${pad(index + 1)}`,
        canonical_item_id: snapshot.canonical_item_id,
        action: "buy",
        urgency: none ? "high" : "medium",
        confidence: snapshot.confidence,
        reason_codes: [none ? "estimated_no_stock" : "estimated_low_stock"],
        rationale: `Estimated stock is ${snapshot.state} (${quantityText}) using ${snapshot.method.name}.`,
        evidence: {
          stock_snapshot_id: snapshot.snapshot_id,
          purchase_ids: [...snapshot.source_purchase_ids],
        },
        generated_at: generatedAt,
      };
    });
}

export function reconcileReceipt(envelope, rawRows, candidates, purchases) {
  const pendingCandidateIds = new Set(
    candidates.filter((candidate) => candidate.review_state === "needs_review").map((candidate) => candidate.candidate_id),
  );
  const candidateByImport = new Map(candidates.map((candidate) => [candidate.source_import_id, candidate]));
  const authoritativeCandidateIds = new Set(purchases.map((purchase) => purchase.source_candidate_id));

  let authoritativeAmount = 0;
  let pendingReviewAmount = 0;
  let nonInventoryAdjustments = 0;

  for (const row of rawRows) {
    const candidate = candidateByImport.get(row.import_id);
    if (candidate && authoritativeCandidateIds.has(candidate.candidate_id)) {
      authoritativeAmount = roundMoney(authoritativeAmount + (candidate.amount ?? 0));
    } else if (candidate && pendingCandidateIds.has(candidate.candidate_id)) {
      pendingReviewAmount = roundMoney(pendingReviewAmount + (candidate.amount ?? 0));
    } else if (RECEIPT_ADJUSTMENT_TYPES.has(row.line_type)) {
      nonInventoryAdjustments = roundMoney(nonInventoryAdjustments + (row.extended_price ?? 0));
    }
  }

  const accountedAmount = roundMoney(authoritativeAmount + pendingReviewAmount + nonInventoryAdjustments);
  return {
    receipt_total: envelope.receipt_total,
    authoritative_amount: authoritativeAmount,
    pending_review_amount: pendingReviewAmount,
    non_inventory_adjustments: nonInventoryAdjustments,
    accounted_amount: accountedAmount,
    difference: roundMoney((envelope.receipt_total ?? 0) - accountedAmount),
  };
}

export function runSyntheticVerticalSlice(fixture) {
  if (fixture?.synthetic !== true) {
    throw new TypeError("vertical slice accepts materially synthetic fixtures only");
  }

  const rawRows = flattenReceiptEnvelope(fixture.envelope, {
    createdAt: fixture.clock.raw_created_at,
  });
  const normalized = normalizeItemRows(rawRows, fixture.catalog, {
    createdAt: fixture.clock.candidate_created_at,
  });
  const candidates = applyReviewDecisions(normalized, fixture.review_decisions);
  const purchases = promoteApprovedCandidates(candidates, {
    acquiredAt: fixture.envelope.purchased_at,
    createdAt: fixture.clock.purchase_created_at,
  });
  const stockSnapshots = deriveStockSnapshots(purchases, fixture.catalog, {
    asOf: fixture.clock.as_of,
  });
  const budgetExport = deriveBudgetExport(purchases, fixture.catalog, {
    period: fixture.budget_period,
    currency: fixture.envelope.currency,
    generatedAt: fixture.clock.generated_at,
  });
  const recommendations = deriveShoppingRecommendations(stockSnapshots, {
    generatedAt: fixture.clock.generated_at,
  });
  const reconciliation = reconcileReceipt(fixture.envelope, rawRows, candidates, purchases);

  return {
    envelope: fixture.envelope,
    rawRows,
    candidates,
    purchases,
    stockSnapshots,
    budgetExport,
    recommendations,
    reconciliation,
  };
}
