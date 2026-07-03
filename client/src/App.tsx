import { useEffect, useState } from 'react';
import type { Group } from '@cr/shared';
import { listGroups, createGroup } from './api.ts';
import { Library } from './components/Library.tsx';
import { Reader } from './components/Reader.tsx';

export default function App() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  async function refreshGroups() {
    setGroups(await listGroups());
  }
  useEffect(() => { refreshGroups(); }, []);

  async function newGroup() {
    const name = prompt('Group name?');
    if (!name) return;
    const created = await createGroup(name);
    setGroups((prev) => [created, ...prev]);
  }

  if (activeDocId) {
    return <Reader docId={activeDocId} onBack={() => setActiveDocId(null)} />;
  }
  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Collective Reading</h1>
        <button onClick={newGroup} className="px-3 py-1.5 bg-slate-800 text-white rounded text-sm hover:bg-slate-700">+ New group</button>
      </header>

      {!activeGroup ? (
        <GroupPicker groups={groups} onPick={setActiveGroup} />
      ) : (
        <Library group={activeGroup} onOpen={(id) => setActiveDocId(id)} onChangeGroup={() => setActiveGroup(null)} onGroupsChanged={refreshGroups} />
      )}
    </div>
  );
}

function GroupPicker({ groups, onPick }: { groups: Group[]; onPick: (g: Group) => void }) {
  if (groups.length === 0)
    return <p className="text-slate-500">No groups yet. Create one to start reading together.</p>;
  return (
    <ul className="space-y-2">
      {groups.map((g) => (
        <li key={g.id}>
          <button onClick={() => onPick(g)} className="w-full text-left p-4 border rounded hover:bg-slate-50">
            <div className="font-medium">{g.name}</div>
            <div className="text-xs text-slate-400">created {new Date(g.createdAt).toLocaleDateString()}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
