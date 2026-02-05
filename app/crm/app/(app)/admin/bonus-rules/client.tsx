'use client';

import { useState } from 'react';
import CreateBonusRuleModal from '@/app/components/CreateBonusRuleModal';
import type { BonusRule } from '@prisma/client';

interface BonusRulesClientProps {
  initialRules: BonusRule[];
}

function formatCents(cents: number | null) {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatBps(bps: number | null) {
  if (bps === null) return '—';
  return `${(bps / 100).toFixed(2)}%`;
}

export default function BonusRulesClient({ initialRules }: BonusRulesClientProps) {
  const [rules, setRules] = useState<BonusRule[]>(initialRules);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<BonusRule | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const openCreateModal = () => {
    setSelectedRule(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rule: BonusRule) => {
    setSelectedRule(rule);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRule(null);
  };

  const refetch = async () => {
    const response = await fetch('/api/admin/bonus-rules');
    const data = (await response.json()) as BonusRule[];
    setRules(data);
  };

  const handleSuccess = async () => {
    try {
      await refetch();
    } catch (error) {
      console.error('Failed to fetch bonus rules:', error);
    }
  };

  const handleToggleActive = async (rule: BonusRule) => {
    setToggleLoading(rule.id);

    try {
      const res = await fetch(`/api/bonus-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: rule.name,
          type: rule.type,
          isActive: !rule.isActive,
          thresholdCents: rule.thresholdCents,
          percentageBps: rule.percentageBps,
          flatAmountCents: rule.flatAmountCents,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to toggle bonus rule');
      }

      const updated = (await res.json()) as BonusRule;
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle bonus rule');
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDelete = async (rule: BonusRule) => {
    const ok = confirm(`Delete bonus rule "${rule.name}"? This cannot be undone.`);
    if (!ok) return;

    setDeleteLoading(rule.id);

    try {
      const res = await fetch(`/api/bonus-rules/${rule.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to delete bonus rule');
      }

      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete bonus rule');
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Bonus Rules</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Configure reusable bonus rules (percentage/flat/milestone).
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          + Create Rule
        </button>
      </div>

      <div className="mt-4 overflow-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Type</th>
              <th className="p-2">Active</th>
              <th className="p-2">Threshold</th>
              <th className="p-2">Percent</th>
              <th className="p-2">Flat</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td className="p-2 text-zinc-500" colSpan={8}>
                  No bonus rules yet.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="border-t hover:bg-zinc-50">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.type}</td>
                  <td className="p-2">
                    <button
                      onClick={() => handleToggleActive(r)}
                      disabled={toggleLoading === r.id}
                      className={`rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                        r.isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                      title="Toggle active"
                    >
                      {toggleLoading === r.id ? '…' : r.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-2">{formatCents(r.thresholdCents)}</td>
                  <td className="p-2">{formatBps(r.percentageBps)}</td>
                  <td className="p-2">{formatCents(r.flatAmountCents)}</td>
                  <td className="p-2 text-xs">{new Date(r.createdAt).toISOString().slice(0, 10)}</td>
                  <td className="p-2 flex items-center gap-3">
                    <button
                      onClick={() => openEditModal(r)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deleteLoading === r.id}
                      className="text-red-600 hover:underline text-xs disabled:opacity-50"
                    >
                      {deleteLoading === r.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateBonusRuleModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
        rule={selectedRule}
      />
    </main>
  );
}
