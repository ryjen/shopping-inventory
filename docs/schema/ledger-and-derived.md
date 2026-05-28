# Ledger and Derived Schemas

These sheets are downstream of raw evidence. `Purchases` is authoritative. `Stock` and `Budget_Export` are derived and should be recomputable.

## `Purchases`

Authoritative purchase ledger. One row should represent one reviewed, normalized purchase line.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `purchase_id` | yes | string | Stable purchase row ID |
| `source_import_id` | yes | string | Source row from `Import_Raw` or `Orders_Raw` |
| `source_type` | yes | enum | Receipt, email, ecommerce, manual correction, etc. |
| `receipt_id` | no | string | Receipt grouping ID where applicable |
| `order_id` | no | string | Order grouping ID where applicable |
| `merchant_normalized` | no | string | Normalized merchant/store |
| `purchased_at` | yes | datetime | Purchase/order date used for reporting |
| `canonical_item_id` | yes | string | Stable canonical item identifier |
| `canonical_item_name` | yes | string | Human-readable canonical item |
| `raw_item_text` | yes | string | Raw source item text for traceability |
| `category_primary` | yes | string | Primary budget/inventory category |
| `category_secondary` | no | string | Optional subcategory |
| `quantity_value` | no | decimal | Normalized quantity where known |
| `quantity_unit` | no | string | Normalized unit where known |
| `package_count` | no | decimal | Count of packages/units if inferable |
| `price_amount` | no | decimal | Net line price when known |
| `currency` | no | string | Default `CAD` |
| `tax_amount` | no | decimal | Line tax if known |
| `discount_amount` | no | decimal | Line discount if known |
| `is_perishable` | yes | boolean | Whether item decays quickly |
| `default_decay_days` | no | integer | Default freshness/stock decay window |
| `storage_area` | no | enum | `pantry`, `fridge`, `freezer`, `household`, `unknown` |
| `review_state` | yes | enum | Usually `reviewed` or `promoted` |
| `reviewed_by` | no | string | Human or workflow reviewer |
| `reviewed_at` | no | datetime | Review timestamp |
| `normalization_confidence` | no | decimal | Confidence 0.0-1.0 |
| `notes` | no | string | Human-readable notes |

## `Aliases`

Reference table for mapping raw strings to canonical items.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `alias_id` | yes | string | Stable alias row ID |
| `raw_pattern` | yes | string | Raw receipt/order pattern or regex-like text |
| `pattern_type` | yes | enum | `exact`, `contains`, `regex`, `semantic` |
| `merchant_scope` | no | string | Optional merchant restriction |
| `canonical_item_id` | yes | string | Stable canonical item ID |
| `canonical_item_name` | yes | string | Human-readable canonical item |
| `category_primary` | yes | string | Default primary category |
| `category_secondary` | no | string | Default subcategory |
| `default_quantity_value` | no | decimal | Optional default quantity |
| `default_quantity_unit` | no | string | Optional default unit |
| `is_perishable` | yes | boolean | Default perishability |
| `default_decay_days` | no | integer | Default decay window |
| `confidence` | yes | decimal | Confidence in alias mapping |
| `status` | yes | enum | `active`, `needs_review`, `deprecated` |
| `created_at` | yes | datetime | Creation timestamp |
| `updated_at` | no | datetime | Last update timestamp |
| `notes` | no | string | Rationale or examples |

## `Review_Queue`

Review surface for uncertain, duplicate, or policy-sensitive rows.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `review_id` | yes | string | Stable review task ID |
| `source_table` | yes | string | Source tab name |
| `source_row_id` | yes | string | Source row identifier |
| `reason_code` | yes | enum | `low_confidence`, `ambiguous_alias`, `possible_duplicate`, `policy_sensitive`, `missing_price`, `manual_check` |
| `raw_item_text` | no | string | Raw item text for quick review |
| `suggested_canonical_item_id` | no | string | Suggested canonical item ID |
| `suggested_canonical_item_name` | no | string | Suggested canonical item name |
| `suggested_category_primary` | no | string | Suggested category |
| `confidence` | no | decimal | Confidence 0.0-1.0 |
| `review_state` | yes | enum | `new`, `needs_review`, `reviewed`, `promoted`, `rejected`, `duplicate` |
| `assigned_to` | no | string | Reviewer |
| `reviewed_by` | no | string | Reviewer who resolved it |
| `reviewed_at` | no | datetime | Resolution timestamp |
| `decision_notes` | no | string | Human-readable decision rationale |

## `Stock`

Derived inventory estimate. This is not direct truth and should be recomputable from `Purchases`, decay rules, and manual overrides.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `stock_id` | yes | string | Stable derived row ID, often based on item + household |
| `canonical_item_id` | yes | string | Stable canonical item ID |
| `canonical_item_name` | yes | string | Human-readable item name |
| `category_primary` | yes | string | Primary category |
| `storage_area` | no | enum | `pantry`, `fridge`, `freezer`, `household`, `unknown` |
| `last_purchased_at` | no | datetime | Last known purchase date |
| `last_purchase_quantity_value` | no | decimal | Last known quantity |
| `last_purchase_quantity_unit` | no | string | Last known unit |
| `purchase_count_window` | no | integer | Purchases in recent evaluation window |
| `estimated_state` | yes | enum | `none`, `low`, `available`, `stocked`, `unknown` |
| `estimated_days_remaining` | no | integer | Coarse estimate, not exact truth |
| `confidence` | no | decimal | Estimate confidence 0.0-1.0 |
| `decay_rule_id` | no | string | Rule used to compute state |
| `manual_override_state` | no | enum | Optional human override |
| `manual_override_until` | no | datetime | Optional override expiry |
| `computed_at` | yes | datetime | Computation timestamp |
| `rationale` | yes | string | Explanation for recommendation/debugging |

## `Budget_Export`

Derived monthly/category rollup for external budget spreadsheets.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `budget_export_id` | yes | string | Stable export row ID |
| `period_start` | yes | date | First day of budget period |
| `period_end` | yes | date | Last day of budget period |
| `budget_category` | yes | string | External budget category |
| `source_category_primary` | yes | string | Internal source category |
| `source_category_secondary` | no | string | Internal source subcategory |
| `merchant_normalized` | no | string | Optional merchant grouping |
| `amount` | yes | decimal | Total amount |
| `currency` | yes | string | Default `CAD` |
| `purchase_count` | no | integer | Number of included purchase rows |
| `generated_at` | yes | datetime | Export generation timestamp |
| `source_filter_notes` | no | string | Notes about included/excluded records |

## Derived data rule

Derived views may be deleted and regenerated. If a human wants to correct derived output, capture that as an override or correction input rather than editing generated values directly.
