#!/usr/bin/env python3
"""Normalize ONLY the CI-generated synthetic Wrangler SQL export for replay.

This is not an approved production data migration or backup mechanism.
Real household data must not be supplied to this script or GitHub CI.
"""
import re
import sqlite3
import sys
from pathlib import Path

TABLE_ORDER = (
    "d1_migrations",
    "receipt_evidence",
    "receipt_extraction_envelopes",
    "import_raw_rows",
    "purchase_candidates",
    "purchases",
    "audit_events",
    "review_events",
    "duplicate_events",
)
REQUIRED = set(TABLE_ORDER) - {"d1_migrations"}
CREATE_TABLE = re.compile(r'^CREATE TABLE\s+(?:"([^"]+)"|([a-zA-Z_][\w]*))\s*\(', re.I)
INSERT = re.compile(r'^INSERT INTO\s+(?:"([^"]+)"|([a-zA-Z_][\w]*))\s', re.I)
INDEX = re.compile(r"^CREATE (?:UNIQUE )?INDEX\s", re.I)
TRIGGER = re.compile(r"^CREATE TRIGGER\s", re.I)


def normalize(source: Path, destination: Path) -> None:
    if not source.is_file() or source.stat().st_size == 0:
        raise ValueError("missing synthetic export")
    original = sqlite3.connect(":memory:")
    original.execute("PRAGMA foreign_keys = OFF")
    original.executescript(source.read_text(encoding="utf-8"))
    original.execute("PRAGMA foreign_keys = ON")
    if original.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise ValueError("source integrity check failed")
    if original.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("source foreign key check failed")

    tables, rows, indexes, triggers = {}, {}, [], []
    for statement in original.iterdump():
        statement = statement.strip()
        if statement in ("BEGIN TRANSACTION;", "COMMIT;",
                         'DELETE FROM "sqlite_sequence";'):
            # SQLite internally tracks AUTOINCREMENT next IDs. Explicit
            # restored migration IDs rebuild the sequence automatically.
            continue
        table = CREATE_TABLE.match(statement)
        insert = INSERT.match(statement)
        if table:
            name = table.group(1) or table.group(2)
            if name not in TABLE_ORDER or name in tables:
                raise ValueError("unknown or duplicate export table")
            tables[name] = statement
        elif insert:
            name = insert.group(1) or insert.group(2)
            if name == "sqlite_sequence":
                # Never replay internal sequence rows; explicit IDs restore
                # the maximum counters, preserving future insert uniqueness.
                continue
            if name not in TABLE_ORDER:
                raise ValueError("unknown data table")
            rows.setdefault(name, []).append(statement)
        elif INDEX.match(statement):
            indexes.append(statement)
        elif TRIGGER.match(statement):
            triggers.append(statement)
        else:
            raise ValueError("unexpected export statement type")

    if not REQUIRED.issubset(tables):
        raise ValueError("missing expected schema")
    ordered = (
        [tables[name] for name in TABLE_ORDER if name in tables]
        + indexes
        + [statement for name in TABLE_ORDER for statement in rows.get(name, ())]
        + triggers
    )
    result = "\n".join(stmt.rstrip(";") + ";" for stmt in ordered) + "\n"

    # Independent SQLite check before involving D1. This checks that the dump
    # can be replayed with foreign keys ON, and does not silently omit triggers.
    restored = sqlite3.connect(":memory:")
    restored.execute("PRAGMA foreign_keys = ON")
    restored.executescript(result)
    if restored.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise ValueError("restore integrity check failed")
    if restored.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("restore foreign key check failed")
    for table in REQUIRED:
        source_count = original.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        target_count = restored.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        if source_count != target_count:
            raise ValueError("restore row count mismatch")
    if not restored.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'purchases_reject_update'"
    ).fetchone():
        raise ValueError("purchase immutability guard not restored")
    destination.write_text(result, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: normalize-synthetic-d1-export.py SOURCE.sql OUTPUT.sql")
    try:
        normalize(Path(sys.argv[1]), Path(sys.argv[2]))
    except ValueError as error:
        # All ValueError messages above are controlled categories, not SQL data.
        sys.exit("d1-restore: synthetic normalization rejected: " + str(error))
    except (OSError, sqlite3.DatabaseError) as error:
        # Do not print exception content (which can include SQL fragments).
        code = getattr(error, "sqlite_errorname", None)
        sys.exit("d1-restore: synthetic normalization rejected: " +
                 str(code if code else type(error).__name__))
    print("d1-restore: synthetic SQL order and SQLite integrity verified")
