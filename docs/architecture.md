# Architecture

## Design philosophy

The system is intentionally conservative.

Receipts and order emails are treated as evidence of acquisition, not direct truth about current inventory.

The architecture therefore separates:

- raw evidence
- authoritative purchases
- derived inventory estimates
- recommendations and automations

This prevents OCR hallucinations or normalization mistakes from directly corrupting inventory state.

---

## High-level architecture

```mermaid
flowchart TD
  subgraph Inputs
    A[Receipt Photos]
    B[Email Receipts]
    C[Amazon Orders]
    D[Flyers / Deals]
  end

  subgraph Ingestion
    E[OCR / Extraction]
    F[Import_Raw]
    G[Orders_Raw]
    H[Deals_Raw]
  end

  subgraph Processing
    I[Normalization]
    J[Alias Resolution]
    K[Review Queue]
  end

  subgraph Ledger
    L[Purchases]
  end

  subgraph Derived
    M[Stock Estimate]
    N[Budget Export]
    O[Meal Suggestions]
    P[Shopping Planner]
  end

  A --> E
  B --> E
  C --> G
  D --> H

  E --> F
  F --> I
  G --> I
  I --> J
  J --> K
  K --> L

  L --> M
  L --> N
  L --> P
  M --> O
  M --> P
  H --> P
```

## Core tables

### Import_Raw

Append-only ingestion inbox.

Stores:

- raw receipt line
- OCR confidence
- source metadata
- timestamps
- ambiguity notes

No normalization occurs here.

### Purchases

Authoritative ledger.

Contains:

- canonical item names
- normalized quantities
- categories
- prices
- review state
- source references

### Stock

Derived estimate only.

Not directly mutated by OCR.

Recommended inventory states:

- none
- low
- available
- stocked
- unknown

### Deals_Raw

Captures:

- flyer deals
- web promotions
- email offers
- price history

### Budget_Export

Clean monthly/category rollups for external budgeting spreadsheets.

---

## AI responsibilities

### Good AI tasks

- OCR extraction
- alias matching
- category inference
- recipe suggestions
- shopping recommendations
- low-confidence review assistance
- deal matching

### Dangerous AI tasks

- exact inventory truth
- exact nutrition tracking
- destructive mutation
- silent normalization
- silent deduplication

The system should prefer uncertainty over false precision.

---

## Automation model

```mermaid
sequenceDiagram
  participant U as User
  participant AI as AI Extractor
  participant S as Google Sheets
  participant N as Normalizer
  participant P as Planner

  U->>AI: Upload receipt image
  AI->>S: Append Import_Raw rows
  N->>S: Normalize into Purchases
  P->>S: Read Purchases + Stock + Deals
  P->>U: Shopping list + meal suggestions
```

## Future evolution

### Phase 1

- Google Sheets
- Manual receipt uploads
- AI extraction
- AI normalization
- Shopping suggestions

### Phase 2

- Gmail ingestion
- Flyer/deal ingestion
- Amazon order imports
- Budget rollups
- Inventory decay logic

### Phase 3

- Supabase/Postgres backend
- APIs and web UI
- Barcode support
- Multi-user households
- Better recommendation models
- Local LLM orchestration
