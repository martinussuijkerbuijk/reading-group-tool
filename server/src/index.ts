import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createBunWebSocket } from 'hono/bun';
import { serveStatic } from 'hono/bun';
import db from './db.ts';
import { pdfToHtml } from './ingest.ts';
import { join, leave, broadcastAnnotation, broadcastCanvas } from './realtime.ts';
import { streamChat, getSystemPrompt, hasApiKey, getAllModes, getModeConfig } from './ai.ts';
import type { Annotation, DocumentRecord, Group, CanvasNode, CanvasEdge, AiMessage } from '@cr/shared';

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();
app.use('*', cors());

// Serve uploaded images statically
app.use('/uploads/*', serveStatic({ root: './' }));

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

// ---- Canvas: nodes (annotation positions + reasoning nodes) ----

function rowToCanvasNode(r: any): CanvasNode {
  return {
    id: r.id, documentId: r.document_id, annotationId: r.annotation_id,
    nodeType: r.node_type ?? 'annotation',
    title: r.title, body: r.body, imageUrl: r.image_url,
    x: r.x, y: r.y, width: r.width, height: r.height,
    createdBy: r.created_by, createdAt: r.created_at,
  };
}

function rowToCanvasEdge(r: any): CanvasEdge {
  return {
    id: r.id, documentId: r.document_id,
    sourceNodeId: r.source_node_id,
    targetNodeId: r.target_node_id,
    label: r.label, createdBy: r.created_by, createdAt: r.created_at,
  };
}

// Get all canvas nodes for a document
app.get('/api/documents/:id/canvas/nodes', (c) => {
  const rows = db.query('SELECT * FROM canvas_nodes WHERE document_id = ?').all(c.req.param('id')) as any[];
  return c.json(rows.map(rowToCanvasNode));
});

// Create or update an annotation node position (upsert by document_id + annotation_id)
app.put('/api/documents/:id/canvas/nodes', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const annotationId = String(body.annotationId ?? '');
  if (!annotationId) return c.json({ error: 'annotationId required' }, 400);

  const x = Number(body.x ?? 0);
  const y = Number(body.y ?? 0);
  const width = Number(body.width ?? 260);
  const height = body.height != null ? Number(body.height) : null;

  const existing = db.query('SELECT id FROM canvas_nodes WHERE document_id = ? AND annotation_id = ?').get(documentId, annotationId) as any;

  if (existing) {
    db.run('UPDATE canvas_nodes SET x = ?, y = ?, width = ?, height = ? WHERE id = ?',
      [x, y, width, height, existing.id]);
    const row = db.query('SELECT * FROM canvas_nodes WHERE id = ?').get(existing.id) as any;
    broadcastCanvas(documentId, 'node-updated', rowToCanvasNode(row));
    return c.json(rowToCanvasNode(row));
  } else {
    const node: CanvasNode = {
      id: newId(), documentId, annotationId, nodeType: 'annotation',
      title: null, body: null,
      x, y, width, height, createdBy: user(c), createdAt: now(),
    };
    db.run(
      'INSERT INTO canvas_nodes (id, document_id, annotation_id, node_type, title, body, x, y, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [node.id, node.documentId, node.annotationId, node.nodeType, node.title, node.body, node.x, node.y, node.width, node.height, node.createdBy, node.createdAt],
    );
    broadcastCanvas(documentId, 'node-created', node);
    return c.json(node, 201);
  }
});

// Create a reasoning node (standalone, not tied to an annotation)
app.post('/api/documents/:id/canvas/reasoning-nodes', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const node: CanvasNode = {
    id: newId(), documentId, annotationId: null, nodeType: 'reasoning',
    title: body.title ?? 'New thought',
    body: body.body ?? '',
    x: Number(body.x ?? 0), y: Number(body.y ?? 0),
    width: Number(body.width ?? 280), height: body.height != null ? Number(body.height) : null,
    createdBy: user(c), createdAt: now(),
  };
  db.run(
    'INSERT INTO canvas_nodes (id, document_id, annotation_id, node_type, title, body, x, y, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [node.id, node.documentId, node.annotationId, node.nodeType, node.title, node.body, node.x, node.y, node.width, node.height, node.createdBy, node.createdAt],
  );
  broadcastCanvas(documentId, 'node-created', node);
  return c.json(node, 201);
});

