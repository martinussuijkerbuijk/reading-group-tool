import type { Annotation, CanvasNode, CanvasEdge, DocumentRecord, Group, AiMessage } from '@cr/shared';

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

// ---- AI node API ----
export async function createAiNode(docId: string, mode: 'explain' | 'brechtian' | 'connect', x: number, y: number): Promise<CanvasNode> {
  const r = await fetch(`/api/documents/${docId}/canvas/ai-nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify({ mode, x, y, width: 340 }),
  });
  return r.json();
}
export async function getConversation(nodeId: string): Promise<AiMessage[]> {
  const r = await fetch(`/api/canvas/nodes/${nodeId}/conversation`);
  return r.json();
}
export async function getAiStatus(): Promise<{ configured: boolean }> {
  const r = await fetch('/api/ai/status');
  return r.json();
}
// Stream a chat message — calls onToken for each token, returns when done.
export async function streamChat(
  nodeId: string,
  message: string,
  onToken: (token: string) => void,
): Promise<void> {
  const res = await fetch(`/api/canvas/nodes/${nodeId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user': USER },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        if (data.token) onToken(data.token);
        if (data.error) throw new Error(data.error);
      } catch (e: any) {
        if (e.message) throw e;
      }
    }
  }
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
