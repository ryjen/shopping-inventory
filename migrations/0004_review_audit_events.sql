PRAGMA foreign_keys = ON;

-- Review state is an event projection. Existing rows start at version 0; all
-- subsequent state changes must be driven by append-only review_events.
ALTER TABLE import_raw_rows
  ADD COLUMN review_version INTEGER NOT NULL DEFAULT 0 CHECK (review_version >= 0);

ALTER TABLE purchase_candidates
  ADD COLUMN review_version INTEGER NOT NULL DEFAULT 0 CHECK (review_version >= 0);

-- Persistence-only attribution for authoritative promotions/corrections.
ALTER TABLE purchases ADD COLUMN actor_id TEXT;
ALTER TABLE purchases ADD COLUMN actor_kind TEXT CHECK (
  actor_kind IS NULL OR actor_kind IN ('user', 'automation', 'system')
);
ALTER TABLE purchases ADD COLUMN correlation_id TEXT;

-- Existing ingestion audit rows default to automation. Future writers may
-- identify user/system actors explicitly.
ALTER TABLE audit_events
  ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'automation' CHECK (
    actor_kind IN ('user', 'automation', 'system')
  );
ALTER TABLE audit_events ADD COLUMN correlation_id TEXT;

CREATE TABLE review_events (
  event_id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (
    target_kind IN ('import_raw_row', 'purchase_candidate')
  ),
  target_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  actor_kind TEXT NOT NULL CHECK (
    actor_kind IN ('user', 'automation', 'system')
  ),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  from_state TEXT NOT NULL CHECK (
    from_state IN ('new', 'needs_review', 'approved', 'rejected', 'superseded')
  ),
  to_state TEXT NOT NULL CHECK (
    to_state IN ('new', 'needs_review', 'approved', 'rejected', 'superseded')
  ),
  reason_code TEXT,
  correlation_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) AND json_type(metadata_json) = 'object'
  ),
  UNIQUE (target_kind, target_id, sequence)
);

CREATE INDEX idx_review_events_target
  ON review_events(target_kind, target_id, sequence);

CREATE INDEX idx_review_events_actor
  ON review_events(actor_kind, actor_id, occurred_at);

-- New raw evidence always starts as unreviewed.
CREATE TRIGGER import_raw_rows_require_initial_review_state
BEFORE INSERT ON import_raw_rows
WHEN NEW.review_state <> 'new' OR NEW.review_version <> 0
BEGIN
  SELECT RAISE(ABORT, 'raw evidence must start at review_state=new version=0');
END;

-- New normalization candidates always require an explicit decision.
CREATE TRIGGER purchase_candidates_require_initial_review_state
BEFORE INSERT ON purchase_candidates
WHEN NEW.review_state <> 'needs_review' OR NEW.review_version <> 0
BEGIN
  SELECT RAISE(ABORT, 'purchase candidates must start at needs_review version=0');
END;

CREATE TRIGGER review_events_validate_raw_transition
BEFORE INSERT ON review_events
WHEN NEW.target_kind = 'import_raw_row'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM import_raw_rows WHERE import_id = NEW.target_id
    ) THEN RAISE(ABORT, 'review target raw row does not exist')
  END;

  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT review_version + 1 FROM import_raw_rows WHERE import_id = NEW.target_id
    ) THEN RAISE(ABORT, 'raw review sequence mismatch')
  END;

  SELECT CASE
    WHEN NEW.from_state <> (
      SELECT review_state FROM import_raw_rows WHERE import_id = NEW.target_id
    ) THEN RAISE(ABORT, 'raw review from_state mismatch')
  END;

  SELECT CASE
    WHEN NOT (
      (NEW.from_state = 'new' AND NEW.to_state IN ('needs_review', 'approved', 'rejected')) OR
      (NEW.from_state = 'needs_review' AND NEW.to_state IN ('approved', 'rejected'))
    ) THEN RAISE(ABORT, 'invalid raw review transition')
  END;
END;

CREATE TRIGGER review_events_validate_candidate_transition
BEFORE INSERT ON review_events
WHEN NEW.target_kind = 'purchase_candidate'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_candidates WHERE candidate_id = NEW.target_id
    ) THEN RAISE(ABORT, 'review target candidate does not exist')
  END;

  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT review_version + 1 FROM purchase_candidates WHERE candidate_id = NEW.target_id
    ) THEN RAISE(ABORT, 'candidate review sequence mismatch')
  END;

  SELECT CASE
    WHEN NEW.from_state <> (
      SELECT review_state FROM purchase_candidates WHERE candidate_id = NEW.target_id
    ) THEN RAISE(ABORT, 'candidate review from_state mismatch')
  END;

  SELECT CASE
    WHEN NOT (
      NEW.from_state = 'needs_review' AND
      NEW.to_state IN ('approved', 'rejected')
    ) THEN RAISE(ABORT, 'invalid candidate review transition')
  END;
END;

-- Direct state changes cannot bypass the append-only event history.
CREATE TRIGGER import_raw_rows_review_projection_guard
BEFORE UPDATE OF review_state, review_version ON import_raw_rows
WHEN NEW.review_state IS NOT OLD.review_state
  OR NEW.review_version IS NOT OLD.review_version
BEGIN
  SELECT CASE
    WHEN NEW.review_version <> OLD.review_version + 1
      OR NOT EXISTS (
        SELECT 1
        FROM review_events
        WHERE target_kind = 'import_raw_row'
          AND target_id = OLD.import_id
          AND sequence = NEW.review_version
          AND from_state = OLD.review_state
          AND to_state = NEW.review_state
      )
    THEN RAISE(ABORT, 'raw review state must be projected from review_events')
  END;
