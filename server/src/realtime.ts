// Realtime collaboration: per-document rooms for live annotation sync + presence.
import type { WSContext } from 'hono/ws';

interface Peer {
  ws: WSContext;
  documentId: string;
  user: string;
}

// documentId -> set of peers
const rooms = new Map<string, Set<Peer>>();

function getRoom(docId: string): Set<Peer> {
  let room = rooms.get(docId);
  if (!room) { room = new Set(); rooms.set(docId, room); }
  return room;
}

function send(ws: WSContext, msg: unknown) {
  try { ws.send(JSON.stringify(msg)); } catch { /* socket closed */ }
}

export function join(docId: string, user: string, ws: WSContext) {
  const peer: Peer = { ws, documentId: docId, user };
  const room = getRoom(docId);
  room.add(peer);
  // Tell the new peer who's already here
  const present = Array.from(room).filter((p) => p !== peer).map((p) => p.user);
  send(ws, { type: 'presence', users: present });
  // Tell everyone else a new peer joined
  broadcast(docId, { type: 'peer-joined', user }, peer);
  return peer;
}

export function leave(peer: Peer) {
  const room = rooms.get(peer.documentId);
  if (!room) return;
  room.delete(peer);
  if (room.size === 0) rooms.delete(peer.documentId);
  broadcast(peer.documentId, { type: 'peer-left', user: peer.user });
}

function broadcast(docId: string, msg: unknown, except?: Peer) {
  const room = rooms.get(docId);
  if (!room) return;
  for (const p of room) {
    if (p === except) continue;
    send(p.ws, msg);
  }
}

export function broadcastAnnotation(docId: string, event: 'created' | 'deleted', annotation: unknown) {
  broadcast(docId, { type: 'annotation', event, annotation });
}

export function presenceCount(docId: string): number {
  return rooms.get(docId)?.size ?? 0;
}
