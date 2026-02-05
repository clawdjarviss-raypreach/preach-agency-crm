'use client';

import { FormEvent, useState } from 'react';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'chatter';
  status: 'active' | 'inactive' | 'onboarding';
  supervisorId: string | null;
  hourlyRateCents?: number | null;
  createdAt: Date;
};

type SupervisorOption = {
  id: string;
  name: string;
  email: string;
};

interface UsersClientProps {
  initialUsers: UserRow[];
  supervisors: SupervisorOption[];
}

export default function UsersClient({ initialUsers, supervisors }: UsersClientProps) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{
    userId: string;
    supervisorId: string | null;
    hourlyRateCents: number | null;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'chatter' as const,
    status: 'active' as const,
    supervisorId: '' as string,
    hourlyRateUsd: '' as string,
  });

  const supervisorById = new Map(supervisors.map((s) => [s.id, s] as const));

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.name || !formData.email || !formData.password) {
        setError('Please fill in all fields');
        setLoading(false);
        return;
      }

      const hourlyRateCentsRaw = formData.hourlyRateUsd
        ? Math.round(parseFloat(formData.hourlyRateUsd) * 100)
        : null;

      if (formData.role === 'chatter' && formData.hourlyRateUsd && !Number.isFinite(hourlyRateCentsRaw)) {
        setError('Hourly rate must be a valid number');
        setLoading(false);
        return;
      }

      const hourlyRateCents = Number.isFinite(hourlyRateCentsRaw as number)
        ? (hourlyRateCentsRaw as number)
        : null;

      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        status: formData.status,
        supervisorId:
          formData.role === 'chatter' && formData.supervisorId
            ? formData.supervisorId
            : null,
        hourlyRateCents: formData.role === 'chatter' ? hourlyRateCents : null,
      };

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to create user');
      }

      const newUser = await response.json();
      setUsers((prev) => [newUser, ...prev]);
      setShowForm(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'chatter',
        status: 'active',
        supervisorId: '',
        hourlyRateUsd: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/admin/users/${editModal.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisorId: editModal.supervisorId,
          hourlyRateCents: editModal.hourlyRateCents,
        }),
      });

      if (!response.ok) throw new Error('Failed to update user');

      const updated = await response.json();
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editModal.userId
            ? { ...u, supervisorId: updated.supervisorId, hourlyRateCents: updated.hourlyRateCents }
            : u
        )
      );
      setEditModal(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Users</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage user accounts and permissions.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          {showForm ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded border bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Create User</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Name</span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="rounded border px-2 py-1 text-sm"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="rounded border px-2 py-1 text-sm"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Password</span>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="rounded border px-2 py-1 text-sm"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Role</span>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="chatter">Chatter</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
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
                  <option value="inactive">Inactive</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </label>
            </div>

            {formData.role === 'chatter' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-600">Supervisor (optional)</span>
                  <select
                    name="supervisorId"
                    value={formData.supervisorId}
                    onChange={handleInputChange}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="">None</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.email})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-600">Hourly rate ($/h)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    name="hourlyRateUsd"
                    value={formData.hourlyRateUsd}
                    onChange={handleInputChange}
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="e.g., 9.25"
                  />
                </label>
              </div>
            )}

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

      {users.length === 0 ? (
        <div className="rounded border bg-white p-4 text-sm text-zinc-600">
          No users yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border bg-white">
          <table className="table-ui">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Supervisor</th>
                <th className="px-3 py-2">$/h</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} >
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-xs">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        u.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : u.status === 'inactive'
                            ? 'bg-zinc-50 text-zinc-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u.supervisorId ? (
                      <span className="text-zinc-700">
                        {supervisorById.get(u.supervisorId)?.name ?? 'Unknown'}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {typeof u.hourlyRateCents === 'number'
                      ? (u.hourlyRateCents / 100).toFixed(2)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {typeof u.createdAt === 'string'
                      ? new Date(u.createdAt).toLocaleDateString()
                      : u.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        setEditModal({
                          userId: u.id,
                          supervisorId: u.supervisorId || '',
                          hourlyRateCents: u.hourlyRateCents || null,
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
          <div className="rounded bg-white p-6 shadow-lg max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Edit User</h2>
            {editError && (
              <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
                {editError}
              </div>
            )}
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Supervisor</span>
                <select
                  value={editModal.supervisorId || ''}
                  onChange={(e) =>
                    setEditModal({ ...editModal, supervisorId: e.target.value || null })
                  }
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="">None</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Hourly Rate ($/h)</span>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={
                    editModal.hourlyRateCents
                      ? (editModal.hourlyRateCents / 100).toFixed(2)
                      : ''
                  }
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      hourlyRateCents: e.target.value
                        ? Math.round(parseFloat(e.target.value) * 100)
                        : null,
                    })
                  }
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="e.g., 9.25"
                />
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
