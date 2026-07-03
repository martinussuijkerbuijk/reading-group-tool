import { Database } from 'bun:sqlite';

const db = new Database('collective.db', { create: true });
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_filename TEXT,
  html TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES groups(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id),
  creator TEXT NOT NULL,
  body_type TEXT NOT NULL,
  body_value TEXT NOT NULL,
  selector_exact TEXT NOT NULL,
  selector_prefix TEXT,
  selector_suffix TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  parent_id TEXT REFERENCES annotations(id) ON DELETE CASCADE,
  provenance TEXT NOT NULL DEFAULT 'human',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_doc ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_ann_parent ON annotations(parent_id);
`);

export default db;
