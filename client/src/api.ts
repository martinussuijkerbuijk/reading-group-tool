import type { Annotation, CanvasNode, CanvasEdge, DocumentRecord, Group } from '@cr/shared';

const USER = 'you'; // Phase 0 single-user

export async function listGroups(): Promise<Group[]> {
  const r = await fetch('/api/groups');
  return r.json();
}
export async function createGroup(name: string): Promise<Group> {
  const r = await fetch('/api/groups', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify({ name }),
  });
  return r.json();
}

export async function listDocuments(groupId?: string): Promise<(DocumentRecord & { html?: undefined })[]> {
  const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
  const r = await fetch(`/api/documents${qs}`);
  return r.json();
}
export async function getDocument(id: string): Promise<DocumentRecord> {
  const r = await fetch(`/api/documents/${id}`);
  return r.json();
}
export async function uploadDocument(file: File, groupId: string, title: string): Promise<DocumentRecord> {
  const form = new FormData();
  form.append('file', file);
  form.append('groupId', groupId);
  form.append('title', title);
  const r = await fetch('/api/documents', { method: 'POST', headers: { 'x-user': USER }, body: form });
  if (!r.ok) throw new Error((await r.json()).detail ?? 'upload failed');
  return r.json();
}

export async function listAnnotations(docId: string): Promise<Annotation[]> {
  const r = await fetch(`/api/documents/${docId}/annotations`);
  return r.json();
}
export async function createAnnotation(docId: string, body: Partial<Annotation>): Promise<Annotation> {
  const r = await fetch(`/api/documents/${docId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify(body),
  });
  return r.json();
}
export async function deleteAnnotation(annId: string): Promise<void> {
  await fetch(`/api/annotations/${annId}`, { method: 'DELETE', headers: { 'x-user': USER } });
}

// ---- Canvas API ----
export async function getCanvasNodes(docId: string): Promise<CanvasNode[]> {
  const r = await fetch(`/api/documents/${docId}/canvas/nodes`);
  return r.json();
}
export async function upsertCanvasNode(docId: string, annotationId: string, x: number, y: number, width?: number, height?: number): Promise<CanvasNode> {
  const r = await fetch(`/api/documents/${docId}/canvas/nodes`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify({ annotationId, x, y, width, height }),
  });
  return r.json();
}
export async function createReasoningNode(docId: string, title: string, body: string, x: number, y: number): Promise<CanvasNode> {
  const r = await fetch(`/api/documents/${docId}/canvas/reasoning-nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify({ title, body, x, y, width: 280 }),
  });
  return r.json();
}
export async function createImageNode(docId: string, image: Blob, x: number, y: number, title?: string): Promise<CanvasNode> {
  const form = new FormData();
  form.append('image', image);
  form.append('x', String(x));
  form.append('y', String(y));
  if (title) form.append('title', title);
  const r = await fetch(`/api/documents/${docId}/canvas/image-nodes`, {
    method: 'POST', headers: { 'x-user': USER },
    body: form,
  });
  if (!r.ok) throw new Error('Failed to upload image');
  return r.json();
}
export async function updateCanvasNode(nodeId: string, updates: Partial<{ title: string; body: string; x: number; y: number; width: number }>): Promise<CanvasNode> {
  const r = await fetch(`/api/canvas/nodes/${nodeId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify(updates),
  });
  return r.json();
}
export async function deleteCanvasNode(nodeId: string): Promise<void> {
  await fetch(`/api/canvas/nodes/${nodeId}`, { method: 'DELETE', headers: { 'x-user': USER } });
}
export async function getCanvasEdges(docId: string): Promise<CanvasEdge[]> {
  const r = await fetch(`/api/documents/${docId}/canvas/edges`);
  return r.json();
}
export async function createCanvasEdge(docId: string, sourceNodeId: string, targetNodeId: string, label?: string): Promise<CanvasEdge> {
  const r = await fetch(`/api/documents/${docId}/canvas/edges`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify({ sourceNodeId, targetNodeId, label }),
  });
  return r.json();
}
export async function deleteCanvasEdge(edgeId: string): Promise<void> {
  await fetch(`/api/canvas/edges/${edgeId}`, { method: 'DELETE', headers: { 'x-user': USER } });
}

// Build W3C selectors from the current browser selection within a container.
// Returns both a TextQuoteSelector (for portability) and a TextPositionSelector
// (for precise highlight anchoring — fixes the "wrong occurrence" bug).
export function selectionToSelector(container: HTMLElement): {
  exact: string;
  prefix?: string;
  suffix?: string;
  start: number;
  end: number;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const exact = sel.toString().trim();
  if (!exact) return null;

  const fullText = container.textContent ?? '';
  // Re-derive offset within full text via a pre-range.
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;

  const prefix = fullText.slice(Math.max(0, start - 32), start).trimEnd() || undefined;
  const suffix = fullText.slice(start + exact.length, start + exact.length + 32).trimStart() || undefined;
  return { exact, prefix, suffix, start, end: start + exact.length };
}
