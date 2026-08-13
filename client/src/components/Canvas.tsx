import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  applyNodeChanges, applyEdgeChanges, addEdge,
  Handle, Position, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Annotation, CanvasNode, CanvasEdge } from '@cr/shared';
import {
  getCanvasNodes, getCanvasEdges, upsertCanvasNode, updateCanvasNode, deleteCanvasNode,
  createReasoningNode, createImageNode, createAiNode, createCanvasEdge, deleteCanvasEdge,
  getConversation, streamChat,
} from '../api.ts';
import { Markdown } from './Markdown.tsx';

const TYPE_STYLES: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  comment:   { bg: 'bg-amber-50',   border: 'border-amber-300',   dot: 'bg-amber-400',   label: 'Comment' },
  question:  { bg: 'bg-blue-50',    border: 'border-blue-300',    dot: 'bg-blue-400',    label: 'Question' },
  highlight: { bg: 'bg-emerald-50', border: 'border-emerald-300', dot: 'bg-emerald-400', label: 'Highlight' },
  note:      { bg: 'bg-purple-50',  border: 'border-purple-300',  dot: 'bg-purple-400',  label: 'Note' },
};

// ---- Annotation node ----
function AnnotationNode({ data }: { data: any }) {
  const ann = data.annotation as Annotation;
  const style = TYPE_STYLES[ann.body.type] ?? TYPE_STYLES.comment;
  const quoteSel = ann.target.selector.find((s: any) => s.type === 'TextQuoteSelector');

  return (
    <div className={`cr-canvas-node ${style.bg} ${style.border} border rounded-lg shadow-sm p-3`} style={{ minWidth: 200, maxWidth: 320 }}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2.5 !h-2.5" />
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`${style.dot} w-2 h-2 rounded-full`} />
          <span className="text-xs font-medium text-slate-600">{style.label}</span>
        </div>
        <span className="text-xs text-slate-400">{ann.creator}</span>
      </div>
      {quoteSel?.exact && (
        <div className="text-xs italic text-slate-500 mb-1.5 line-clamp-2 border-l-2 border-slate-300 pl-2">{quoteSel.exact}</div>
      )}
      {ann.body.value ? (
        <div className="cr-markdown text-sm text-slate-800"><Markdown>{ann.body.value}</Markdown></div>
      ) : (
        <div className="text-sm text-slate-400 italic">No text</div>
      )}
      {ann.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {ann.tags.map((t) => <span key={t} className="text-xs text-slate-500 bg-white/60 px-1 rounded">#{t}</span>)}
        </div>
      )}
    </div>
  );
}

