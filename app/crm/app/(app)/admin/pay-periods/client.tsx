'use client';

import { useState } from 'react';
import type { PayPeriod } from '@prisma/client';

type PeriodRow = PayPeriod & {
  payrolls: { id: string }[];
};

interface PayPeriodsClientProps {
  initialPeriods: PeriodRow[];
}

function formatDate(d: Date): string {
  return new Date(d).toISOString().split('T')[0];
}

function getDaysBetween(start: Date, end: Date): number {
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000));
}

export default function PayPeriodsClient({
  initialPeriods,
}: PayPeriodsClientProps) {
  const [periods, setPeriods] = useState<PeriodRow[]>(initialPeriods);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ startDate: '', endDate: '' });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.startDate || !formData.endDate) {
        setError('Please fill in all fields');
        setLoading(false);
        return;
      }

      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      if (start >= end) {
        setError('Start date must be before end date');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/pay-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create pay period');

      const created = await response.json();
      setPeriods((prev) => [{ ...created, payrolls: [] }, ...prev]);
      setShowForm(false);
      setFormData({ startDate: '', endDate: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pay period');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pay Periods</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage payroll periods for organizing shifts and payroll calculations.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          {showForm ? 'Cancel' : '+ New Period'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <div className="mb-6 rounded border bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Create Pay Period</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Start Date</span>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">End Date</span>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  required
                />
              </label>
            </div>
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

      {periods.length === 0 ? (
        <div className="rounded border bg-white p-4 text-sm text-zinc-600">
          No pay periods yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border bg-white">
          <table className="table-ui">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Start Date</th>
                <th className="px-3 py-2">End Date</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payrolls</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {periods.map((p) => (
                <tr key={p.id} >
                  <td className="px-3 py-2 font-medium">
                    {formatDate(p.startDate)}
                  </td>
                  <td className="px-3 py-2">{formatDate(p.endDate)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {getDaysBetween(p.startDate, p.endDate)} days
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.payrolls.length} payroll{p.payrolls.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
