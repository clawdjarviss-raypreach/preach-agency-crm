'use client';

import { useState } from 'react';

type PayrollRow = {
  id: string;
  chatter: { name: string; email?: string };
  payPeriod: { startDate: Date; endDate: Date };
  basePayCents: number;
  bonusTotalCents: number;
  netPayCents: number;
  bonuses: { id: string; amountCents: number }[];
};

interface PayrollApprovalsClientProps {
  pendingPayrolls: PayrollRow[];
  approvedPayrolls: PayrollRow[];
  paidPayrolls: PayrollRow[];
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatMoney(cents: number): string {
  return USD.format(cents / 100);
}

export default function PayrollApprovalsClient({
  pendingPayrolls: initialPending,
  approvedPayrolls: initialApproved,
  paidPayrolls: initialPaid,
}: PayrollApprovalsClientProps) {
  const [pending, setPending] = useState<PayrollRow[]>(initialPending);
  const [approved, setApproved] = useState<PayrollRow[]>(initialApproved);
  const [paid, setPaid] = useState<PayrollRow[]>(initialPaid);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (payrollId: string) => {
    if (!confirm('Approve this payroll?')) return;

    setLoading(payrollId);
    setError(null);

    try {
      const response = await fetch(`/api/payrolls/${payrollId}/approve`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to approve payroll');

      const approvedPayroll = await response.json();

      // Move from pending to approved
      setPending((prev) => prev.filter((p) => p.id !== payrollId));
      setApproved((prev) => [approvedPayroll, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve payroll');
    } finally {
      setLoading(null);
    }
  };

  const handleMarkPaid = async (payrollId: string) => {
    if (!confirm('Mark this payroll as paid?')) return;

    setLoading(payrollId);
    setError(null);

    try {
      const response = await fetch(`/api/payrolls/${payrollId}/mark-paid`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to mark payroll as paid');

      const paidPayroll = await response.json();

      // Move from approved to paid
      setApproved((prev) => prev.filter((p) => p.id !== payrollId));
      setPaid((prev) => [paidPayroll, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark payroll as paid');
    } finally {
      setLoading(null);
    }
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

  return (
    <main className="flex-1 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Payroll Approvals</h1>
          <p className="mt-1 text-sm text-zinc-600">Review and approve payrolls for your team.</p>
        </div>
        <button
          onClick={handleExport}
          className="rounded bg-zinc-600 text-white px-3 py-2 text-xs hover:bg-zinc-700"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Pending Payrolls */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold">Pending ({pending.length})</h2>

        {pending.length === 0 ? (
          <div className="mt-2 rounded border bg-white p-4 text-sm text-zinc-600">
            No pending payrolls.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded border bg-white">
            <table className="table-ui">
              <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Chatter</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Base Pay</th>
                  <th className="px-3 py-2">Bonuses</th>
                  <th className="px-3 py-2">Net Pay</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.map((p) => (
                  <tr key={p.id} >
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.chatter.name}</div>
                      {p.chatter.email && (
                        <div className="text-xs text-zinc-500">{p.chatter.email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {new Date(p.payPeriod.startDate).toISOString().slice(0, 10)} to{' '}
                      {new Date(p.payPeriod.endDate).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 font-medium">{formatMoney(p.basePayCents)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{formatMoney(p.bonusTotalCents)}</div>
                      {p.bonuses.length > 0 && (
                        <div className="text-xs text-zinc-500">
                          {p.bonuses.length} rule{p.bonuses.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-lg font-semibold">
                      {formatMoney(p.netPayCents)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={loading === p.id}
                        className="text-xs brand-link disabled:opacity-50"
                      >
                        {loading === p.id ? 'Approving…' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approved Payrolls */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Approved ({approved.length})</h2>

        {approved.length === 0 ? (
          <div className="mt-2 rounded border bg-white p-4 text-sm text-zinc-600">
            No approved payrolls yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded border bg-white">
            <table className="table-ui">
              <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Chatter</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Base Pay</th>
                  <th className="px-3 py-2">Bonuses</th>
                  <th className="px-3 py-2">Net Pay</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {approved.map((p) => (
                  <tr key={p.id} >
                    <td className="px-3 py-2 font-medium">{p.chatter.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {new Date(p.payPeriod.startDate).toISOString().slice(0, 10)} to{' '}
                      {new Date(p.payPeriod.endDate).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 font-medium">{formatMoney(p.basePayCents)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{formatMoney(p.bonusTotalCents)}</div>
                      {p.bonuses.length > 0 && (
                        <div className="text-xs text-zinc-500">
                          {p.bonuses.length} rule{p.bonuses.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-lg font-semibold">
                      {formatMoney(p.netPayCents)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleMarkPaid(p.id)}
                        disabled={loading === p.id}
                        className="text-xs brand-link disabled:opacity-50"
                      >
                        {loading === p.id ? 'Marking…' : 'Mark Paid'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paid Payrolls */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Paid ({paid.length})</h2>

        {paid.length === 0 ? (
          <div className="mt-2 rounded border bg-white p-4 text-sm text-zinc-600">
            No paid payrolls yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded border bg-white">
            <table className="table-ui">
              <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Chatter</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Base Pay</th>
                  <th className="px-3 py-2">Bonuses</th>
                  <th className="px-3 py-2">Net Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paid.map((p) => (
                  <tr key={p.id} >
                    <td className="px-3 py-2 font-medium">{p.chatter.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {new Date(p.payPeriod.startDate).toISOString().slice(0, 10)} to{' '}
                      {new Date(p.payPeriod.endDate).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 font-medium">{formatMoney(p.basePayCents)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{formatMoney(p.bonusTotalCents)}</div>
                      {p.bonuses.length > 0 && (
                        <div className="text-xs text-zinc-500">
                          {p.bonuses.length} rule{p.bonuses.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-lg font-semibold">
                      {formatMoney(p.netPayCents)}
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
