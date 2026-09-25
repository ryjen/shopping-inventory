PRAGMA foreign_keys = ON;

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN transaction_fingerprint TEXT;

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN duplicate_state TEXT NOT NULL DEFAULT 'clear' CHECK (
    duplicate_state IN ('clear', 'needs_review', 'distinct', 'confirmed_duplicate')
  );

ALTER TABLE receipt_extraction_envelopes
  ADD COLUMN duplicate_version INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_version >= 0);

CREATE INDEX idx_receipt_extraction_transaction_fingerprint
  ON receipt_extraction_envelopes(transaction_fingerprint);

CREATE TABLE duplicate_events (
  event_id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'automation', 'system')),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0),
  from_state TEXT NOT NULL CHECK (from_state = 'needs_review'),
  to_state TEXT NOT NULL CHECK (to_state IN ('distinct', 'confirmed_duplicate')),
  reason_code TEXT,
  correlation_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) AND json_type(metadata_json) = 'object'
  ),
  FOREIGN KEY (envelope_id) REFERENCES receipt_extraction_envelopes(envelope_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  UNIQUE (envelope_id, sequence)
);

CREATE INDEX idx_duplicate_events_envelope
  ON duplicate_events(envelope_id, sequence);

CREATE INDEX idx_duplicate_events_actor
  ON duplicate_events(actor_kind, actor_id, occurred_at);

-- Replace the earlier blanket envelope-update prohibition with a narrower
-- evidence-immutability boundary. Only duplicate_state/duplicate_version are
-- mutable, and those fields are guarded below.
DROP TRIGGER IF EXISTS receipt_extraction_envelopes_reject_update;

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
BEGIN
  SELECT RAISE(ABORT, 'receipt extraction evidence fields are immutable');
END;

-- A fingerprint collision is only a review signal. It may transition clear to
-- needs_review automatically, but can never select a duplicate verdict.
CREATE TRIGGER receipt_extraction_flag_transaction_collision
AFTER INSERT ON receipt_extraction_envelopes
WHEN NEW.transaction_fingerprint IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM receipt_extraction_envelopes prior
    WHERE prior.transaction_fingerprint = NEW.transaction_fingerprint
      AND prior.envelope_id <> NEW.envelope_id
  )
BEGIN
  UPDATE receipt_extraction_envelopes
  SET duplicate_state = 'needs_review'
  WHERE envelope_id = NEW.envelope_id;
END;

CREATE TRIGGER receipt_extraction_duplicate_projection_guard
BEFORE UPDATE OF duplicate_state, duplicate_version ON receipt_extraction_envelopes
WHEN NEW.duplicate_state IS NOT OLD.duplicate_state
  OR NEW.duplicate_version IS NOT OLD.duplicate_version
BEGIN
  SELECT CASE
    WHEN NOT (
      (
        OLD.duplicate_state = 'clear'
        AND NEW.duplicate_state = 'needs_review'
        AND NEW.duplicate_version = OLD.duplicate_version
        AND NEW.transaction_fingerprint IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM receipt_extraction_envelopes prior
          WHERE prior.transaction_fingerprint = NEW.transaction_fingerprint
            AND prior.envelope_id <> OLD.envelope_id
        )
      )
      OR
      (
        OLD.duplicate_state = 'needs_review'
        AND NEW.duplicate_state IN ('distinct', 'confirmed_duplicate')
        AND NEW.duplicate_version = OLD.duplicate_version + 1
        AND EXISTS (
          SELECT 1
          FROM duplicate_events event
          WHERE event.envelope_id = OLD.envelope_id
            AND event.sequence = NEW.duplicate_version
            AND event.from_state = OLD.duplicate_state
            AND event.to_state = NEW.duplicate_state
        )
      )
    )
    THEN RAISE(ABORT, 'duplicate state must be collision- or event-projected')
  END;
END;

