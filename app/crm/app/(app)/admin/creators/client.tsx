'use client';

import { FormEvent, useState } from 'react';

type CreatorRow = {
  id: string;
  platform: 'onlyfans' | 'fansly' | 'other';
  username: string;
  displayName: string | null;
  status: 'active' | 'paused' | 'churned';
  createdAt: Date;
};

export default function CreatorsClient({ initialCreators }: { initialCreators: CreatorRow[] }) {
  const [creators, setCreators] = useState<CreatorRow[]>(initialCreators);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{
    creatorId: string;
    displayName: string;
    status: 'active' | 'paused' | 'churned';
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    platform: 'onlyfans' as const,
    username: '',
    displayName: '',
    status: 'active' as const,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.username.trim()) {
        setError('Username is required');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: formData.platform,
          username: formData.username.trim(),
          displayName: formData.displayName.trim() || null,
          status: formData.status,
        }),
      });

      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to create creator');
      }

      const created = await response.json();
      setCreators((prev) => [created, ...prev]);
      setShowForm(false);
      setFormData({ platform: 'onlyfans', username: '', displayName: '', status: 'active' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create creator');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/creators/${editModal.creatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editModal.status,
          displayName: editModal.displayName || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update creator');

      const updated = await response.json();
      setCreators((prev) =>
        prev.map((c) =>
          c.id === editModal.creatorId
            ? { ...c, status: updated.status, displayName: updated.displayName }
            : c
        )
      );
      setEditModal(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update creator');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Creators</h1>
          <p className="mt-1 text-sm text-zinc-600">Basic creator registry. V0: add creators manually here.</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          {showForm ? 'Cancel' : '+ New Creator'}
        </button>
      </div>

      {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <div className="mb-6 rounded border bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Create Creator</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Platform</span>
                <select
                  name="platform"
                  value={formData.platform}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="onlyfans">OnlyFans</option>
                  <option value="fansly">Fansly</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Status</span>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="churned">Churned</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Username (unique per platform)</span>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="rounded border px-2 py-1 text-sm"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Display name (optional)</span>
              <input
                type="text"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                className="rounded border px-2 py-1 text-sm"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-3 py-1"
            >
              {loading ? 'Creating…' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {creators.length === 0 ? (
        <div className="rounded border bg-white p-4 text-sm text-zinc-600">No creators yet.</div>
      ) : (
        <div className="overflow-hidden rounded border bg-white">
          <table className="table-ui">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Display</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {creators.map((c) => (
                <tr key={c.id} >
                  <td className="px-3 py-2">{c.platform}</td>
                  <td className="px-3 py-2 font-medium">{c.username}</td>
                  <td className="px-3 py-2 text-zinc-600">{c.displayName ?? '-'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        c.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : c.status === 'paused'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {typeof c.createdAt === 'string'
                      ? new Date(c.createdAt).toLocaleDateString()
                      : c.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        setEditModal({
                          creatorId: c.id,
                          displayName: c.displayName || '',
                          status: c.status,
                        })
                      }
                      className="text-xs brand-link"
                    >
                      Edit
                    </button>
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
          <div className="card p-6 shadow-lg max-w-sm w-full">
            <h2 className="text-lg font-semibold mb-4">Edit Creator</h2>
            {editError && (
              <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
                {editError}
              </div>
            )}
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Display Name</span>
                <input
                  type="text"
                  value={editModal.displayName}
                  onChange={(e) =>
                    setEditModal({ ...editModal, displayName: e.target.value })
                  }
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="e.g., Jane Doe"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Status</span>
                <select
                  value={editModal.status}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      status: e.target.value as 'active' | 'paused' | 'churned',
                    })
                  }
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="churned">Churned</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setEditModal(null)}
                disabled={editLoading}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editLoading}
                className="btn-primary px-3 py-1"
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
