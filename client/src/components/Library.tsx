import { useEffect, useRef, useState } from 'react';
import type { DocumentRecord, Group } from '@cr/shared';
import { listDocuments, uploadDocument } from '../api.ts';

export function Library({ group, onOpen, onChangeGroup, onGroupsChanged }: {
  group: Group;
  onOpen: (id: string) => void;
  onChangeGroup: () => void;
  onGroupsChanged: () => void;
}) {
  const [docs, setDocs] = useState<(DocumentRecord & { html?: undefined })[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setDocs(await listDocuments(group.id));
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [group.id]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      await uploadDocument(file, group.id, file.name.replace(/\.pdf$/i, ''));
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onChangeGroup} className="text-sm text-slate-500 hover:text-slate-800">← groups</button>
        <h2 className="text-xl font-semibold">{group.name}</h2>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} disabled={busy} />
        {busy && <span className="text-sm text-slate-500">ingesting…</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>

      {docs.length === 0 ? (
        <p className="text-slate-500">No documents yet. Upload a PDF to begin.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id}>
              <button onClick={() => onOpen(d.id)} className="w-full text-left p-4 border rounded hover:bg-slate-50">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-slate-400">{d.sourceFilename} · {new Date(d.createdAt).toLocaleString()}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
