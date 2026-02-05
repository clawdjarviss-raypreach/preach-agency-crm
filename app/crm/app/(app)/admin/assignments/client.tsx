'use client';

import { type FormEvent, useMemo, useState } from 'react';

type Row = {
  id: string;
  chatterName: string;
  chatterEmail: string;
  creatorLabel: string;
  isPrimary: boolean;
  assignedAt: string; // ISO
};

type UnassignedRow = {
  id: string;
  chatterName: string;
  creatorLabel: string;
  unassignedAt: string; // ISO
};

type ChatterRow = {
  id: string;
  name: string;
  email: string;
};

type CreatorRow = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
};

type AdminAssignmentsPayload = {
  activeRows: Row[];
  unassignedRows: UnassignedRow[];
};

interface AssignmentsClientProps {
  initialRows: Row[];
  unassignedRows: UnassignedRow[];
  chatters: ChatterRow[];
  creators: CreatorRow[];
}

export default function AssignmentsClient({
  initialRows,
  unassignedRows: initialUnassignedRows,
  chatters,
  creators,
}: AssignmentsClientProps) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [unassignedRows, setUnassignedRows] = useState<UnassignedRow[]>(initialUnassignedRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');

  const chatterOptions = useMemo(() => chatters, [chatters]);
  const creatorOptions = useMemo(() => creators, [creators]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.chatterName.toLowerCase().includes(q) ||
        r.chatterEmail.toLowerCase().includes(q) ||
        r.creatorLabel.toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const [chatterId, setChatterId] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const refetch = async () => {
    const res = await fetch('/api/admin/assignments');
    if (!res.ok) throw new Error('Failed to fetch assignments');

    const data = (await res.json()) as AdminAssignmentsPayload;
    setRows(data.activeRows);
    setUnassignedRows(data.unassignedRows);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatterId || !creatorId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatterId, creatorId, isPrimary }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to create assignment');
      }

      const data = (await res.json()) as AdminAssignmentsPayload;
      setRows(data.activeRows);
      setUnassignedRows(data.unassignedRows);

      setCreatorId('');
      setIsPrimary(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/assignments/set-primary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignmentId: id }),
      });

      if (!response.ok) throw new Error('Failed to set primary');

      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary');
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (id: string) => {
    if (!confirm('Unassign this chatter-creator pairing?')) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/assignments/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to unassign');

      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Assignments</h1>
          <p className="mt-2 text-sm text-zinc-600">Active chatter ↔ creator assignments (v0).</p>
        </div>
      </div>

      <div className="mt-6 rounded border bg-white p-4">
        <div className="text-sm font-medium">Add assignment</div>
        <p className="mt-1 text-xs text-zinc-500">
          V0: this only creates an active assignment. If &quot;Primary&quot; is checked, it clears any other
          primary assignments for that chatter.
        </p>

        <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600">Chatter</span>
            <select
              value={chatterId}
              onChange={(e) => setChatterId(e.target.value)}
              className="w-64 rounded border px-2 py-1 text-sm"
              required
            >
              <option value="">Select…</option>
              {chatterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600">Creator</span>
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              className="w-64 rounded border px-2 py-1 text-sm"
              required
            >
              <option value="">Select…</option>
              {creatorOptions.map((cr) => (
                <option key={cr.id} value={cr.id}>
                  {cr.displayName ?? cr.username} ({cr.platform})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pb-1 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4"
            />
            Primary
          </label>

          <button
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Adding…' : 'Add'}
          </button>
        </form>

        {error && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Active assignments</div>
          <div className="text-xs text-zinc-500">
            Showing {filteredRows.length} of {rows.length}
            {query.trim() ? ` (filtered)` : ''}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-600">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="chatter / email / creator"
            className="w-72 rounded border px-2 py-1 text-sm"
          />
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <div className="mt-3 rounded border bg-white p-4 text-sm text-zinc-600">
          {rows.length === 0 ? 'No active assignments yet.' : 'No matches.'}
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded border bg-white">
          <table className="table-ui">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Chatter</th>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2">Primary</th>
                <th className="px-3 py-2">Assigned</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((r) => (
                <tr key={r.id} >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.chatterName}</div>
                    <div className="text-xs text-zinc-500">{r.chatterEmail}</div>
                  </td>
                  <td className="px-3 py-2">{r.creatorLabel}</td>
                  <td className="px-3 py-2">
                    {r.isPrimary ? (
                      <span className="rounded bg-[color:var(--brand-soft)]/70 px-2 py-0.5 text-xs font-medium text-[color:var(--brand)]">
                        Primary
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{new Date(r.assignedAt).toLocaleString()}</td>
                  <td className="px-3 py-2 flex gap-2">
                    {!r.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(r.id)}
                        disabled={loading}
                        className="text-xs brand-link disabled:opacity-50"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      onClick={() => handleUnassign(r.id)}
                      disabled={loading}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Unassign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unassigned History */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recently Unassigned ({unassignedRows.length})</h2>

        {unassignedRows.length === 0 ? (
          <div className="mt-2 rounded border bg-white p-4 text-sm text-zinc-600">
            No unassigned history yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded border bg-white">
            <table className="table-ui">
              <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Chatter</th>
                  <th className="px-3 py-2">Creator</th>
                  <th className="px-3 py-2">Unassigned At</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unassignedRows.map((u) => (
                  <tr key={u.id} >
                    <td className="px-3 py-2 font-medium">{u.chatterName}</td>
                    <td className="px-3 py-2 text-zinc-600">{u.creatorLabel}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {new Date(u.unassignedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
