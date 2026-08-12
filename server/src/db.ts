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
  selector_start INTEGER,
  selector_end INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  parent_id TEXT REFERENCES annotations(id) ON DELETE CASCADE,
  provenance TEXT NOT NULL DEFAULT 'human',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_doc ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_ann_parent ON annotations(parent_id);

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 260,
  height REAL,
  created_by TEXT NOT NULL DEFAULT 'you',
  created_at TEXT NOT NULL,
  UNIQUE(document_id, annotation_id)
);
CREATE INDEX IF NOT EXISTS idx_canvas_doc ON canvas_nodes(document_id);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  target_annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  label TEXT,
  created_by TEXT NOT NULL DEFAULT 'you',
  created_at TEXT NOT NULL,
  UNIQUE(document_id, source_annotation_id, target_annotation_id)
);
CREATE INDEX IF NOT EXISTS idx_edge_doc ON canvas_edges(document_id);
`);

// Migration: add position columns if they don't exist (for existing DBs)
try { db.exec('ALTER TABLE annotations ADD COLUMN selector_start INTEGER'); } catch {}
try { db.exec('ALTER TABLE annotations ADD COLUMN selector_end INTEGER'); } catch {}

export default db;
