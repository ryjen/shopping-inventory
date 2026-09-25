PRAGMA foreign_keys = ON;

-- Exact evidence byte identity is deterministic. Preserve only the digest in D1
-- and allow at most one active object for the same bytes.
CREATE UNIQUE INDEX idx_receipt_evidence_active_sha256
  ON receipt_evidence(source_sha256)
  WHERE source_sha256 IS NOT NULL AND deleted_at IS NULL;

-- Duplicate state is a review projection on otherwise immutable extraction evidence.
DROP TRIGGER receipt_extraction_envelopes_reject_update;

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN transaction_fingerprint TEXT CHECK (
    transaction_fingerprint IS NULL OR length(transaction_fingerprint) = 64
  );

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN duplicate_state TEXT NOT NULL DEFAULT 'clear' CHECK (
    duplicate_state IN ('clear', 'needs_review', 'confirmed_duplicate', 'distinct')
  );

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN duplicate_of_envelope_id TEXT REFERENCES receipt_extraction_envelopes(envelope_id);

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN duplicate_version INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_version >= 0);

CREATE INDEX idx_receipt_extraction_transaction_fingerprint
  ON receipt_extraction_envelopes(transaction_fingerprint, created_at);

CREATE INDEX idx_receipt_extraction_duplicate_state
  ON receipt_extraction_envelopes(duplicate_state, created_at);

CREATE TABLE duplicate_events (
  event_id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  actor_kind TEXT NOT NULL CHECK (
    actor_kind IN ('user', 'automation', 'system')
  ),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  from_state TEXT NOT NULL CHECK (
    from_state IN ('needs_review', 'confirmed_duplicate', 'distinct')
  ),
  to_state TEXT NOT NULL CHECK (
    to_state IN ('confirmed_duplicate', 'distinct')
  ),
  reason_code TEXT,
  correlation_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) AND json_type(metadata_json) = 'object'
  ),
  FOREIGN KEY (envelope_id) REFERENCES receipt_extraction_envelopes(envelope_id) ON DELETE RESTRICT,
  UNIQUE (envelope_id, sequence)
);

CREATE INDEX idx_duplicate_events_envelope
  ON duplicate_events(envelope_id, sequence);

CREATE INDEX idx_duplicate_events_actor
  ON duplicate_events(actor_kind, actor_id, occurred_at);

-- New envelopes either start clear, or are conservatively flagged against an
-- existing opaque envelope id. A duplicate decision is never accepted inline.
CREATE TRIGGER receipt_extraction_duplicate_initial_state
BEFORE INSERT ON receipt_extraction_envelopes
BEGIN
  SELECT CASE
    WHEN NEW.duplicate_version <> 0
      OR NEW.duplicate_state NOT IN ('clear', 'needs_review')
    THEN RAISE(ABORT, 'invalid initial duplicate state')
  END;

  SELECT CASE
    WHEN NEW.duplicate_state = 'clear'
      AND NEW.duplicate_of_envelope_id IS NOT NULL
    THEN RAISE(ABORT, 'clear extraction cannot reference a duplicate')
  END;

  SELECT CASE
    WHEN NEW.duplicate_state = 'needs_review'
      AND (
        NEW.transaction_fingerprint IS NULL
        OR NEW.duplicate_of_envelope_id IS NULL
        OR NEW.duplicate_of_envelope_id = NEW.envelope_id
        OR NOT EXISTS (
          SELECT 1 FROM receipt_extraction_envelopes
          WHERE envelope_id = NEW.duplicate_of_envelope_id
        )
      )
    THEN RAISE(ABORT, 'duplicate review requires an existing envelope and fingerprint')
  END;
END;

CREATE TRIGGER duplicate_events_validate_transition
BEFORE INSERT ON duplicate_events
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    ) THEN RAISE(ABORT, 'duplicate target envelope does not exist')
  END;

  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT duplicate_version + 1
      FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    ) THEN RAISE(ABORT, 'duplicate decision sequence mismatch')
  END;

  SELECT CASE
    WHEN NEW.from_state <> (
      SELECT duplicate_state
      FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    ) THEN RAISE(ABORT, 'duplicate decision from_state mismatch')
  END;

  SELECT CASE
    WHEN NEW.from_state <> 'needs_review'
      OR NEW.to_state NOT IN ('confirmed_duplicate', 'distinct')
    THEN RAISE(ABORT, 'invalid duplicate decision transition')
  END;
END;

CREATE TRIGGER receipt_extraction_duplicate_projection_guard
BEFORE UPDATE OF duplicate_state, duplicate_version ON receipt_extraction_envelopes
WHEN NEW.duplicate_state IS NOT OLD.duplicate_state
  OR NEW.duplicate_version IS NOT OLD.duplicate_version