CREATE TRIGGER duplicate_events_validate_transition
BEFORE INSERT ON duplicate_events
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    )
    THEN RAISE(ABORT, 'duplicate review target envelope does not exist')
  END;

  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT duplicate_version + 1
      FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    )
    THEN RAISE(ABORT, 'duplicate review sequence mismatch')
  END;

  SELECT CASE
    WHEN NEW.from_state <> (
      SELECT duplicate_state
      FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    )
    THEN RAISE(ABORT, 'duplicate review from_state mismatch')
  END;

  SELECT CASE
    WHEN (
      SELECT duplicate_state
      FROM receipt_extraction_envelopes
      WHERE envelope_id = NEW.envelope_id
    ) <> 'needs_review'
    THEN RAISE(ABORT, 'duplicate review requires needs_review state')
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

CREATE TRIGGER duplicate_events_reject_update
BEFORE UPDATE ON duplicate_events
BEGIN
  SELECT RAISE(ABORT, 'duplicate events are append-only');
END;

CREATE TRIGGER duplicate_events_reject_delete
BEFORE DELETE ON duplicate_events
BEGIN
  SELECT RAISE(ABORT, 'duplicate events are append-only');
END;

-- Candidate approval is an authority transition. An unresolved or confirmed
-- transaction duplicate may retain evidence/candidates but cannot become an
-- authoritative acquisition.
CREATE TRIGGER review_events_block_duplicate_candidate_approval
BEFORE INSERT ON review_events
WHEN NEW.target_kind = 'purchase_candidate'
  AND NEW.to_state = 'approved'
  AND EXISTS (
    SELECT 1
    FROM purchase_candidates candidate
    JOIN import_raw_rows raw
      ON raw.import_id = candidate.source_import_id
    JOIN receipt_extraction_envelopes envelope
      ON envelope.envelope_id = raw.envelope_id
    WHERE candidate.candidate_id = NEW.target_id
      AND envelope.duplicate_state IN ('needs_review', 'confirmed_duplicate')
  )
BEGIN
  SELECT RAISE(ABORT, 'duplicate review must permit candidate approval');
END;

-- Defense in depth for direct SQL/alternate writers: even an approved candidate
-- cannot be promoted while the owning envelope is unresolved/confirmed duplicate.
CREATE TRIGGER purchases_block_duplicate_promotion
BEFORE INSERT ON purchases
WHEN EXISTS (
  SELECT 1
  FROM purchase_candidates candidate
  JOIN import_raw_rows raw
    ON raw.import_id = candidate.source_import_id
  JOIN receipt_extraction_envelopes envelope
    ON envelope.envelope_id = raw.envelope_id
  WHERE candidate.candidate_id = NEW.source_candidate_id
    AND envelope.duplicate_state IN ('needs_review', 'confirmed_duplicate')
)
BEGIN
  SELECT RAISE(ABORT, 'duplicate review blocks authoritative purchase promotion');
END;

-- Re-normalizing one immutable raw row creates another immutable candidate. If
-- that raw evidence already has a current effective Purchase, the new Purchase
-- must correct it through the existing supersession chain rather than create a
-- parallel acquisition.
CREATE TRIGGER purchases_require_reprocessing_supersession
BEFORE INSERT ON purchases
WHEN EXISTS (
  SELECT 1
  FROM purchase_candidates new_candidate
  JOIN purchase_candidates prior_candidate
    ON prior_candidate.source_import_id = new_candidate.source_import_id
   AND prior_candidate.candidate_id <> new_candidate.candidate_id
  JOIN purchases prior_purchase
    ON prior_purchase.source_candidate_id = prior_candidate.candidate_id
  WHERE new_candidate.candidate_id = NEW.source_candidate_id
    AND NOT EXISTS (
      SELECT 1
      FROM purchases successor
      WHERE successor.supersedes_id = prior_purchase.purchase_id
    )
    AND (
      NEW.supersedes_id IS NULL
      OR NEW.supersedes_id <> prior_purchase.purchase_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'reprocessed raw evidence must supersede current purchase');
END;
