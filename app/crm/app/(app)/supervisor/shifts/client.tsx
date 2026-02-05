'use client';

import { useMemo, useState } from 'react';

type ShiftRow = {
  id: string;
  chatterName: string;
  chatterEmail: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  notes: string | null;
  status: 'pending' | 'approved';
};

async function patchShift(id: string, approve: boolean) {
  const res = await fetch(`/api/shifts/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approve }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Failed');
  }

  return res.json();
}

export default function SupervisorShiftsClient({ initialShifts }: { initialShifts: ShiftRow[] }) {
  const [shifts, setShifts] = useState<ShiftRow[]>(initialShifts);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(() => shifts.filter((s) => s.status === 'pending'), [shifts]);
  const approved = useMemo(() => shifts.filter((s) => s.status === 'approved'), [shifts]);

  const onApprove = async (id: string, approve: boolean) => {
    setLoadingId(id);
    setError(null);
    try {
      await patchShift(id, approve);
      // v0: update locally (avoid extra endpoint)
      setShifts((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: approve ? 'approved' : 'pending' } : s))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update shift');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Supervisor — Shift Approvals</h1>
          <p className="mt-2 text-sm text-zinc-600">Approve shifts for your team (v0).</p>
        </div>
      </div>

      {error && <div className="mt-4 rounded border bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6">
        <div className="text-sm font-medium">Pending ({pending.length})</div>

        {pending.length === 0 ? (
          <div className="mt-2 rounded border bg-white p-4 text-sm text-zinc-600">No pending shifts.</div>
        ) : (
          <div className="mt-3 overflow-hidden rounded border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Chatter</th>
                  <th className="px-3 py-2">Clock in</th>
                  <th className="px-3 py-2">Clock out</th>
                  <th className="px-3 py-2">Break</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.map((s) => {
                  const canApprove = !!s.clockOut;
                  return (
                    <tr key={s.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{s.chatterName}</div>
                        <div className="text-xs text-zinc-500">{s.chatterEmail}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{new Date(s.clockIn).toLocaleString()}</td>
                      <td className="px-3 py-2 text-zinc-600">
                        {s.clockOut ? new Date(s.clockOut).toLocaleString() : '— (open)'}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{s.breakMinutes}</td>
                      <td className="px-3 py-2 text-zinc-600">{s.notes ?? '—'}</td>
                      <td className="px-3 py-2">
                        <button
                          className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
                          disabled={loadingId === s.id || !canApprove}
                          onClick={() => onApprove(s.id, true)}
                          title={canApprove ? 'Approve shift' : 'Cannot approve an open shift'}
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-10">
        <div className="text-sm font-medium">Approved ({approved.length})</div>

        {approved.length === 0 ? (
          <div className="mt-2 rounded border bg-white p-4 text-sm text-zinc-600">No approved shifts yet.</div>
        ) : (
          <div className="mt-3 overflow-hidden rounded border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Chatter</th>
                  <th className="px-3 py-2">Clock in</th>
                  <th className="px-3 py-2">Clock out</th>
                  <th className="px-3 py-2">Break</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {approved.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.chatterName}</div>
                      <div className="text-xs text-zinc-500">{s.chatterEmail}</div>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{new Date(s.clockIn).toLocaleString()}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      {s.clockOut ? new Date(s.clockOut).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{s.breakMinutes}</td>
                    <td className="px-3 py-2">
                      <button
                        className="text-xs text-zinc-600 hover:underline disabled:opacity-50"
                        disabled={loadingId === s.id}
                        onClick={() => onApprove(s.id, false)}
                        title="Mark as pending"
                      >
                        Unapprove
                      </button>
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