BEGIN
  SELECT CASE
    WHEN NEW.duplicate_version <> OLD.duplicate_version + 1
      OR NOT EXISTS (
        SELECT 1
        FROM duplicate_events
        WHERE envelope_id = OLD.envelope_id
          AND sequence = NEW.duplicate_version
          AND from_state = OLD.duplicate_state
          AND to_state = NEW.duplicate_state
      )
    THEN RAISE(ABORT, 'duplicate state must be projected from duplicate_events')
  END;
END;

CREATE TRIGGER duplicate_events_apply_transition
AFTER INSERT ON duplicate_events
BEGIN
  UPDATE receipt_extraction_envelopes
  SET duplicate_state = NEW.to_state,
      duplicate_version = NEW.sequence
  WHERE envelope_id = NEW.envelope_id;
END;

-- Extraction evidence remains immutable. Only duplicate_state/version are
-- mutable, and the projection guard above constrains those changes.
CREATE TRIGGER receipt_extraction_envelopes_reject_evidence_update
BEFORE UPDATE ON receipt_extraction_envelopes
WHEN NEW.envelope_id IS NOT OLD.envelope_id
  OR NEW.schema_version IS NOT OLD.schema_version
  OR NEW.record_kind IS NOT OLD.record_kind
  OR NEW.source_type IS NOT OLD.source_type
  OR NEW.source_id IS NOT OLD.source_id
  OR NEW.evidence_id IS NOT OLD.evidence_id
  OR NEW.extractor IS NOT OLD.extractor
  OR NEW.extracted_at IS NOT OLD.extracted_at
  OR NEW.payload_json IS NOT OLD.payload_json
  OR NEW.payload_sha256 IS NOT OLD.payload_sha256
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.transaction_fingerprint IS NOT OLD.transaction_fingerprint
  OR NEW.duplicate_of_envelope_id IS NOT OLD.duplicate_of_envelope_id
BEGIN
  SELECT RAISE(ABORT, 'receipt extraction evidence is immutable');
END;

CREATE TRIGGER duplicate_events_reject_update
BEFORE UPDATE ON duplicate_events
BEGIN
  SELECT RAISE(ABORT, 'duplicate decisions are append-only');
END;

CREATE TRIGGER duplicate_events_reject_delete
BEFORE DELETE ON duplicate_events
BEGIN
  SELECT RAISE(ABORT, 'duplicate decisions are append-only');
END;

-- An unresolved or confirmed duplicate envelope cannot create a normalization
-- candidate. A reviewer must explicitly mark a false-positive as distinct.
CREATE TRIGGER purchase_candidates_reject_duplicate_risk
BEFORE INSERT ON purchase_candidates
WHEN EXISTS (
  SELECT 1
  FROM import_raw_rows raw
  JOIN receipt_extraction_envelopes envelope
    ON envelope.envelope_id = raw.envelope_id
  WHERE raw.import_id = NEW.source_import_id
    AND envelope.duplicate_state IN ('needs_review', 'confirmed_duplicate')
)
BEGIN
  SELECT RAISE(ABORT, 'duplicate-risk evidence cannot create a purchase candidate');
END;

-- Re-normalizing the same raw line may create a new immutable candidate, but if
-- that raw line already owns the current authoritative Purchase, the new
-- Purchase must supersede it rather than creating a parallel acquisition.
CREATE TRIGGER purchases_require_reprocessing_supersession
BEFORE INSERT ON purchases
WHEN EXISTS (
  SELECT 1
  FROM purchases prior
  JOIN purchase_candidates prior_candidate
    ON prior_candidate.candidate_id = prior.source_candidate_id
  WHERE prior_candidate.source_import_id = (
    SELECT source_import_id
    FROM purchase_candidates
    WHERE candidate_id = NEW.source_candidate_id
  )
    AND NOT EXISTS (
      SELECT 1 FROM purchases child
      WHERE child.supersedes_id = prior.purchase_id
    )
)
BEGIN
  SELECT CASE
    WHEN NEW.supersedes_id IS NOT (
      SELECT prior.purchase_id
      FROM purchases prior
      JOIN purchase_candidates prior_candidate
        ON prior_candidate.candidate_id = prior.source_candidate_id
      WHERE prior_candidate.source_import_id = (
        SELECT source_import_id
        FROM purchase_candidates
        WHERE candidate_id = NEW.source_candidate_id
      )
        AND NOT EXISTS (
          SELECT 1 FROM purchases child
          WHERE child.supersedes_id = prior.purchase_id
        )
      ORDER BY prior.created_at DESC
      LIMIT 1
    )
    THEN RAISE(ABORT, 'reprocessed raw evidence must supersede its current purchase')
  END;
END;
