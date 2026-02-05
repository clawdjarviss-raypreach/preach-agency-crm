'use client';

import { useState } from 'react';
import type { PayPeriod } from '@prisma/client';

type PayrollRow = {
  id: string;
  chatterId: string;
  chatter: { name: string; email: string };
  payPeriod: PayPeriod;
  hoursWorkedMinutes: number;
  basePayCents: number;
  grossSalesCents?: number | null;
  netSalesCents?: number | null;
  commissionCents?: number | null;
  bonusTotalCents: number;
  deductionsCents: number;
  netPayCents: number;
  status: string;
  bonuses: {
    id: string;
    amountCents: number;
    bonusRule: { name: string } | null;
  }[];
};

interface PayrollsClientProps {
  initialPayrolls: PayrollRow[];
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatMoney(cents: number): string {
  return USD.format(cents / 100);
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function PayrollsClient({
  initialPayrolls,
}: PayrollsClientProps) {
  const [payrolls, setPayrolls] = useState<PayrollRow[]>(initialPayrolls);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleGenerateClick = () => {
    // Set default dates (last 7 days)
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    setToDate(to.toISOString().split('T')[0]);
    setFromDate(from.toISOString().split('T')[0]);
    setShowGenerateForm(true);
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/payrolls/export');
      if (!response.ok) throw new Error('Failed to export payrolls');

      const csv = await response.text();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payrolls-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export payrolls');
    }
  };

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      setError('Please select both start and end dates');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/payrolls/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: fromDate, endDate: toDate }),
      });
      if (!response.ok) throw new Error('Failed to generate payrolls');

      // Reload to pick up new server-rendered data
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payrolls');
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyBonuses = async (payrollId: string) => {
    setLoading(payrollId);
    setError(null);

    try {
      const response = await fetch(`/api/payrolls/${payrollId}/apply-bonuses`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to apply bonuses');

      const updated = await response.json();

      // Update the payroll in state
      setPayrolls((prev) =>
        prev.map((p) =>
          p.id === payrollId
            ? {
                ...p,
                bonusTotalCents: updated.bonusTotalCents,
                netPayCents: updated.netPayCents,
                bonuses: updated.bonuses,
              }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply bonuses');
    } finally {
      setLoading(null);
    }
  };

  const handleApprovePayroll = async (payrollId: string) => {
    setLoading(payrollId);
    setError(null);

    try {
      const response = await fetch(`/api/payrolls/${payrollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true }),
      });

      if (!response.ok) throw new Error('Failed to approve payroll');

      const updated = await response.json();

      setPayrolls((prev) =>
        prev.map((p) =>
          p.id === payrollId
            ? { ...p, status: updated.status }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve payroll');
    } finally {
      setLoading(null);
    }
  };

  const handleUnapprovePayroll = async (payrollId: string) => {
    setLoading(payrollId);
    setError(null);

    try {
      const response = await fetch(`/api/payrolls/${payrollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: false }),
      });

      if (!response.ok) throw new Error('Failed to unapprove payroll');

      const updated = await response.json();

      setPayrolls((prev) =>
        prev.map((p) =>
          p.id === payrollId
            ? { ...p, status: updated.status }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unapprove payroll');
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Payrolls</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage payroll calculations and bonus applications.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="btn-outline text-xs"
          >
            Export CSV
          </button>
          <button
            onClick={handleGenerateClick}
            className="btn-primary text-xs"
          >
            Generate Payrolls
          </button>
        </div>
      </div>

      {showGenerateForm && (
        <div className="card mb-6 bg-zinc-50 dark:bg-zinc-950">
          <div className="text-sm font-medium mb-3">Generate Payrolls from Approved Shifts</div>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-black"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-black"
              />
            </label>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary px-3 py-1"
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
            <button
              onClick={() => setShowGenerateForm(false)}
              className="btn-ghost px-3 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {payrolls.length === 0 ? (
        <div className="card text-sm text-zinc-600 dark:text-zinc-400">
          No payrolls yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-ui">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Chatter</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Base Pay</th>
                <th className="px-3 py-2">Gross Sales</th>
                <th className="px-3 py-2">Net Sales</th>
                <th className="px-3 py-2">Commission</th>
                <th className="px-3 py-2">Bonuses</th>
                <th className="px-3 py-2">Deductions</th>
                <th className="px-3 py-2">Net Pay</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payrolls.map((p) => (
                <tr key={p.id} >
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.chatter.name}</div>
                    <div className="text-xs text-zinc-500">{p.chatter.email}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.payPeriod.startDate.toString().slice(0, 10)} to{' '}
                    {p.payPeriod.endDate.toString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatMinutes(p.hoursWorkedMinutes)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {formatMoney(p.basePayCents)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {p.grossSalesCents === null || p.grossSalesCents === undefined
                      ? '—'
                      : formatMoney(p.grossSalesCents)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {p.netSalesCents === null || p.netSalesCents === undefined
                      ? '—'
                      : formatMoney(p.netSalesCents)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {p.commissionCents === null || p.commissionCents === undefined
                      ? '—'
                      : formatMoney(p.commissionCents)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium">{formatMoney(p.bonusTotalCents)}</div>

                    {p.bonuses.length > 0 && (() => {
                      const auto = p.bonuses
                        .filter((b) => b.bonusRule != null)
                        .reduce((sum, b) => sum + b.amountCents, 0);
                      const manual = p.bonuses
                        .filter((b) => b.bonusRule == null)
                        .reduce((sum, b) => sum + b.amountCents, 0);

                      return (
                        <div className="mt-1 space-y-0.5">
                          <div className="text-xs text-zinc-500">Auto: {formatMoney(auto)}</div>
                          <div className="text-xs text-zinc-500">Manual: {formatMoney(manual)}</div>

                          <div className="mt-1 space-y-0.5">
                            {p.bonuses.map((b) => (
                              <div key={b.id} className="text-xs text-zinc-500">
                                {b.bonusRule?.name ?? 'Custom'}: {formatMoney(b.amountCents)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatMoney(p.deductionsCents)}
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold">
                    {formatMoney(p.netPayCents)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        p.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : p.status === 'paid'
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 flex gap-2 flex-wrap">
                    {p.status === 'draft' && (
                      <>
                        <button
                          onClick={() => handleApplyBonuses(p.id)}
                          disabled={loading === p.id}
                          className="text-xs brand-link disabled:opacity-50"
                        >
                          {loading === p.id ? 'Applying…' : 'Apply Bonuses'}
                        </button>
                        <button
                          onClick={() => handleApprovePayroll(p.id)}
                          disabled={loading === p.id}
                          className="text-xs brand-link disabled:opacity-50"
                        >
                          {loading === p.id ? 'Approving…' : 'Approve'}
                        </button>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <button
                        onClick={() => handleUnapprovePayroll(p.id)}
                        disabled={loading === p.id}
                        className="text-xs text-amber-600 hover:underline disabled:opacity-50"
                      >
                        {loading === p.id ? 'Reverting…' : 'Unapprove'}
                      </button>
                    )}
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
