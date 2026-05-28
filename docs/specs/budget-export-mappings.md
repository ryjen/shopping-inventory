# Budget Export Mappings and Categories

Budget exports translate authoritative purchases into clean monthly/category rollups for an external budget spreadsheet.

## Goals

- Use `Purchases` as the source of truth
- Export stable category rollups
- Avoid coupling budget reports to raw OCR/import data
- Preserve enough traceability to debug totals
- Keep categories practical rather than overly precise

## Non-goals

- Replace a full budgeting system
- Export every raw purchase line by default
- Infer financial advice
- Treat unreviewed raw imports as budget truth

## Export model

```mermaid
flowchart LR
  Purchases[Purchases ledger] --> Map[Budget category mapping]
  Map --> Rollup[Monthly/category rollup]
  Rollup --> Export[Budget_Export]
  Export --> BudgetSheet[External budget spreadsheet]
```

## Recommended internal purchase categories

| Internal category | Examples |
| --- | --- |
| `groceries.produce` | fruit, vegetables, herbs |
| `groceries.dairy_eggs` | milk, cheese, yogurt, eggs |
| `groceries.meat_seafood` | meat, poultry, fish |
| `groceries.pantry` | dry goods, canned goods, oils, spices |
| `groceries.frozen` | frozen vegetables, frozen meals |
| `groceries.snacks` | chips, chocolate, treats |
| `groceries.beverages` | coffee, tea, juice, soda |
| `household.cleaning` | detergent, dish soap, cleaners |
| `household.paper_goods` | toilet paper, paper towels, tissues |
| `household.kitchen` | bags, foil, wraps, kitchen consumables |
| `pet.food` | cat/dog food, treats |
| `pet.supplies` | litter, bags, grooming supplies |
| `personal_care` | toiletries and grooming basics |
| `pharmacy_basics` | over-the-counter basics and first aid |
| `misc_retail` | unmatched household retail |
| `excluded` | intentionally excluded rows |

## Suggested external budget categories

| External budget category | Internal categories included |
| --- | --- |
| `Groceries` | `groceries.*` |
| `Household Supplies` | `household.*` |
| `Pet Supplies` | `pet.*` |
| `Personal Care` | `personal_care` |
| `Pharmacy / Health Basics` | `pharmacy_basics` |
| `Misc Retail` | `misc_retail` |

## Mapping table

A future `Budget_Mapping` reference tab may use:

| Column | Description |
| --- | --- |
| `mapping_id` | Stable mapping ID |
| `category_primary` | Internal primary category |
| `category_secondary` | Internal secondary category or wildcard |
| `budget_category` | External category name |
| `include_by_default` | Boolean |
| `rollup_level` | `detail`, `category`, `summary`, `excluded` |
| `notes` | Rationale |

## Export rules

1. Include only `Purchases` rows with reviewed/promoted state
2. Exclude raw imports that were not promoted
3. Group by budget period and external budget category
4. Preserve purchase count and generation timestamp
5. Add notes when rows are excluded or grouped specially
6. Default to category rollups, not raw line-item export

## Period handling

Recommended MVP:

- monthly rollups
- local timezone based on household/user locale
- `period_start` as first day of month
- `period_end` as last day of month

## Tax and discounts

Initial MVP can use line net price when available.

If tax/discount allocation is unclear:

- preserve raw values
- avoid inventing exact line-level tax
- optionally add unallocated tax/discount as separate summary row

## Debugging totals

Budget export rows should include:

- purchase count
- generated timestamp
- source filter notes
- optional merchant grouping

Do not require raw evidence in the external budget sheet unless explicitly needed.

## Failure modes

- exporting unreviewed OCR mistakes
- category explosion that makes budgeting noisy
- hiding excluded rows without notes
- double-counting order imports and receipt imports
- allocating tax/discount with false precision

## MVP recommendation

Start with coarse categories and monthly rollups. Add detail only where it helps budgeting decisions.
