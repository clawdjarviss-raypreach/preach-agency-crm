'use client';

import { useMemo, useState } from 'react';

type ShiftRow = {
  id: string;
  chatterId: string;
  chatterName: string;
  chatterEmail: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  notes: string | null;
  status: 'pending' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
};

interface ShiftsAdminClientProps {
  initialShifts: ShiftRow[];
}

function calculateDuration(
  clockIn: string,
  clockOut: string | null,
  breakMinutes: number
): string {
  if (!clockOut) return '(ongoing)';
  const startMs = new Date(clockIn).getTime();
  const endMs = new Date(clockOut).getTime();
  const durationMs = endMs - startMs;
  const minutes = Math.floor(durationMs / 60000) - breakMinutes;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function ShiftsAdminClient({
  initialShifts,
}: ShiftsAdminClientProps) {
  const [shifts, setShifts] = useState<ShiftRow[]>(initialShifts);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [editModal, setEditModal] = useState<{
    shiftId: string;
    breakMinutes: number;
    notes: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const handleSaveEdit = async () => {
    if (!editModal) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/shifts/${editModal.shiftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          breakMinutes: editModal.breakMinutes,
          notes: editModal.notes,
        }),
      });

      if (!response.ok) throw new Error('Failed to save shift');

      const updated = await response.json();

      // Update local state
      setShifts((prev) =>
        prev.map((s) =>
          s.id === editModal.shiftId
            ? {
                ...s,
                breakMinutes: updated.breakMinutes,
                notes: updated.notes,
              }
            : s
        )
      );
      setEditModal(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save shift');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleApprove = async (shiftId: string, nextApprove: boolean) => {
    setApproveLoadingId(shiftId);
    setApproveError(null);

    try {
      const response = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: nextApprove }),
      });

      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to update approval');
      }

      const updated = await response.json();

      setShifts((prev) =>
        prev.map((s) =>
          s.id === shiftId
            ? {
                ...s,
                status: updated.approvedAt ? 'approved' : 'pending',
                approvedBy: updated.approvedBy?.name ?? null,
                approvedAt: updated.approvedAt ?? null,
              }
            : s
        )
      );
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to update approval');
    } finally {
      setApproveLoadingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return shifts;
    return shifts.filter((s) => s.status === filter);
  }, [shifts, filter]);

  const pendingCount = useMemo(
    () => shifts.filter((s) => s.status === 'pending').length,
    [shifts]
  );
  const approvedCount = useMemo(
    () => shifts.filter((s) => s.status === 'approved').length,
    [shifts]
  );

  return (
    <main className="flex-1 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin — Shifts</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Global shift view for all chatters. Pending: {pendingCount} | Approved: {approvedCount}
        </p>

        {approveError && (
          <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{approveError}</div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2 border-b">
        {(['all', 'pending', 'approved'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              filter === status
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {status === 'all'
              ? `All (${shifts.length})`
              : status === 'pending'
                ? `Pending (${pendingCount})`
                : `Approved (${approvedCount})`}
          </button>
        ))}
      </div>

      {/* Shifts Table */}
      {filtered.length === 0 ? (
        <div className="rounded border bg-white p-4 text-sm text-zinc-600">
          No {filter !== 'all' ? filter : ''} shifts.
        </div>
      ) : (
        <div className="overflow-hidden rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Chatter</th>
                <th className="px-3 py-2">Clock In</th>
                <th className="px-3 py-2">Clock Out</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Break (min)</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Approved By</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.chatterName}</div>
                    <div className="text-xs text-zinc-500">{s.chatterEmail}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {new Date(s.clockIn).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.clockOut ? new Date(s.clockOut).toLocaleString() : '(ongoing)'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {calculateDuration(s.clockIn, s.clockOut, s.breakMinutes)}
                  </td>
                  <td className="px-3 py-2 text-xs">{s.breakMinutes}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        s.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.approvedBy ? (
                      <div>
                        <div>{s.approvedBy}</div>
                        <div className="text-zinc-500">
                          {s.approvedAt ? new Date(s.approvedAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {s.notes ? s.notes : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() =>
                          setEditModal({
                            shiftId: s.id,
                            breakMinutes: s.breakMinutes,
                            notes: s.notes || '',
                          })
                        }
                        className="text-xs text-blue-600 hover:underline text-left"
                      >
                        Edit
                      </button>

                      {s.clockOut && s.status === 'pending' && (
                        <button
                          onClick={() => handleToggleApprove(s.id, true)}
                          disabled={approveLoadingId === s.id}
                          className="text-xs text-emerald-700 hover:underline disabled:opacity-50 text-left"
                        >
                          {approveLoadingId === s.id ? 'Approving…' : 'Approve'}
                        </button>
                      )}

                      {s.status === 'approved' && (
                        <button
                          onClick={() => handleToggleApprove(s.id, false)}
                          disabled={approveLoadingId === s.id}
                          className="text-xs text-amber-700 hover:underline disabled:opacity-50 text-left"
                        >
                          {approveLoadingId === s.id ? 'Reverting…' : 'Unapprove'}
                        </button>
                      )}

                      {!s.clockOut && (
                        <span className="text-[11px] text-zinc-400">Approve disabled (ongoing)</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="rounded bg-white p-6 shadow-lg max-w-sm w-full">
            <h2 className="text-lg font-semibold mb-4">Edit Shift</h2>
            {editError && (
              <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
                {editError}
              </div>
            )}
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Break Minutes</span>
                <input
                  type="number"
                  min="0"
                  value={editModal.breakMinutes}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      breakMinutes: parseInt(e.target.value) || 0,
                    })
                  }
                  className="rounded border px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Notes</span>
                <textarea
                  value={editModal.notes}
                  onChange={(e) =>
                    setEditModal({ ...editModal, notes: e.target.value })
                  }
                  className="rounded border px-2 py-1 text-sm"
                  rows={3}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setEditModal(null)}
                disabled={editLoading}
                className="rounded px-3 py-1 text-sm bg-zinc-200 hover:bg-zinc-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editLoading}
                className="rounded px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
