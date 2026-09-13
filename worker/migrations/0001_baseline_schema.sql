-- Migration number: 0001 	 2026-09-14
-- Baseline schema, identical to production `tempmail-db` as of 2026-09-13.
-- Production ALREADY has these objects. This file exists so that:
--   * `wrangler dev` can create an identical local database, and
--   * `wrangler d1 migrations apply --remote` can be told to skip it
--     (see README: mark 0001 as applied without executing).
-- It is idempotent, so applying it to production would be a no-op.

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  subject TEXT,
  from_email TEXT,
  body TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_email ON emails(email);