// ---- Reasoning node (editable, standalone) ----
function ReasoningNode({ data, id }: { data: any; id: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(data.title || 'New thought');
  const [body, setBody] = useState(data.body || '');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ref to always hold the latest title/body — avoids stale closure in debounced save
  const latest = useRef({ title: data.title || 'New thought', body: data.body || '' });
  latest.current = { title, body };

  // Sync from external data changes (server/realtime) — NOT from editing toggling.
  // `editing` is intentionally excluded from deps so clicking Done doesn't reset the display.
  useEffect(() => {
    if (!editing) { setTitle(data.title || 'New thought'); setBody(data.body || ''); }
  }, [data.title, data.body]);

  const save = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const t = latest.current.title, b = latest.current.body;
      updateCanvasNode(id, { title: t, body: b }).then(() => data.onUpdate?.(id, t, b)).catch(console.error);
    }, 500);
  }, [id, data]);

  // Flush save immediately (used when clicking Done)
  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    const t = latest.current.title, b = latest.current.body;
    updateCanvasNode(id, { title: t, body: b }).then(() => data.onUpdate?.(id, t, b)).catch(console.error);
  }, [id, data]);

  if (editing) {
    return (
      <div className="cr-canvas-node bg-rose-50 border-rose-300 border rounded-lg shadow-md p-3" style={{ minWidth: 220, maxWidth: 340 }}>
        <Handle type="target" position={Position.Top} className="!bg-rose-400 !w-2.5 !h-2.5" />
        <Handle type="source" position={Position.Bottom} className="!bg-rose-400 !w-2.5 !h-2.5" />
        <input
          value={title} onChange={(e) => { setTitle(e.target.value); save(); }}
          className="w-full font-semibold text-sm border-b border-rose-200 bg-transparent outline-none mb-2 pb-1"
          placeholder="Title…"
          autoFocus
        />
        <textarea
          value={body} onChange={(e) => { setBody(e.target.value); save(); }}
          rows={4}
          className="w-full text-sm bg-white/60 rounded p-2 outline-none resize-none border border-rose-200"
          placeholder="Your reasoning… (markdown supported)"
        />
        <div className="flex justify-between mt-2">
          <button onClick={() => { flushSave(); setEditing(false); }} className="text-xs px-2 py-1 bg-rose-500 text-white rounded">Done</button>
          <button onClick={() => { if (confirm('Delete this reasoning node?')) { data.onDelete?.(id); } }}
            className="text-xs px-2 py-1 text-red-500 hover:underline">delete</button>
        </div>
      </div>
    );
  }

  return (
    <div onDoubleClick={() => setEditing(true)}
      className="cr-canvas-node bg-rose-50 border-rose-300 border rounded-lg shadow-sm p-3 cursor-pointer hover:shadow-md transition" style={{ minWidth: 220, maxWidth: 320 }}>
      <Handle type="target" position={Position.Top} className="!bg-rose-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-rose-400 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="bg-rose-400 w-2 h-2 rounded-full" />
        <span className="text-xs font-medium text-rose-600">Reasoning</span>
        <span className="text-xs text-slate-400 ml-auto">{data.createdBy}</span>
      </div>
      <div className="font-semibold text-sm text-slate-800 mb-1">{title || 'Untitled'}</div>
      {body ? (
        <div className="cr-markdown text-sm text-slate-700"><Markdown>{body}</Markdown></div>
      ) : (
        <div className="text-xs text-slate-400 italic">Double-click to edit</div>
      )}
    </div>
  );
}

