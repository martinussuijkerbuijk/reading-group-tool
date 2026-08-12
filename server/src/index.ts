import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createBunWebSocket } from 'hono/bun';
import db from './db.ts';
import { pdfToHtml } from './ingest.ts';
import { join, leave, broadcastAnnotation, broadcastCanvas } from './realtime.ts';
import type { Annotation, DocumentRecord, Group, CanvasNode, CanvasEdge } from '@cr/shared';

const { upgradeWebSocket, websocket } = createBunWebSocket();

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
  const selectors: any[] = [{
    type: 'TextQuoteSelector' as const,
    exact: r.selector_exact,
    prefix: r.selector_prefix ?? undefined,
    suffix: r.selector_suffix ?? undefined,
  }];
  if (r.selector_start != null && r.selector_end != null) {
    selectors.push({ type: 'TextPositionSelector' as const, start: r.selector_start, end: r.selector_end });
  }
  return {
    id: r.id,
    documentId: r.document_id,
    groupId: r.group_id,
    creator: r.creator,
    body: { type: r.body_type, value: r.body_value },
    target: { source: r.document_id, selector: selectors },
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
  // Extract selectors from the request — support both TextQuoteSelector and TextPositionSelector
  const selectors = body?.target?.selector ?? [];
  const quoteSel = selectors.find((s: any) => s.type === 'TextQuoteSelector');
  const posSel = selectors.find((s: any) => s.type === 'TextPositionSelector');
  // exact may be empty for replies (which inherit the parent's target)
  if (!quoteSel || typeof quoteSel.exact !== 'string') return c.json({ error: 'target.selector[0].exact required' }, 400);

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
      selector: posSel
        ? [
            { type: 'TextQuoteSelector' as const, exact: quoteSel.exact, prefix: quoteSel.prefix, suffix: quoteSel.suffix },
            { type: 'TextPositionSelector' as const, start: posSel.start, end: posSel.end },
          ]
        : [{ type: 'TextQuoteSelector' as const, exact: quoteSel.exact, prefix: quoteSel.prefix, suffix: quoteSel.suffix }],
    },
    tags: Array.isArray(body?.tags) ? body.tags : [],
    parentId: body?.parentId ?? null,
    provenance: body?.provenance ?? 'human',
    createdAt: now(),
  };

  const qSel = ann.target.selector.find((s: any) => s.type === 'TextQuoteSelector')!;
  const pSel = ann.target.selector.find((s: any) => s.type === 'TextPositionSelector') as any;
  db.run(
    `INSERT INTO annotations
     (id, document_id, group_id, creator, body_type, body_value, selector_exact, selector_prefix, selector_suffix, selector_start, selector_end, tags, parent_id, provenance, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ann.id, ann.documentId, ann.groupId, ann.creator, ann.body.type, ann.body.value,
     qSel.exact, qSel.prefix ?? null, qSel.suffix ?? null,
     pSel?.start ?? null, pSel?.end ?? null,
     JSON.stringify(ann.tags), ann.parentId, ann.provenance, ann.createdAt],
  );
  broadcastAnnotation(documentId, 'created', ann);
  return c.json(ann, 201);
});

app.delete('/api/annotations/:annId', (c) => {
  const row = db.query('SELECT document_id FROM annotations WHERE id = ?').get(c.req.param('annId')) as any;
  db.run('DELETE FROM annotations WHERE id = ?', [c.req.param('annId')]);
  if (row?.document_id) broadcastAnnotation(row.document_id, 'deleted', { id: c.req.param('annId') });
  return c.json({ ok: true });
});

// ---- Canvas: nodes (annotation positions) ----

function rowToCanvasNode(r: any): CanvasNode {
  return {
    id: r.id, documentId: r.document_id, annotationId: r.annotation_id,
    x: r.x, y: r.y, width: r.width, height: r.height,
    createdBy: r.created_by, createdAt: r.created_at,
  };
}

function rowToCanvasEdge(r: any): CanvasEdge {
  return {
    id: r.id, documentId: r.document_id,
    sourceAnnotationId: r.source_annotation_id,
    targetAnnotationId: r.target_annotation_id,
    label: r.label, createdBy: r.created_by, createdAt: r.created_at,
  };
}

// Get all canvas nodes for a document
app.get('/api/documents/:id/canvas/nodes', (c) => {
  const rows = db.query('SELECT * FROM canvas_nodes WHERE document_id = ?').all(c.req.param('id')) as any[];
  return c.json(rows.map(rowToCanvasNode));
});

// Create or update a node position (upsert by document_id + annotation_id)
app.put('/api/documents/:id/canvas/nodes', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const annotationId = String(body.annotationId ?? '');
  if (!annotationId) return c.json({ error: 'annotationId required' }, 400);

  const x = Number(body.x ?? 0);
  const y = Number(body.y ?? 0);
  const width = Number(body.width ?? 260);
  const height = body.height != null ? Number(body.height) : null;

  // Check if node already exists for this doc+annotation
  const existing = db.query('SELECT id FROM canvas_nodes WHERE document_id = ? AND annotation_id = ?').get(documentId, annotationId) as any;

  if (existing) {
    db.run('UPDATE canvas_nodes SET x = ?, y = ?, width = ?, height = ? WHERE id = ?',
      [x, y, width, height, existing.id]);
    const row = db.query('SELECT * FROM canvas_nodes WHERE id = ?').get(existing.id) as any;
    broadcastCanvas(documentId, 'node-updated', rowToCanvasNode(row));
    return c.json(rowToCanvasNode(row));
  } else {
    const node: CanvasNode = {
      id: newId(), documentId, annotationId, x, y, width, height: height,
      createdBy: user(c), createdAt: now(),
    };
    db.run(
      'INSERT INTO canvas_nodes (id, document_id, annotation_id, x, y, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [node.id, node.documentId, node.annotationId, node.x, node.y, node.width, node.height, node.createdBy, node.createdAt],
    );
    broadcastCanvas(documentId, 'node-created', node);
    return c.json(node, 201);
  }
});

// ---- Canvas: edges (connections between annotations) ----
app.get('/api/documents/:id/canvas/edges', (c) => {
  const rows = db.query('SELECT * FROM canvas_edges WHERE document_id = ?').all(c.req.param('id')) as any[];
  return c.json(rows.map(rowToCanvasEdge));
});

app.post('/api/documents/:id/canvas/edges', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const sourceAnnotationId = String(body.sourceAnnotationId ?? '');
  const targetAnnotationId = String(body.targetAnnotationId ?? '');
  if (!sourceAnnotationId || !targetAnnotationId) return c.json({ error: 'sourceAnnotationId and targetAnnotationId required' }, 400);

  // Don't create duplicate edges
  const existing = db.query('SELECT id FROM canvas_edges WHERE document_id = ? AND source_annotation_id = ? AND target_annotation_id = ?').get(documentId, sourceAnnotationId, targetAnnotationId) as any;
  if (existing) return c.json({ id: existing.id, ok: true });

  const edge: CanvasEdge = {
    id: newId(), documentId, sourceAnnotationId, targetAnnotationId,
    label: body.label ?? null, createdBy: user(c), createdAt: now(),
  };
  db.run(
    'INSERT INTO canvas_edges (id, document_id, source_annotation_id, target_annotation_id, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [edge.id, edge.documentId, edge.sourceAnnotationId, edge.targetAnnotationId, edge.label, edge.createdBy, edge.createdAt],
  );
  broadcastCanvas(documentId, 'edge-created', edge);
  return c.json(edge, 201);
});

app.delete('/api/canvas/edges/:edgeId', (c) => {
  const row = db.query('SELECT document_id FROM canvas_edges WHERE id = ?').get(c.req.param('edgeId')) as any;
  db.run('DELETE FROM canvas_edges WHERE id = ?', [c.req.param('edgeId')]);
  if (row?.document_id) broadcastCanvas(row.document_id, 'edge-deleted', { id: c.req.param('edgeId') });
  return c.json({ ok: true });
});

// ---- WebSocket: realtime presence + annotation sync ----
app.get('/ws', upgradeWebSocket((c) => {
  const docId = c.req.query('docId') ?? '';
  const userName = c.req.header('x-user') || c.req.query('user') || 'anonymous';
  let peer: ReturnType<typeof join> | null = null;
  return {
    onOpen(_ev, ws) {
      if (!docId) { ws.close(); return; }
      peer = join(docId, userName, ws);
    },
    onClose() {
      if (peer) leave(peer);
    },
  };
}));

const port = Number(process.env.PORT ?? 3001);
export default { port, fetch: app.fetch, websocket };

console.log(`Collective Reading API → http://localhost:${port}`);
