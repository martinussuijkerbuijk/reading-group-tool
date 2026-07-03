import type { Annotation, DocumentRecord, Group } from '@cr/shared';

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

// Build a W3C TextQuoteSelector from the current browser selection within a container.
export function selectionToSelector(container: HTMLElement): { exact: string; prefix?: string; suffix?: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const exact = sel.toString().trim();
  if (!exact) return null;

  const fullText = container.textContent ?? '';
  const start = range.startOffset;
  // Re-derive offset within full text via a pre-range (robust-ish for Phase 0).
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const offset = pre.toString().length;

  const prefix = fullText.slice(Math.max(0, offset - 32), offset).trimEnd() || undefined;
  const suffix = fullText.slice(offset + exact.length, offset + exact.length + 32).trimStart() || undefined;
  return { exact, prefix, suffix };
}
