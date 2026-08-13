import { Database } from 'bun:sqlite';

// Bun auto-loads .env from CWD, but the server runs from server/ while .env
// is in the project root. Load it manually if ZAI_API_KEY isn't set.
if (!process.env.ZAI_API_KEY) {
  try {
    const envText = await Bun.file('../.env').text();
    for (const line of envText.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const db = new Database('collective.db', { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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
  annotation_id TEXT REFERENCES annotations(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL DEFAULT 'annotation',
  title TEXT,
  body TEXT,
  image_url TEXT,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 260,
  height REAL,
  created_by TEXT NOT NULL DEFAULT 'you',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_doc ON canvas_nodes(document_id);
CREATE INDEX IF NOT EXISTS idx_canvas_ann ON canvas_nodes(annotation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_ann_unique ON canvas_nodes(document_id, annotation_id) WHERE annotation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS canvas_edges (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_by TEXT NOT NULL DEFAULT 'you',
  created_at TEXT NOT NULL,
  UNIQUE(document_id, source_node_id, target_node_id)
);
CREATE INDEX IF NOT EXISTS idx_edge_doc ON canvas_edges(document_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_node ON ai_conversations(node_id);
`);

// Migrations for existing DBs
try { db.exec('ALTER TABLE annotations ADD COLUMN selector_start INTEGER'); } catch {}
try { db.exec('ALTER TABLE annotations ADD COLUMN selector_end INTEGER'); } catch {}
// Migrate canvas_nodes: add node_type, title, body columns if they don't exist
try { db.exec("ALTER TABLE canvas_nodes ADD COLUMN node_type TEXT NOT NULL DEFAULT 'annotation'"); } catch {}
try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN title TEXT'); } catch {}
try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN body TEXT'); } catch {}
try { db.exec('ALTER TABLE canvas_nodes ADD COLUMN image_url TEXT'); } catch {}
// Migrate canvas_edges: add source_node_id / target_node_id if they don't exist
try { db.exec('ALTER TABLE canvas_edges ADD COLUMN source_node_id TEXT'); } catch {}
try { db.exec('ALTER TABLE canvas_edges ADD COLUMN target_node_id TEXT'); } catch {}

// Backfill: copy old annotation-based edge columns to node-based columns
try {
  db.exec(`UPDATE canvas_edges SET source_node_id = (
    SELECT id FROM canvas_nodes WHERE canvas_nodes.annotation_id = canvas_edges.source_annotation_id
    AND canvas_nodes.document_id = canvas_edges.document_id
  ) WHERE source_node_id IS NULL AND source_annotation_id IS NOT NULL`);
  db.exec(`UPDATE canvas_edges SET target_node_id = (
    SELECT id FROM canvas_nodes WHERE canvas_nodes.annotation_id = canvas_edges.target_annotation_id
    AND canvas_nodes.document_id = canvas_edges.document_id
  ) WHERE target_node_id IS NULL AND target_annotation_id IS NOT NULL`);
} catch {}

// Clean up orphaned replies (replies whose parent was deleted before foreign
// keys were enabled). This prevents ghost "Reply" nodes from appearing.
try {
  db.exec(`DELETE FROM annotations WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM annotations)`);
} catch {}

export default db;
