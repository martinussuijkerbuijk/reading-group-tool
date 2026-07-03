import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, AnnotationBodyType, DocumentRecord } from '@cr/shared';
import { createAnnotation, deleteAnnotation, getDocument, listAnnotations, selectionToSelector } from '../api.ts';

export function Reader({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ exact: string; prefix?: string; suffix?: string } | null>(null);
  const [draftType, setDraftType] = useState<AnnotationBodyType>('comment');
  const [draftText, setDraftText] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  async function load() {
    const [d, a] = await Promise.all([getDocument(docId), listAnnotations(docId)]);
    setDoc(d); setAnns(a);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [docId]);

  // Highlight: wrap the first occurrence of each annotation's exact text.
  // (Phase 0 simplification — PositionSelector + robust anchoring in Phase 1.)
  const renderedHtml = useMemo(() => {
    if (!doc) return '';
    return doc.html;
  }, [doc]);

  function onMouseUp() {
    if (!contentRef.current) return;
    const sel = selectionToSelector(contentRef.current);
    if (sel && sel.exact.length > 1) setDraft(sel);
  }

  async function submitDraft() {
    if (!draft || !doc) return;
    const ann = await createAnnotation(doc.id, {
      documentId: doc.id, groupId: doc.groupId,
      body: { type: draftType, value: draftText },
      target: { source: doc.id, selector: [{ type: 'TextQuoteSelector', exact: draft.exact, prefix: draft.prefix, suffix: draft.suffix }] },
      tags: [], parentId: null, provenance: 'human',
    });
    setAnns((a) => [...a, ann]);
    setDraft(null); setDraftText('');
    window.getSelection()?.removeAllRanges();
  }

  async function remove(annId: string) {
    await deleteAnnotation(annId);
    setAnns((a) => a.filter((x) => x.id !== annId));
    if (activeId === annId) setActiveId(null);
  }

  if (!doc) return <div className="p-6 text-slate-500">Loading…</div>;

  const top = anns.filter((a) => !a.parentId);

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800 mb-3">← library</button>
        <h1 className="text-2xl font-bold mb-6">{doc.title}</h1>

        <div
          ref={contentRef}
          className="cr-prose"
          onMouseUp={onMouseUp}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />

        {draft && (
          <div className="mt-4 p-4 border rounded bg-amber-50">
            <div className="text-xs text-slate-500 mb-1">Annotating:</div>
            <div className="text-sm italic mb-3 line-clamp-2">“{draft.exact}”</div>
            <select value={draftType} onChange={(e) => setDraftType(e.target.value as AnnotationBodyType)} className="border rounded px-2 py-1 text-sm mb-2 mr-2">
              <option value="comment">Comment</option>
              <option value="question">Question</option>
              <option value="highlight">Highlight</option>
              <option value="note">Note</option>
            </select>
            <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={3}
              placeholder="Your note…" className="w-full border rounded p-2 text-sm mb-2" />
            <div className="flex gap-2">
              <button onClick={submitDraft} className="px-3 py-1.5 bg-slate-800 text-white rounded text-sm">Save</button>
              <button onClick={() => setDraft(null)} className="px-3 py-1.5 text-sm text-slate-500">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <aside className="border-l pl-6">
        <h2 className="font-semibold mb-3">Annotations ({anns.length})</h2>
        {top.length === 0 && <p className="text-sm text-slate-400">Select text in the document to annotate.</p>}
        <ul className="space-y-3">
          {top.map((a) => {
            const replies = anns.filter((r) => r.parentId === a.id);
            return (
              <li key={a.id} className={`p-3 border rounded cursor-pointer ${activeId === a.id ? 'border-amber-400 bg-amber-50' : 'hover:bg-slate-50'}`}
                  onClick={() => setActiveId(a.id === activeId ? null : a.id)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 capitalize">{a.body.type}</span>
                  <span className="text-xs text-slate-400">{a.creator}</span>
                </div>
                <div className="text-xs italic text-slate-500 mt-1 line-clamp-2">“{a.target.selector[0].exact}”</div>
                {a.body.value && <div className="text-sm mt-1">{a.body.value}</div>}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-400">{replies.length} replies</span>
                  <button onClick={(e) => { e.stopPropagation(); remove(a.id); }} className="text-xs text-red-500 hover:underline">delete</button>
                </div>
                {replies.length > 0 && (
                  <ul className="mt-2 ml-3 border-l pl-3 space-y-2">
                    {replies.map((r) => (
                      <li key={r.id} className="text-sm">
                        <span className="text-xs text-slate-400">{r.creator}: </span>{r.body.value}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
