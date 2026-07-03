import { useEffect, useRef, useState } from 'react';
import type { Annotation } from '@cr/shared';

const USER = 'you'; // Phase 0 single-user identity

type RealtimeEvent =
  | { type: 'presence'; users: string[] }
  | { type: 'peer-joined'; user: string }
  | { type: 'peer-left'; user: string }
  | { type: 'annotation'; event: 'created' | 'deleted'; annotation: Annotation | { id: string } };

export function useRealtime(docId: string, opts: {
  onAnnotationCreated: (ann: Annotation) => void;
  onAnnotationDeleted: (id: string) => void;
}) {
  const [presentUsers, setPresentUsers] = useState<string[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws?docId=${encodeURIComponent(docId)}&user=${encodeURIComponent(USER)}`;
    const ws = new WebSocket(wsUrl);
    let alive = true;

    ws.onmessage = (ev) => {
      if (!alive) return;
      let msg: RealtimeEvent;
      try { msg = JSON.parse(ev.data); } catch { return; }

      switch (msg.type) {
        case 'presence':
          setPresentUsers(msg.users);
          break;
        case 'peer-joined':
          setPresentUsers((u) => u.includes(msg.user) ? u : [...u, msg.user]);
          break;
        case 'peer-left':
          setPresentUsers((u) => u.filter((x) => x !== msg.user));
          break;
        case 'annotation':
          if (msg.event === 'created' && 'id' in msg.annotation) {
            optsRef.current.onAnnotationCreated(msg.annotation as Annotation);
          } else if (msg.event === 'deleted' && 'id' in msg.annotation) {
            optsRef.current.onAnnotationDeleted((msg.annotation as { id: string }).id);
          }
          break;
      }
    };

    return () => { alive = false; ws.close(); };
  }, [docId]);

  return { presentUsers, me: USER };
}
