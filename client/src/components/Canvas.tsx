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
  createReasoningNode, createCanvasEdge, deleteCanvasEdge,
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

const nodeTypes = { annotation: AnnotationNode, reasoning: ReasoningNode };

// ---- Inner component (has access to ReactFlow context) ----
function CanvasContent({ docId, annotations, onBack }: {
  docId: string;
  annotations: Annotation[];
  onBack: () => void;
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
  const handleUpdateNodeData = useCallback((nodeId: string, title: string, body: string) => {
    setNodes((nds) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, title, body } } : n));
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

    setNodes([...annNodes, ...reasonNodes]);

    const newEdges: Edge[] = savedEdges.map((e) => ({
      id: e.id, source: e.sourceNodeId, target: e.targetNodeId,
      label: e.label ?? undefined, type: 'smoothstep', animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      style: { stroke: '#64748b', strokeWidth: 2 },
    }));
    setEdges(newEdges);
    setLoading(false);
  }, [docId, annotations, handleDeleteNode]);

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
        if (node.type === 'reasoning') {
          saveReasoningNodePosition(change.id, change.position.x, change.position.y);
        } else if (node.type === 'annotation') {
          const annId = (node.data as any)?.annotation?.id;
          if (annId) saveAnnotationNodePosition(change.id, annId, change.position.x, change.position.y);
        }
      }
      if (change.type === 'remove') {
        const node = nodes.find(n => n.id === change.id);
        if (node?.type === 'reasoning') deleteCanvasNode(change.id).catch(console.error);
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
  }, [docId, reactFlow, handleDeleteNode]);

  if (loading) return <div className="p-6 text-slate-500">Loading canvas…</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-3 p-3 border-b bg-white z-10">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">← back to reader</button>
        <span className="font-semibold text-sm">Canvas View</span>
        <button onClick={handleAddReasoning}
          className="px-3 py-1.5 bg-rose-500 text-white rounded text-sm hover:bg-rose-600 flex items-center gap-1">
          + Reasoning node
        </button>
        <span className="text-xs text-slate-400 ml-auto">Drag nodes · Drag from bottom dot to connect · Double-click reasoning nodes to edit · Select edge + Delete to remove</span>
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
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'reasoning') return '#fecaca';
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
export function Canvas(props: { docId: string; annotations: Annotation[]; onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
