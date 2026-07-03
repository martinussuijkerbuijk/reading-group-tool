import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, AnnotationBodyType, DocumentRecord } from '@cr/shared';
import { createAnnotation, deleteAnnotation, getDocument, listAnnotations, selectionToSelector } from '../api.ts';
import { useRealtime } from '../useRealtime.ts';

export function Reader({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ exact: string; prefix?: string; suffix?: string; rect: { top: number; left: number } } | null>(null);
  const [draftType, setDraftType] = useState<AnnotationBodyType>('comment');
  const [draftText, setDraftText] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [filterType, setFilterType] = useState<AnnotationBodyType | 'all'>('all');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  async function load() {
    const [d, a] = await Promise.all([getDocument(docId), listAnnotations(docId)]);
    setDoc(d); setAnns(a);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [docId]);

  // Realtime: live annotation sync + presence
  const { presentUsers, me } = useRealtime(docId, {
    onAnnotationCreated: (ann) => setAnns((a) => a.some((x) => x.id === ann.id) ? a : [...a, ann]),
    onAnnotationDeleted: (id) => setAnns((a) => a.filter((x) => x.id !== id && x.parentId !== id)),
  });

  // ---- Highlight rendering: wrap annotated text in <mark> using TextQuoteSelector ----
  // Walks text nodes after render; uses prefix/suffix to disambiguate multiple matches.
  useEffect(() => {
    if (!doc || !contentRef.current || anns.length === 0) return;
    const container = contentRef.current;

    // Build a flat list of text nodes with their character offsets.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: { node: Text; start: number }[] = [];
    let cumOffset = 0;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const tn = n as Text;
      textNodes.push({ node: tn, start: cumOffset });
      cumOffset += tn.nodeValue?.length ?? 0;
    }
    const fullText = container.textContent ?? '';

    // For each top-level annotation, find the best match and wrap it.
    // Process in reverse document order so earlier offsets stay valid.
    const matches: { start: number; end: number; annId: string }[] = [];
    for (const ann of anns) {
      if (ann.parentId) continue; // replies don't get their own highlight
      const sel = ann.target.selector[0];
      if (!sel?.exact) continue;

      // Find candidate positions for the exact string.
      const positions: number[] = [];
      let from = 0;
      while (true) {
        const idx = fullText.indexOf(sel.exact, from);
        if (idx === -1) break;
        positions.push(idx);
        from = idx + 1;
      }
      if (positions.length === 0) continue;

      // Disambiguate using prefix/suffix context.
      let best = positions[0];
      let bestScore = -1;
      for (const pos of positions) {
        let score = 0;
        if (sel.prefix) {
          const ctx = fullText.slice(Math.max(0, pos - sel.prefix.length), pos);
          if (ctx.endsWith(sel.prefix)) score += 2;
        }
        if (sel.suffix) {
          const ctx = fullText.slice(pos + sel.exact.length, pos + sel.exact.length + sel.suffix.length);
          if (ctx.startsWith(sel.suffix)) score += 2;
        }
        if (score > bestScore) { bestScore = score; best = pos; }
      }
      matches.push({ start: best, end: best + sel.exact.length, annId: ann.id });
    }

    if (matches.length === 0) return;

    // Sort descending by start so we can wrap without invalidating earlier offsets.
    matches.sort((a, b) => b.start - a.start);

    // Map a global character offset to a (textNode, localOffset) pair.
    function offsetToNode(offset: number): { node: Text; local: number } | null {
      // binary search the last textNode whose start <= offset
      let lo = 0, hi = textNodes.length - 1, ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (textNodes[mid].start <= offset) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (ans === -1) return null;
      const tn = textNodes[ans];
      return { node: tn.node, local: offset - tn.start };
    }

    for (const m of matches) {
      const start = offsetToNode(m.start);
      const end = offsetToNode(m.end);
      if (!start || !end) continue;
      try {
        const range = document.createRange();
        range.setStart(start.node, start.local);
        range.setEnd(end.node, end.local);
        const mark = document.createElement('mark');
        mark.className = 'cr-highlight';
        mark.dataset.annId = m.annId;
        mark.addEventListener('click', (e) => {
          e.stopPropagation();
          setActiveId(m.annId);
          // scroll sidebar into view
          document.getElementById('ann-' + m.annId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        range.surroundContents(mark);
      } catch {
        // surroundContents fails if range crosses element boundaries; skip gracefully.
      }
    }

    return () => {
      // Cleanup: unwrap any <mark.cr-highlight> we added.
      container.querySelectorAll('mark.cr-highlight').forEach((mk) => {
        const parent = mk.parentNode;
        if (!parent) return;
        while (mk.firstChild) parent.insertBefore(mk.firstChild, mk);
        parent.removeChild(mk);
        parent.normalize();
      });
    };
  }, [doc, anns]);

  // Apply active styling to the highlighted mark.
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.querySelectorAll('mark.cr-highlight').forEach((mk) => {
      mk.classList.toggle('cr-active', mk.dataset.annId === activeId);
    });
  }, [activeId, anns]);

  function onMouseUp() {
    if (!contentRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const result = selectionToSelector(contentRef.current);
    if (result && result.exact.length > 1) {
      // Position the popover just below the selection end, in viewport coords.
      // Using fixed positioning so it stays put regardless of scroll.
      setDraft({ ...result, rect: { top: rect.bottom + 8, left: rect.left } });
    }
  }

  async function submitDraft() {
    if (!draft || !doc) return;
    const tags = draftTags.split(',').map((t) => t.trim()).filter(Boolean);
    const ann = await createAnnotation(doc.id, {
      documentId: doc.id, groupId: doc.groupId,
      body: { type: draftType, value: draftText },
      target: { source: doc.id, selector: [{ type: 'TextQuoteSelector', exact: draft.exact, prefix: draft.prefix, suffix: draft.suffix }] },
      tags, parentId: null, provenance: 'human',
    });
    setAnns((a) => [...a, ann]);
    setDraft(null); setDraftText(''); setDraftTags('');
    window.getSelection()?.removeAllRanges();
  }

  async function submitReply(parentId: string) {
    if (!doc || !replyText.trim()) return;
    const ann = await createAnnotation(doc.id, {
      documentId: doc.id, groupId: doc.groupId,
      body: { type: 'comment', value: replyText },
      target: { source: doc.id, selector: [{ type: 'TextQuoteSelector', exact: '' }] },
      tags: [], parentId, provenance: 'human',
    });
    setAnns((a) => [...a, ann]);
    setReplyText(''); setReplyTo(null);
  }

  async function remove(annId: string) {
    await deleteAnnotation(annId);
    setAnns((a) => a.filter((x) => x.id !== annId && x.parentId !== annId));
    if (activeId === annId) setActiveId(null);
  }

  const allTags = useMemo(() => Array.from(new Set(anns.flatMap((a) => a.tags))).sort(), [anns]);
  const presentList = [me, ...presentUsers.filter((u) => u !== me)];

  if (!doc) return <div className="p-6 text-slate-500">Loading…</div>;

  const top = anns.filter((a) => !a.parentId);
  const filtered = filterType === 'all' ? top : top.filter((a) => a.body.type === filterType);

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
      <div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800 mb-3">← library</button>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <PresenceBar users={presentList} me={me} />
        </div>

        <div
          ref={contentRef}
          className="cr-prose select-text"
          onMouseUp={onMouseUp}
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />

        {doc.html.replace(/<[^>]*>/g, '').trim().length === 0 && (
          <div className="mt-4 p-4 border rounded bg-red-50 text-sm text-red-700">
            ⚠ No selectable text was extracted from this PDF. This can happen with scanned
            PDFs (images only). Try a text-based PDF, or check the server console for ingestion errors.
          </div>
        )}

        {draft && (
          <div
            className="fixed z-50 w-80 bg-white border border-amber-300 rounded-lg shadow-xl p-3"
            style={{
              top: Math.min(draft.rect.top, window.innerHeight - 260),
              left: Math.max(12, Math.min(draft.rect.left, window.innerWidth - 340)),
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-500">Annotating:</div>
              <button onClick={() => setDraft(null)} className="text-xs text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="text-sm italic mb-3 line-clamp-2">“{draft.exact}”</div>
            <div className="flex flex-wrap gap-2 mb-2">
              <select value={draftType} onChange={(e) => setDraftType(e.target.value as AnnotationBodyType)} className="border rounded px-2 py-1 text-sm">
                <option value="comment">Comment</option>
                <option value="question">Question</option>
                <option value="highlight">Highlight</option>
                <option value="note">Note</option>
              </select>
              <input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="tags (comma-separated)"
                className="border rounded px-2 py-1 text-sm flex-1 min-w-[140px]" />
            </div>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Annotations ({anns.length})</h2>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="border rounded px-2 py-1 text-xs">
            <option value="all">All types</option>
            <option value="comment">Comments</option>
            <option value="question">Questions</option>
            <option value="highlight">Highlights</option>
            <option value="note">Notes</option>
          </select>
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {allTags.map((t) => (
              <span key={t} className="text-xs px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">#{t}</span>
            ))}
          </div>
        )}

        {filtered.length === 0 && <p className="text-sm text-slate-400">Select text in the document to annotate.</p>}
        <ul className="space-y-3">
          {filtered.map((a) => {
            const replies = anns.filter((r) => r.parentId === a.id);
            return (
              <li key={a.id} id={'ann-' + a.id}
                  className={`p-3 border rounded ${activeId === a.id ? 'border-amber-400 bg-amber-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => {
                  const newId = a.id === activeId ? null : a.id;
                  setActiveId(newId);
                  if (newId) {
                    // scroll the document highlight into view
                    const mark = contentRef.current?.querySelector(`mark.cr-highlight[data-ann-id="${a.id}"]`);
                    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 capitalize">{a.body.type}</span>
                  <span className="text-xs text-slate-400">{a.creator}</span>
                </div>
                {a.target.selector[0]?.exact && (
                  <div className="text-xs italic text-slate-500 mt-1 line-clamp-2">“{a.target.selector[0].exact}”</div>
                )}
                {a.body.value && <div className="text-sm mt-1 whitespace-pre-wrap">{a.body.value}</div>}
                {a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {a.tags.map((t) => <span key={t} className="text-xs text-slate-500">#{t}</span>)}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => { setReplyTo(replyTo === a.id ? null : a.id); setReplyText(''); }}
                          className="text-xs text-slate-500 hover:text-slate-800">↩ reply</button>
                  <span className="text-xs text-slate-400">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
                  <button onClick={() => remove(a.id)} className="text-xs text-red-500 hover:underline ml-auto">delete</button>
                </div>

                {replyTo === a.id && (
                  <div className="mt-2 flex gap-2">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && replyText.trim()) submitReply(a.id); }}
                      placeholder="Reply…" className="flex-1 border rounded px-2 py-1 text-sm" autoFocus />
                    <button onClick={() => submitReply(a.id)} className="px-2 py-1 bg-slate-800 text-white rounded text-xs">Send</button>
                  </div>
                )}

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

function PresenceBar({ users, me }: { users: string[]; me: string }) {
  const palette = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
  return (
    <div className="flex items-center gap-1.5" title={`${users.length} reading now`}>
      {users.slice(0, 6).map((u, i) => (
        <div key={u} className={`${palette[i % palette.length]} text-white text-xs font-medium rounded-full w-7 h-7 flex items-center justify-center ring-2 ring-white`}
          title={u === me ? `${u} (you)` : u}>
          {u.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {users.length > 6 && <span className="text-xs text-slate-400">+{users.length - 6}</span>}
      <span className="text-xs text-slate-400 ml-1">{users.length === 1 ? 'just you' : `${users.length} reading`}</span>
    </div>
  );
}
