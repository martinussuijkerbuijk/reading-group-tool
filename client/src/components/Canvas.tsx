import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  applyNodeChanges, applyEdgeChanges, addEdge,
  Handle, Position, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Annotation, CanvasNode, CanvasEdge } from '@cr/shared';
import {
  getCanvasNodes, getCanvasEdges, upsertCanvasNode, createCanvasEdge, deleteCanvasEdge,
} from '../api.ts';
import { Markdown } from './Markdown.tsx';

const TYPE_STYLES: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  comment:   { bg: 'bg-amber-50',   border: 'border-amber-300',   dot: 'bg-amber-400',   label: 'Comment' },
  question:  { bg: 'bg-blue-50',    border: 'border-blue-300',    dot: 'bg-blue-400',    label: 'Question' },
  highlight: { bg: 'bg-emerald-50', border: 'border-emerald-300', dot: 'bg-emerald-400', label: 'Highlight' },
  note:      { bg: 'bg-purple-50',  border: 'border-purple-300',  dot: 'bg-purple-400',  label: 'Note' },
};

// Custom node component — renders an annotation as a draggable card
function AnnotationNode({ data, id }: { data: any; id: string }) {
  const ann = data.annotation as Annotation;
  const style = TYPE_STYLES[ann.body.type] ?? TYPE_STYLES.comment;
  const quoteSel = ann.target.selector.find((s: any) => s.type === 'TextQuoteSelector');

  return (
    <div className={`cr-canvas-node ${style.bg} ${style.border} border rounded-lg shadow-sm p-3 w-full`} style={{ minWidth: 200, maxWidth: 320 }}>
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
        <div className="text-xs italic text-slate-500 mb-1.5 line-clamp-2 border-l-2 border-slate-300 pl-2">
          {quoteSel.exact}
        </div>
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

const nodeTypes = { annotation: AnnotationNode };

export function Canvas({ docId, annotations, onBack }: {
  docId: string;
  annotations: Annotation[];
  onBack: () => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load saved canvas state
  const loadCanvas = useCallback(async () => {
    const [savedNodes, savedEdges] = await Promise.all([getCanvasNodes(docId), getCanvasEdges(docId)]);
    const nodeMap = new Map(savedNodes.map((n) => [n.annotationId, n]));

    // Build nodes from annotations — position from saved data, or auto-layout in a grid
    const newNodes: Node[] = annotations
      .filter((a) => !a.parentId)
      .map((ann, i) => {
        const saved = nodeMap.get(ann.id);
        const col = i % 3;
        const row = Math.floor(i / 3);
        return {
          id: ann.id,
          type: 'annotation',
          position: saved ? { x: saved.x, y: saved.y } : { x: 40 + col * 300, y: 40 + row * 220 },
          width: saved?.width ?? 260,
          data: { annotation: ann },
        };
      });
    setNodes(newNodes);

    const newEdges: Edge[] = savedEdges.map((e) => ({
      id: e.id,
      source: e.sourceAnnotationId,
      target: e.targetAnnotationId,
      label: e.label ?? undefined,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
      style: { stroke: '#64748b', strokeWidth: 2 },
    }));
    setEdges(newEdges);
    setLoading(false);
  }, [docId, annotations]);

  useEffect(() => { loadCanvas(); }, [loadCanvas]);

  // Sync when annotations change (e.g. new annotation from realtime)
  useEffect(() => {
    setNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const newNodes: Node[] = [];
      let i = prev.length;
      for (const ann of annotations.filter((a) => !a.parentId && !existingIds.has(a.id))) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        newNodes.push({
          id: ann.id, type: 'annotation',
          position: { x: 40 + col * 300, y: 40 + row * 220 },
          width: 260, data: { annotation: ann },
        });
        i++;
      }
      // Also update data for existing nodes (in case annotation content changed)
      const updated = prev.map((n) => {
        const ann = annotations.find((a) => a.id === n.id);
        return ann ? { ...n, data: { ...n.data, annotation: ann } } : n;
      });
      return [...updated, ...newNodes];
    });
  }, [annotations]);

  // Debounced save of node position
  const saveNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    const timer = saveTimer.current.get(nodeId);
    if (timer) clearTimeout(timer);
    saveTimer.current.set(nodeId, setTimeout(async () => {
      try {
        await upsertCanvasNode(docId, nodeId, x, y);
      } catch (e) {
        console.error('Failed to save node position:', e);
      }
    }, 400));
  }, [docId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    // Save position on drag end
    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false) {
        saveNodePosition(change.id, change.position.x, change.position.y);
      }
    }
  }, [saveNodePosition]);

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
    setEdges((eds) => addEdge({ ...conn, type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }, style: { stroke: '#64748b', strokeWidth: 2 } }, eds));
    createCanvasEdge(docId, conn.source, conn.target).catch(console.error);
  }, [docId]);

  if (loading) return <div className="p-6 text-slate-500">Loading canvas…</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-3 p-3 border-b bg-white z-10">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">← back to reader</button>
        <span className="font-semibold text-sm">Canvas View</span>
        <span className="text-xs text-slate-400">Drag nodes to position · Drag from bottom dot to connect · Select edge + Delete to remove</span>
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
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
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
