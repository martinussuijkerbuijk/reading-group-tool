import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import db from './db.ts';
import { pdfToHtml } from './ingest.ts';
import type { Annotation, DocumentRecord, Group } from '@cr/shared';

const app = new Hono();
app.use('*', cors());

// Phase 0 identity: a single user via header, default "you". Real auth comes later.
function user(c) {
  return c.req.header('x-user') || 'you';
}

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---- Groups ----
app.get('/api/groups', (c) => {
  const rows = db.query('SELECT * FROM groups ORDER BY created_at DESC').all() as Group[];
  return c.json(rows);
});

app.post('/api/groups', async (c) => {
  const body = await c.req.json();
  const name = String(body?.name ?? '').trim();
  if (!name) return c.json({ error: 'name required' }, 400);
  const group: Group = { id: newId(), name, createdAt: now() };
  db.run('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)', [group.id, group.name, group.createdAt]);
  return c.json(group, 201);
});

// ---- Documents ----
app.get('/api/documents', (c) => {
  const groupId = c.req.query('groupId');
  const rows = groupId
    ? (db.query('SELECT id, title, source_filename, group_id, created_at FROM documents WHERE group_id = ? ORDER BY created_at DESC').all(groupId) as any[])
    : (db.query('SELECT id, title, source_filename, group_id, created_at FROM documents ORDER BY created_at DESC').all() as any[]);
  return c.json(rows.map((r) => ({
    id: r.id, title: r.title, sourceFilename: r.source_filename, groupId: r.group_id, createdAt: r.created_at,
  })));
});

app.post('/api/documents', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file') as File | null;
  const groupId = String(form.get('groupId') ?? '');
  const title = String(form.get('title') ?? '');
  if (!file || !groupId) return c.json({ error: 'file and groupId required' }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let html: string;
  let docTitle: string;
  try {
    const res = await pdfToHtml(bytes, title || file.name);
    html = res.html;
    docTitle = res.title;
  } catch (e) {
    return c.json({ error: 'PDF ingestion failed', detail: String(e) }, 422);
  }

  const doc: DocumentRecord = {
    id: newId(), title: docTitle, sourceFilename: file.name, html, groupId, createdAt: now(),
  };
  db.run(
    'INSERT INTO documents (id, title, source_filename, html, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [doc.id, doc.title, doc.sourceFilename, doc.html, doc.groupId, doc.createdAt],
  );
  const { html: _, ...meta } = doc;
  return c.json(meta, 201);
});

app.get('/api/documents/:id', (c) => {
  const row = db.query('SELECT * FROM documents WHERE id = ?').get(c.req.param('id')) as any;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({
    id: row.id, title: row.title, sourceFilename: row.source_filename,
    html: row.html, groupId: row.group_id, createdAt: row.created_at,
  } as DocumentRecord);
});

// ---- Annotations ----
function rowToAnnotation(r: any): Annotation {
  return {
    id: r.id,
    documentId: r.document_id,
    groupId: r.group_id,
    creator: r.creator,
    body: { type: r.body_type, value: r.body_value },
    target: {
      source: r.document_id,
      selector: [{
        type: 'TextQuoteSelector' as const,
        exact: r.selector_exact,
        prefix: r.selector_prefix ?? undefined,
        suffix: r.selector_suffix ?? undefined,
      }],
    },
    tags: JSON.parse(r.tags ?? '[]'),
    parentId: r.parent_id ?? null,
    provenance: r.provenance ?? 'human',
    createdAt: r.created_at,
  };
}

app.get('/api/documents/:id/annotations', (c) => {
  const rows = db.query('SELECT * FROM annotations WHERE document_id = ? ORDER BY created_at ASC').all(c.req.param('id')) as any[];
  return c.json(rows.map(rowToAnnotation));
});

app.post('/api/documents/:id/annotations', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const sel = body?.target?.selector?.[0];
  // exact may be empty for replies (which inherit the parent's target)
  if (!sel || typeof sel.exact !== 'string') return c.json({ error: 'target.selector[0].exact required' }, 400);

  const ann: Annotation = {
    id: newId(),
    documentId,
    groupId: String(body.groupId ?? ''),
    creator: user(c),
    body: {
      type: body?.body?.type ?? 'comment',
      value: String(body?.body?.value ?? ''),
    },
    target: {
      source: documentId,
      selector: [{ type: 'TextQuoteSelector', exact: sel.exact, prefix: sel.prefix, suffix: sel.suffix }],
    },
    tags: Array.isArray(body?.tags) ? body.tags : [],
    parentId: body?.parentId ?? null,
    provenance: body?.provenance ?? 'human',
    createdAt: now(),
  };

  db.run(
    `INSERT INTO annotations
     (id, document_id, group_id, creator, body_type, body_value, selector_exact, selector_prefix, selector_suffix, tags, parent_id, provenance, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ann.id, ann.documentId, ann.groupId, ann.creator, ann.body.type, ann.body.value,
     ann.target.selector[0].exact, ann.target.selector[0].prefix ?? null, ann.target.selector[0].suffix ?? null,
     JSON.stringify(ann.tags), ann.parentId, ann.provenance, ann.createdAt],
  );
  return c.json(ann, 201);
});

app.delete('/api/annotations/:annId', (c) => {
  db.run('DELETE FROM annotations WHERE id = ?', [c.req.param('annId')]);
  return c.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3001);
export default { port, fetch: app.fetch };

console.log(`Collective Reading API → http://localhost:${port}`);