END;

CREATE TRIGGER purchase_candidates_review_projection_guard
BEFORE UPDATE OF review_state, review_version ON purchase_candidates
WHEN NEW.review_state IS NOT OLD.review_state
  OR NEW.review_version IS NOT OLD.review_version
BEGIN
  SELECT CASE
    WHEN NEW.review_version <> OLD.review_version + 1
      OR NOT EXISTS (
        SELECT 1
        FROM review_events
        WHERE target_kind = 'purchase_candidate'
          AND target_id = OLD.candidate_id
          AND sequence = NEW.review_version
          AND from_state = OLD.review_state
          AND to_state = NEW.review_state
      )
    THEN RAISE(ABORT, 'candidate review state must be projected from review_events')
  END;
END;

CREATE TRIGGER review_events_apply_raw_transition
AFTER INSERT ON review_events
WHEN NEW.target_kind = 'import_raw_row'
BEGIN
  UPDATE import_raw_rows
  SET review_state = NEW.to_state,
      review_version = NEW.sequence
  WHERE import_id = NEW.target_id;
END;

CREATE TRIGGER review_events_apply_candidate_transition
AFTER INSERT ON review_events
WHEN NEW.target_kind = 'purchase_candidate'
BEGIN
  UPDATE purchase_candidates
  SET review_state = NEW.to_state,
      review_version = NEW.sequence
  WHERE candidate_id = NEW.target_id;
END;

-- Raw extraction payloads and line evidence are immutable. Workflow state is
-- the only mutable part of import_raw_rows, and it is guarded above.
CREATE TRIGGER receipt_extraction_envelopes_reject_update
BEFORE UPDATE ON receipt_extraction_envelopes
BEGIN
  SELECT RAISE(ABORT, 'receipt extraction evidence is immutable');
END;

CREATE TRIGGER import_raw_rows_reject_evidence_update
BEFORE UPDATE ON import_raw_rows
WHEN NEW.import_id IS NOT OLD.import_id
  OR NEW.envelope_id IS NOT OLD.envelope_id
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.record_kind IS NOT OLD.record_kind
  OR NEW.line_id IS NOT OLD.line_id
  OR NEW.source_type IS NOT OLD.source_type
  OR NEW.source_id IS NOT OLD.source_id
  OR NEW.evidence_id IS NOT OLD.evidence_id
  OR NEW.line_number IS NOT OLD.line_number
  OR NEW.line_type IS NOT OLD.line_type
  OR NEW.raw_text IS NOT OLD.raw_text
  OR NEW.quantity IS NOT OLD.quantity
  OR NEW.unit IS NOT OLD.unit
  OR NEW.unit_price IS NOT OLD.unit_price
  OR NEW.extended_price IS NOT OLD.extended_price
  OR NEW.parse_confidence IS NOT OLD.parse_confidence
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'raw evidence fields are immutable');
END;

-- Candidate interpretation is immutable after creation. Review state changes
-- are represented by review_events; changed normalization creates a new
-- candidate rather than rewriting provenance.
CREATE TRIGGER purchase_candidates_reject_interpretation_update
BEFORE UPDATE ON purchase_candidates
WHEN NEW.candidate_id IS NOT OLD.candidate_id
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.record_kind IS NOT OLD.record_kind
  OR NEW.source_import_id IS NOT OLD.source_import_id
  OR NEW.source_line_type IS NOT OLD.source_line_type
  OR NEW.canonical_item_id IS NOT OLD.canonical_item_id
  OR NEW.quantity IS NOT OLD.quantity
  OR NEW.unit IS NOT OLD.unit
  OR NEW.amount IS NOT OLD.amount
  OR NEW.normalization_confidence IS NOT OLD.normalization_confidence
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'purchase candidate interpretation is immutable');
END;

-- Review and audit records are append-only.
CREATE TRIGGER review_events_reject_update
BEFORE UPDATE ON review_events
BEGIN
  SELECT RAISE(ABORT, 'review events are append-only');
END;

CREATE TRIGGER review_events_reject_delete
BEFORE DELETE ON review_events
BEGIN
  SELECT RAISE(ABORT, 'review events are append-only');
END;

CREATE TRIGGER audit_events_reject_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER audit_events_reject_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

-- Every new authoritative purchase must identify the actor responsible for the
-- promotion/correction. Existing rows from before this migration may remain
-- unattributed; new inserts may not.
CREATE TRIGGER purchases_require_actor
BEFORE INSERT ON purchases
WHEN NEW.actor_id IS NULL
  OR length(trim(NEW.actor_id)) = 0
  OR NEW.actor_kind IS NULL
  OR NEW.actor_kind NOT IN ('user', 'automation', 'system')
BEGIN
  SELECT RAISE(ABORT, 'authoritative purchase actor attribution is required');
END;

CREATE TRIGGER purchases_write_audit_event
AFTER INSERT ON purchases
BEGIN
  INSERT INTO audit_events (
    event_id,
    actor_id,
    action,
    target_kind,
    target_id,
    occurred_at,
    metadata_json,
    actor_kind,
    correlation_id
  )
  VALUES (
    lower(hex(randomblob(16))),
    NEW.actor_id,
    CASE
      WHEN NEW.supersedes_id IS NULL THEN 'purchase_promoted'
      ELSE 'purchase_superseded'
    END,
    'purchase',
    NEW.purchase_id,
    NEW.created_at,
    json_object(
      'source_candidate_id', NEW.source_candidate_id,
      'supersedes_id', NEW.supersedes_id
    ),
    NEW.actor_kind,
    NEW.correlation_id
  );
END;