// Create an image node (accepts FormData with image file + position)
app.post('/api/documents/:id/canvas/image-nodes', async (c) => {
  const documentId = c.req.param('id');
  const form = await c.req.formData();
  const file = form.get('image') as File | null;
  const title = String(form.get('title') ?? '');
  const x = Number(form.get('x') ?? 0);
  const y = Number(form.get('y') ?? 0);
  if (!file) return c.json({ error: 'image file required' }, 400);

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'unsupported file type: ' + file.type }, 400);
  }

  // Save the file to uploads/
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${newId()}.${ext}`;
  const uploadDir = 'uploads';
  try { await Bun.write(`${uploadDir}/${filename}`, file); } catch {
    // Create uploads dir if it doesn't exist
    const { mkdirSync } = await import('node:fs');
    mkdirSync(uploadDir, { recursive: true });
    await Bun.write(`${uploadDir}/${filename}`, file);
  }
  const imageUrl = `/uploads/${filename}`;

  const node: CanvasNode = {
    id: newId(), documentId, annotationId: null, nodeType: 'image',
    title: title || null, body: null, imageUrl,
    x, y, width: Number(form.get('width') ?? 320), height: null,
    createdBy: user(c), createdAt: now(),
  };
  db.run(
    'INSERT INTO canvas_nodes (id, document_id, annotation_id, node_type, title, body, image_url, x, y, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [node.id, node.documentId, node.annotationId, node.nodeType, node.title, node.body, node.imageUrl, node.x, node.y, node.width, node.height, node.createdBy, node.createdAt],
  );
  broadcastCanvas(documentId, 'node-created', node);
  return c.json(node, 201);
});
app.put('/api/canvas/nodes/:nodeId', async (c) => {
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json();
  const updates: string[] = [];
  const params: any[] = [];
  if (body.title !== undefined) { updates.push('title = ?'); params.push(body.title); }
  if (body.body !== undefined) { updates.push('body = ?'); params.push(body.body); }
  if (body.x !== undefined) { updates.push('x = ?'); params.push(Number(body.x)); }
  if (body.y !== undefined) { updates.push('y = ?'); params.push(Number(body.y)); }
  if (body.width !== undefined) { updates.push('width = ?'); params.push(Number(body.width)); }
  if (updates.length === 0) return c.json({ error: 'no fields to update' }, 400);
  params.push(nodeId);
  db.run(`UPDATE canvas_nodes SET ${updates.join(', ')} WHERE id = ?`, params);
  const row = db.query('SELECT * FROM canvas_nodes WHERE id = ?').get(nodeId) as any;
  if (!row) return c.json({ error: 'not found' }, 404);
  const documentId = row.document_id;
  broadcastCanvas(documentId, 'node-updated', rowToCanvasNode(row));
  return c.json(rowToCanvasNode(row));
});

// ---- AI nodes ----

// Create an AI node
app.post('/api/documents/:id/canvas/ai-nodes', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const mode = String(body.mode ?? 'explain');
  const node: CanvasNode = {
    id: newId(), documentId, annotationId: null, nodeType: 'ai',
    title: null, body: JSON.stringify({ mode }), imageUrl: null,
    x: Number(body.x ?? 0), y: Number(body.y ?? 0),
    width: Number(body.width ?? 340), height: null,
    createdBy: user(c), createdAt: now(),
  };
  db.run(
    'INSERT INTO canvas_nodes (id, document_id, annotation_id, node_type, title, body, image_url, x, y, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [node.id, node.documentId, node.annotationId, node.nodeType, node.title, node.body, node.imageUrl, node.x, node.y, node.width, node.height, node.createdBy, node.createdAt],
  );
  broadcastCanvas(documentId, 'node-created', node);
  return c.json(node, 201);
});

// Get conversation history for an AI node
app.get('/api/canvas/nodes/:nodeId/conversation', (c) => {
  const rows = db.query('SELECT * FROM ai_conversations WHERE node_id = ? ORDER BY created_at ASC').all(c.req.param('nodeId')) as any[];
  return c.json(rows.map((r) => ({
    role: r.role, content: r.content, createdAt: r.created_at,
  })) as AiMessage[]);
});

// Stream a chat message to an AI node (Server-Sent Events)
app.post('/api/canvas/nodes/:nodeId/chat', async (c) => {
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json();
  const userMessage = String(body.message ?? '').trim();
  if (!userMessage) return c.json({ error: 'message required' }, 400);

  // Get the node and its document
  const nodeRow = db.query('SELECT * FROM canvas_nodes WHERE id = ?').get(nodeId) as any;
  if (!nodeRow) return c.json({ error: 'node not found' }, 404);
  if (nodeRow.node_type !== 'ai') return c.json({ error: 'not an AI node' }, 400);

  const docRow = db.query('SELECT title FROM documents WHERE id = ?').get(nodeRow.document_id) as any;
  const docTitle = docRow?.title ?? 'a document';

  // Parse mode from node body
  let mode = 'explain';
  try { mode = (JSON.parse(nodeRow.body ?? '{}').mode) ?? 'explain'; } catch {}

  // Check if mode is available (from prompts.json config)
  const modeCfg = await getModeConfig(mode);
  if (modeCfg && !modeCfg.available) return c.json({ error: `${modeCfg.label} is not yet available` }, 501);

  // Load conversation history
  const historyRows = db.query('SELECT role, content, created_at FROM ai_conversations WHERE node_id = ? ORDER BY created_at ASC').all(nodeId) as any[];
  const history: AiMessage[] = historyRows.map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));

  // Save the user's message
  const userMsgId = newId();
  db.run('INSERT INTO ai_conversations (id, node_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    [userMsgId, nodeId, 'user', userMessage, now()]);

  const systemPrompt = await getSystemPrompt(mode, docTitle);

  // Stream the response as SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const fullText = await streamChat(systemPrompt, history, userMessage, (token) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        });
        // Save the assistant's response
        const assistantMsgId = newId();
        db.run('INSERT INTO ai_conversations (id, node_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
          [assistantMsgId, nodeId, 'assistant', fullText, now()]);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Check if AI is configured (no key in response, just boolean)
app.get('/api/ai/status', (c) => {
  return c.json({ configured: hasApiKey() });
});

// Get AI mode metadata (labels, placeholders, availability) from prompts.json
app.get('/api/ai/modes', async (c) => {
  const modes = await getAllModes();
  const result: Record<string, { label: string; placeholder: string; available: boolean }> = {};
  for (const [key, cfg] of Object.entries(modes)) {
    result[key] = { label: cfg.label, placeholder: cfg.placeholder, available: cfg.available };
  }
  return c.json(result);
});

// Delete a canvas node (and its edges explicitly — FK cascade may not work on migrated columns)
app.delete('/api/canvas/nodes/:nodeId', (c) => {
  const nodeId = c.req.param('nodeId');
  const row = db.query('SELECT document_id FROM canvas_nodes WHERE id = ?').get(nodeId) as any;
  if (!row) return c.json({ error: 'not found' }, 404);
  // Explicitly delete edges referencing this node
  const edgeRows = db.query('SELECT id FROM canvas_edges WHERE source_node_id = ? OR target_node_id = ?').all(nodeId, nodeId) as any[];
  db.run('DELETE FROM canvas_edges WHERE source_node_id = ? OR target_node_id = ?', [nodeId, nodeId]);
  db.run('DELETE FROM canvas_nodes WHERE id = ?', [nodeId]);
  // Broadcast edge deletions first, then node deletion
  for (const e of edgeRows) broadcastCanvas(row.document_id, 'edge-deleted', { id: e.id });
  broadcastCanvas(row.document_id, 'node-deleted', { id: nodeId });
  return c.json({ ok: true });
});

// ---- Canvas: edges (connections between nodes) ----
app.get('/api/documents/:id/canvas/edges', (c) => {
  const rows = db.query('SELECT * FROM canvas_edges WHERE document_id = ? AND source_node_id IS NOT NULL AND target_node_id IS NOT NULL').all(c.req.param('id')) as any[];
  return c.json(rows.map(rowToCanvasEdge));
});

app.post('/api/documents/:id/canvas/edges', async (c) => {
  const documentId = c.req.param('id');
  const body = await c.req.json();
  const sourceNodeId = String(body.sourceNodeId ?? '');
  const targetNodeId = String(body.targetNodeId ?? '');
  if (!sourceNodeId || !targetNodeId) return c.json({ error: 'sourceNodeId and targetNodeId required' }, 400);

  const existing = db.query('SELECT id FROM canvas_edges WHERE document_id = ? AND source_node_id = ? AND target_node_id = ?').get(documentId, sourceNodeId, targetNodeId) as any;
  if (existing) return c.json({ id: existing.id, ok: true });

  const edge: CanvasEdge = {
    id: newId(), documentId, sourceNodeId, targetNodeId,
    label: body.label ?? null, createdBy: user(c), createdAt: now(),
  };
  db.run(
    'INSERT INTO canvas_edges (id, document_id, source_node_id, target_node_id, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [edge.id, edge.documentId, edge.sourceNodeId, edge.targetNodeId, edge.label, edge.createdBy, edge.createdAt],
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