// ---- Image node (pasted/uploaded images) ----
function ImageNode({ data, id }: { data: any; id: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(data.title || '');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(title);
  latest.current = title;

  useEffect(() => {
    if (!editing) setTitle(data.title || '');
  }, [data.title, editing]);

  const save = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateCanvasNode(id, { title: latest.current }).then(() => data.onUpdate?.(id, latest.current, null)).catch(console.error);
    }, 500);
  }, [id, data]);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    updateCanvasNode(id, { title: latest.current }).then(() => data.onUpdate?.(id, latest.current, null)).catch(console.error);
  }, [id, data]);

  return (
    <div className="cr-canvas-node bg-slate-50 border-slate-300 border rounded-lg shadow-sm p-2" style={{ minWidth: 180, maxWidth: 360 }}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2.5 !h-2.5" />
      {editing ? (
        <>
          <input
            value={title} onChange={(e) => { setTitle(e.target.value); save(); }}
            className="w-full font-medium text-sm border-b border-slate-200 bg-transparent outline-none mb-2 pb-1"
            placeholder="Caption…"
            autoFocus
          />
          <button onClick={() => { flushSave(); setEditing(false); }}
            className="text-xs px-2 py-1 bg-slate-600 text-white rounded">Done</button>
        </>
      ) : (
        <>
          <img src={data.imageUrl} alt={title || 'image'} className="rounded max-w-full" style={{ maxHeight: 300 }} />
          {title ? (
            <div className="text-xs text-slate-600 mt-1.5 font-medium" onDoubleClick={() => setEditing(true)}>{title}</div>
          ) : (
            <div className="text-xs text-slate-400 italic mt-1.5" onDoubleClick={() => setEditing(true)}>Double-click to add caption</div>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-400">by {data.createdBy}</span>
            <button onClick={() => { if (confirm('Delete this image?')) data.onDelete?.(id); }}
              className="text-xs text-red-500 hover:underline">delete</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- AI node (chat with GLM-5.2, streaming) ----
const MODE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; placeholder: string }> = {
  explain:   { label: '📖 Explain',    color: 'text-cyan-700',   bg: 'bg-cyan-50',   border: 'border-cyan-300',   placeholder: 'Ask for an explanation…' },
  brechtian: { label: '⚡ Brechtian',   color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', placeholder: 'State a claim or idea to dialectically engage…' },
  connect:   { label: '🔗 Connect',    color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-300',  placeholder: 'Not yet available' },
};

function AiNode({ data, id }: { data: any; id: string }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState(data.mode || 'explain');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation history
  useEffect(() => {
    getConversation(id).then((msgs) => setMessages(msgs)).catch(() => {});
  }, [id]);

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText]);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput('');
    setError(null);
    setStreaming(true);
    setStreamingText('');
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    try {
      let full = '';
      await streamChat(id, msg, (token) => {
        full += token;
        setStreamingText(full);
      });
      setMessages((m) => [...m, { role: 'assistant', content: full }]);
      setStreamingText('');
    } catch (e: any) {
      setError(e.message || 'Failed to get response');
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, id]);

  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.explain;
  const disabled = mode === 'connect';

  return (
    <div className={`cr-canvas-node ${config.bg} ${config.border} border rounded-lg shadow-sm flex flex-col`} style={{ width: 320, minHeight: 200 }}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2.5 !h-2.5" />

      {/* Header with mode selector */}
      <div className="flex items-center justify-between p-2 border-b border-slate-200/60">
        <div className="relative">
          <button
            onClick={() => setModeMenuOpen(!modeMenuOpen)}
            className={`text-xs font-medium ${config.color} flex items-center gap-1 hover:opacity-80`}
          >
            {config.label} ▾
          </button>
          {modeMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-10 w-40">
              {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === 'connect') { setModeMenuOpen(false); return; }
                    setMode(key);
                    data.onModeChange?.(id, key);
                    setModeMenuOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 ${key === 'connect' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {cfg.label}
                  {key === 'connect' && <span className="text-slate-400 ml-1">(soon)</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => { if (confirm('Delete this AI node?')) data.onDelete?.(id); }}
          className="text-xs text-red-400 hover:text-red-600">✕</button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2 max-h-64">
        {messages.length === 0 && !streamingText && (
          <div className="text-xs text-slate-400 italic py-2">
            {disabled ? 'Connect mode is not yet available.' : 'Start a conversation to learn…'}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-xs rounded p-2 ${m.role === 'user' ? 'bg-white/80 ml-4' : 'bg-white/50 mr-4'}`}>
            <div className="text-[10px] text-slate-400 mb-0.5 font-medium">{m.role === 'user' ? 'You' : 'AI'}</div>
            <div className="cr-markdown text-slate-700"><Markdown>{m.content}</Markdown></div>
          </div>
        ))}
        {streamingText && (
          <div className="text-xs rounded p-2 bg-white/50 mr-4">
            <div className="text-[10px] text-slate-400 mb-0.5 font-medium">AI<span className="animate-pulse">…</span></div>
            <div className="cr-markdown text-slate-700"><Markdown>{streamingText}</Markdown></div>
          </div>
        )}
        {error && <div className="text-xs text-red-500 p-2">⚠ {error}</div>}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-slate-200/60">
        <div className="flex gap-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            disabled={disabled || streaming}
            placeholder={disabled ? 'Not available' : config.placeholder}
            className="flex-1 text-xs border rounded px-2 py-1 resize-none outline-none disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={disabled || streaming || !input.trim()}
            className="px-2 py-1 bg-slate-700 text-white text-xs rounded disabled:opacity-30"
          >Send</button>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { annotation: AnnotationNode, reasoning: ReasoningNode, image: ImageNode, ai: AiNode };

// ---- Inner component (has access to ReactFlow context) ----
function CanvasContent({ docId, annotations, onBack, theme }: {
  docId: string;
  annotations: Annotation[];
  onBack: () => void;
  theme: 'light' | 'dark';
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactFlow = useReactFlow();
  const annIdToNodeId = useRef<Map<string, string>>(new Map());

  // Delete a reasoning node (defined FIRST so loadCanvas can reference it)
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter(n => n.id !== nodeId));
    setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    deleteCanvasNode(nodeId).catch(console.error);
  }, []);

  // Update a reasoning node's data in the local React Flow state (after save)
  const handleUpdateNodeData = useCallback((nodeId: string, title: string, body: string | null) => {
    setNodes((nds) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...(title !== null && { title }), ...(body !== null && { body }) } } : n));
  }, []);

  // Update AI node mode (persists to server)
  const handleAiModeChange = useCallback((nodeId: string, mode: string) => {
    setNodes((nds) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, mode } } : n));
    updateCanvasNode(nodeId, { body: JSON.stringify({ mode }) }).catch(console.error);
  }, []);

  // Load saved canvas state
  const loadCanvas = useCallback(async () => {
    const [savedNodes, savedEdges] = await Promise.all([getCanvasNodes(docId), getCanvasEdges(docId)]);
    annIdToNodeId.current = new Map();

    const annNodeMap = new Map(savedNodes.filter(n => n.annotationId).map(n => [n.annotationId!, n]));
    const annNodes: Node[] = annotations
      .filter((a) => !a.parentId)
      .map((ann, i) => {
        const saved = annNodeMap.get(ann.id);
        if (saved) annIdToNodeId.current.set(ann.id, saved.id);
        const col = i % 3;
        const row = Math.floor(i / 3);
        return {
          id: saved?.id ?? `pending-${ann.id}`,
          type: 'annotation',
          position: saved ? { x: saved.x, y: saved.y } : { x: 40 + col * 300, y: 40 + row * 220 },
          width: saved?.width ?? 260,
          data: { annotation: ann },
        };
      });

    const reasonNodes: Node[] = savedNodes
      .filter(n => n.nodeType === 'reasoning')
      .map(n => ({
        id: n.id, type: 'reasoning',
        position: { x: n.x, y: n.y }, width: n.width,
        data: { title: n.title, body: n.body, createdBy: n.createdBy, onDelete: handleDeleteNode, onUpdate: handleUpdateNodeData },
      }));

    const imageNodes: Node[] = savedNodes
      .filter(n => n.nodeType === 'image')
      .map(n => ({
        id: n.id, type: 'image',
        position: { x: n.x, y: n.y }, width: n.width,
        data: { imageUrl: n.imageUrl, title: n.title, createdBy: n.createdBy, onDelete: handleDeleteNode, onUpdate: handleUpdateNodeData },
      }));

    const aiNodes: Node[] = savedNodes
      .filter(n => n.nodeType === 'ai')
      .map(n => {
        let aiMode = 'explain';
        try { aiMode = JSON.parse(n.body ?? '{}').mode ?? 'explain'; } catch {}
        return {
          id: n.id, type: 'ai',
          position: { x: n.x, y: n.y }, width: n.width,
          data: { mode: aiMode, createdBy: n.createdBy, onDelete: handleDeleteNode, onModeChange: handleAiModeChange },
        };
      });

    setNodes([...annNodes, ...reasonNodes, ...imageNodes, ...aiNodes]);

    const newEdges: Edge[] = savedEdges.map((e) => ({
      id: e.id, source: e.sourceNodeId, target: e.targetNodeId,
      label: e.label ?? undefined, type: 'smoothstep', animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      style: { stroke: '#64748b', strokeWidth: 2 },
    }));
    setEdges(newEdges);
    setLoading(false);
  }, [docId, annotations, handleDeleteNode, handleUpdateNodeData, handleAiModeChange]);

  useEffect(() => { loadCanvas(); }, [loadCanvas]);

  // Sync when annotations change
  useEffect(() => {
    setNodes((prev) => {
      const existingAnnIds = new Set(prev.filter(n => n.type === 'annotation').map(n => (n.data as any).annotation?.id));
      const newNodes: Node[] = [];
      let i = prev.filter(n => n.type === 'annotation').length;
      for (const ann of annotations.filter(a => !a.parentId && !existingAnnIds.has(a.id))) {
        const col = i % 3; const row = Math.floor(i / 3);
        newNodes.push({
          id: `pending-${ann.id}`, type: 'annotation',
          position: { x: 40 + col * 300, y: 40 + row * 220 },
          width: 260, data: { annotation: ann },
        });
        i++;
      }
      const updated = prev.map((n) => {
        const ann = annotations.find(a => a.id === (n.data as any)?.annotation?.id);
        return ann ? { ...n, data: { ...n.data, annotation: ann } } : n;
      });
      return [...updated, ...newNodes];
    });
  }, [annotations]);

  const saveAnnotationNodePosition = useCallback((nodeId: string, annId: string, x: number, y: number) => {
    const timer = saveTimer.current.get(nodeId);
    if (timer) clearTimeout(timer);
    saveTimer.current.set(nodeId, setTimeout(async () => {
      try {
        const saved = await upsertCanvasNode(docId, annId, x, y);
        if (nodeId.startsWith('pending-')) {
          annIdToNodeId.current.set(annId, saved.id);
          setNodes((nds) => nds.map(n => n.id === nodeId ? { ...n, id: saved.id } : n));
          setEdges((eds) => eds.map(e => e.source === nodeId ? { ...e, source: saved.id } : e).map(e => e.target === nodeId ? { ...e, target: saved.id } : e));
        }
      } catch (e) { console.error('Failed to save node position:', e); }
    }, 400));
  }, [docId]);

  const saveReasoningNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    const timer = saveTimer.current.get(nodeId);
    if (timer) clearTimeout(timer);
    saveTimer.current.set(nodeId, setTimeout(async () => {
      try { await updateCanvasNode(nodeId, { x, y }); } catch (e) { console.error('Failed to save:', e); }
    }, 400));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false) {
        const node = nodes.find(n => n.id === change.id);
        if (!node) continue;
        if (node.type === 'reasoning' || node.type === 'image' || node.type === 'ai') {
          saveReasoningNodePosition(change.id, change.position.x, change.position.y);
        } else if (node.type === 'annotation') {
          const annId = (node.data as any)?.annotation?.id;
          if (annId) saveAnnotationNodePosition(change.id, annId, change.position.x, change.position.y);
        }
      }
      if (change.type === 'remove') {
        const node = nodes.find(n => n.id === change.id);
        if (node?.type === 'reasoning' || node?.type === 'image' || node?.type === 'ai') deleteCanvasNode(change.id).catch(console.error);
      }
    }
  }, [nodes, saveAnnotationNodePosition, saveReasoningNodePosition]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    for (const change of changes) {
      if (change.type === 'remove') {
        for (const id of change.ids ?? [change.id]) deleteCanvasEdge(id).catch(console.error);
      }
    }
  }, []);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    if (conn.source.startsWith('pending-') || conn.target.startsWith('pending-')) {
      setNodes(nds => nds.map(n => {
        if (n.id === conn.source || n.id === conn.target) {
          if (n.type === 'annotation') {
            const annId = (n.data as any)?.annotation?.id;
            if (annId) upsertCanvasNode(docId, annId, n.position.x, n.position.y).then(saved => {
              annIdToNodeId.current.set(annId, saved.id);
              setNodes(cur => cur.map(x => x.id === n.id ? { ...x, id: saved.id } : x));
              setEdges(cur => cur.map(e => e.source === n.id ? { ...e, source: saved.id } : e).map(e => e.target === n.id ? { ...e, target: saved.id } : e));
              createCanvasEdge(docId, conn.source === n.id ? saved.id : conn.source!, conn.target === n.id ? saved.id : conn.target!).catch(console.error);
            });
          }
        }
        return n;
      }));
      return;
    }
    setEdges((eds) => addEdge({ ...conn, type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }, style: { stroke: '#64748b', strokeWidth: 2 } }, eds));
    createCanvasEdge(docId, conn.source, conn.target).catch(console.error);
  }, [docId]);

  const handleAddReasoning = useCallback(async () => {
    const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const node = await createReasoningNode(docId, 'New thought', '', center.x - 140, center.y - 50);
    setNodes((nds) => [...nds, {
      id: node.id, type: 'reasoning', position: { x: node.x, y: node.y }, width: node.width,
      data: { title: node.title, body: node.body, createdBy: node.createdBy, onDelete: handleDeleteNode, onUpdate: handleUpdateNodeData },
    }]);
  }, [docId, reactFlow, handleDeleteNode, handleUpdateNodeData, handleAiModeChange]);

  // Paste handler — detects image in clipboard and creates an image node
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        try {
          const node = await createImageNode(docId, file, center.x - 160, center.y - 100);
          setNodes((nds) => [...nds, {
            id: node.id, type: 'image', position: { x: node.x, y: node.y }, width: node.width,
            data: { imageUrl: node.imageUrl, title: node.title, createdBy: node.createdBy, onDelete: handleDeleteNode, onUpdate: handleUpdateNodeData },
          }]);
        } catch (err) { console.error('Failed to upload pasted image:', err); }
        return;
      }
    }
  }, [docId, reactFlow, handleDeleteNode, handleUpdateNodeData, handleAiModeChange]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // Add a new AI node at the center of the viewport
  const handleAddAi = useCallback(async () => {
    const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const node = await createAiNode(docId, 'explain', center.x - 160, center.y - 100);
    setNodes((nds) => [...nds, {
      id: node.id, type: 'ai', position: { x: node.x, y: node.y }, width: node.width,
      data: { mode: 'explain', createdBy: node.createdBy, onDelete: handleDeleteNode, onModeChange: handleAiModeChange },
    }]);
  }, [docId, reactFlow, handleDeleteNode, handleAiModeChange]);

  if (loading) return <div className="p-6 text-slate-500">Loading canvas…</div>;

  const dark = theme === 'dark';

  return (
    <div className="h-screen flex flex-col" style={{ background: dark ? '#18181b' : '#fff' }}>
      <div className="flex items-center gap-3 p-3 border-b bg-white z-10">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">← back to reader</button>
        <span className="font-semibold text-sm">Canvas View</span>
        <button onClick={handleAddReasoning}
          className="px-3 py-1.5 bg-rose-500 text-white rounded text-sm hover:bg-rose-600 flex items-center gap-1">
          + Reasoning node
        </button>
        <button onClick={handleAddAi}
          className="px-3 py-1.5 bg-cyan-600 text-white rounded text-sm hover:bg-cyan-700 flex items-center gap-1">
          + AI node
        </button>
        <span className="text-xs text-slate-400 ml-auto">Drag nodes · Drag from bottom dot to connect · Double-click to edit · Paste images with Ctrl+V · Select edge + Delete to remove</span>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color={dark ? '#27272a' : '#e2e8f0'} gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'reasoning') return '#fecaca';
              if (n.type === 'image') return '#cbd5e1';
              if (n.type === 'ai') return '#a5f3fc';
              const ann = n.data?.annotation as Annotation;
              const t = ann?.body?.type;
              return t === 'question' ? '#bfdbfe' : t === 'highlight' ? '#a7f3d0' : t === 'note' ? '#ddd6fe' : '#fde68a';
            }}
            className="!bg-white"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// ---- Outer component — wraps in ReactFlowProvider so useReactFlow() works ----
export function Canvas(props: { docId: string; annotations: Annotation[]; onBack: () => void; theme: 'light' | 'dark' }) {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
