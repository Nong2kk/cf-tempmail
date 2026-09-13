-- tempmail-db (beee7b73-5a7b-461e-bbbf-f888e456dcab) — schema as read from sqlite_master on 2026-09-13
-- Internal tables omitted: _cf_KV, sqlite_sequence

CREATE TABLE emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  subject TEXT,
  from_email TEXT,
  body TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_email ON emails(email);
