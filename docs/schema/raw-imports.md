# Raw Import Schemas

Raw import sheets preserve evidence. They are append-only and should not be destructively edited by automation.

## `Import_Raw`

Receipt OCR / extraction inbox. One row should represent one extracted receipt line, not an entire receipt.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `import_id` | yes | string | Stable ID for this raw import row |
| `receipt_id` | yes | string | Stable ID grouping rows from the same receipt |
| `source_type` | yes | enum | Usually `receipt_photo` |
| `source_uri` | no | string | Link or reference to source image/file when available |
| `merchant_raw` | no | string | Merchant text as extracted |
| `merchant_normalized` | no | string | Best-effort merchant normalization |
| `purchased_at_raw` | no | string | Raw date/time text |
| `purchased_at` | no | datetime | Normalized purchase timestamp |
| `line_number` | yes | integer | Line position within receipt extraction |
| `raw_line_text` | yes | string | Raw OCR/extracted line text |
| `item_text_raw` | no | string | Extracted item name/description |
| `quantity_raw` | no | string | Raw quantity text |
| `unit_raw` | no | string | Raw unit text |
| `price_raw` | no | string | Raw price text |
| `price_amount` | no | decimal | Parsed item price |
| `currency` | no | string | ISO-like currency code, default `CAD` |
| `tax_raw` | no | string | Raw tax marker or amount if available |
| `discount_raw` | no | string | Raw discount marker or amount if available |
| `extractor` | yes | string | Tool/model/workflow that produced the extraction |
| `extracted_at` | yes | datetime | Extraction timestamp |
| `ocr_confidence` | no | decimal | OCR confidence 0.0-1.0 |
| `parse_confidence` | no | decimal | Structured parse confidence 0.0-1.0 |
| `ambiguity_notes` | no | string | Human-readable uncertainty notes |
| `raw_payload_ref` | no | string | Reference to full JSON/text payload if stored elsewhere |
| `dedupe_key` | no | string | Deterministic key for duplicate detection |
| `review_state` | yes | enum | Default `new` |

## `Orders_Raw`

Email and ecommerce order import inbox. One row should represent one order line item.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `order_import_id` | yes | string | Stable ID for this raw order row |
| `order_id` | yes | string | Source order identifier when available |
| `source_type` | yes | enum | Usually `email_receipt` or `ecommerce_order` |
| `source_system` | no | string | Gmail, Amazon, Instacart, etc. |
| `source_uri` | no | string | Link/reference to email/order |
| `merchant_raw` | no | string | Merchant text as extracted |
| `merchant_normalized` | no | string | Best-effort normalized merchant |
| `ordered_at_raw` | no | string | Raw order date text |
| `ordered_at` | no | datetime | Normalized order timestamp |
| `delivered_at` | no | datetime | Delivery timestamp if known |
| `item_text_raw` | yes | string | Raw item name from order/email |
| `quantity_raw` | no | string | Raw quantity text |
| `unit_raw` | no | string | Raw unit text |
| `price_amount` | no | decimal | Parsed item price |
| `currency` | no | string | Default `CAD` |
| `category_hint_raw` | no | string | Category hint from source if available |
| `extractor` | yes | string | Tool/model/workflow that produced the import |
| `extracted_at` | yes | datetime | Extraction timestamp |
| `parse_confidence` | no | decimal | Parse confidence 0.0-1.0 |
| `ambiguity_notes` | no | string | Uncertainty notes |
| `dedupe_key` | no | string | Deterministic key for duplicate detection |
| `review_state` | yes | enum | Default `new` |

## `Deals_Raw`

Raw flyer, promo, email, and web deal captures. These are not purchases.

| Column | Required | Type | Description |
| --- | --- | --- | --- |
| `deal_import_id` | yes | string | Stable ID for raw deal row |
| `source_type` | yes | enum | `flyer`, `email_receipt`, `manual_entry`, etc. |
| `source_system` | no | string | Merchant, flyer site, email source |
| `source_uri` | no | string | Link/reference to source |
| `merchant_raw` | no | string | Raw merchant/store text |
| `merchant_normalized` | no | string | Normalized merchant/store |
| `item_text_raw` | yes | string | Raw deal item text |
| `deal_price_amount` | no | decimal | Advertised price |
| `currency` | no | string | Default `CAD` |
| `unit_raw` | no | string | Raw unit/size text |
| `effective_start_at` | no | datetime | Deal start date |
| `effective_end_at` | no | datetime | Deal end date |
| `conditions_raw` | no | string | Limits, coupons, membership requirements |
| `extractor` | yes | string | Tool/model/workflow that captured the deal |
| `extracted_at` | yes | datetime | Capture timestamp |
| `parse_confidence` | no | decimal | Parse confidence 0.0-1.0 |
| `ambiguity_notes` | no | string | Uncertainty notes |
| `review_state` | yes | enum | Default `new` |

## Append-only rule

Rows may be annotated with review state, but raw OCR/order/deal evidence should not be rewritten. Corrections should be represented downstream in review, alias, purchase, or override records.
