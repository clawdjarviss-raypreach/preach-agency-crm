'use client';

import { useEffect, useMemo, useState } from 'react';
import CreateBonusRuleModal from '@/app/components/CreateBonusRuleModal';
import type { BonusRule } from '@prisma/client';

type CreatorOption = {
  id: string;
  username: string;
  displayName: string | null;
  platform: string;
  status: string;
};

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

function formatDate(d: Date | string | null) {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function targetLabel(t: BonusRule['targetType']) {
  switch (t) {
    case 'revenue':
      return 'Gross Revenue';
    case 'net_revenue':
      return 'Net Revenue';
    case 'messages_sent':
      return 'Messages';
    case 'new_subs':
      return 'New Subs';
    case 'tips':
      return 'Tips';
    case 'manual':
    default:
      return 'Manual';
  }
}

export default function BonusRulesClient({ initialRules }: BonusRulesClientProps) {
  const [rules, setRules] = useState<BonusRule[]>(initialRules);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<BonusRule | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const [creators, setCreators] = useState<CreatorOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/creators');
        if (!res.ok) return;
        const data = (await res.json()) as CreatorOption[];
        setCreators(data);
      } catch {
        // non-blocking
      }
    })();
  }, []);

  const creatorsById = useMemo(() => new Map(creators.map((c) => [c.id, c] as const)), [creators]);

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
          description: rule.description,
          type: rule.type,
          targetType: rule.targetType,
          isActive: !rule.isActive,
          thresholdCents: rule.thresholdCents,
          targetThreshold: rule.targetThreshold,
          percentageBps: rule.percentageBps,
          flatAmountCents: rule.flatAmountCents,
          multiplier: rule.multiplier,
          creatorId: rule.creatorId,
          startDate: rule.startDate,
          endDate: rule.endDate,
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
          <p className="mt-1 text-sm text-zinc-600">Define auto-applied bonus rules (targets, scopes, multipliers).</p>
        </div>
        <button onClick={openCreateModal} className="btn-primary px-3 py-1">
          + Create Rule
        </button>
      </div>

      <div className="mt-4 overflow-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="table-ui min-w-full text-sm">
          <thead>
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Type</th>
              <th className="p-2">Target</th>
              <th className="p-2">Threshold</th>
              <th className="p-2">Percent</th>
              <th className="p-2">Flat</th>
              <th className="p-2">×</th>
              <th className="p-2">Scope</th>
              <th className="p-2">Active Period</th>
              <th className="p-2">Active</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td className="p-2 text-zinc-500" colSpan={12}>
                  No bonus rules yet.
                </td>
              </tr>
            ) : (
              rules.map((r) => {
                const start = formatDate(r.startDate);
                const end = formatDate(r.endDate);
                const creator = r.creatorId ? creatorsById.get(r.creatorId) : null;

                const threshold = r.targetThreshold ?? r.thresholdCents;
                const thresholdDisplay =
                  threshold == null
                    ? '—'
                    : r.targetType === 'messages_sent' || r.targetType === 'new_subs'
                      ? threshold.toString()
                      : formatCents(threshold);

                return (
                  <tr key={r.id} className="border-t border-zinc-200/50 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-950">
                    <td className="p-2">
                      <div className="font-medium">{r.name}</div>
                      {r.description && <div className="text-xs text-zinc-500 truncate max-w-[360px]">{r.description}</div>}
                    </td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2">{targetLabel(r.targetType)}</td>
                    <td className="p-2">{r.targetType === 'manual' ? '—' : thresholdDisplay}</td>
                    <td className="p-2">{formatBps(r.percentageBps)}</td>
                    <td className="p-2">{formatCents(r.flatAmountCents)}</td>
                    <td className="p-2">{(r.multiplier ?? 1).toFixed(2)}</td>
                    <td className="p-2">
                      {r.creatorId ? (
                        <span className="rounded bg-[color:var(--brand-soft)]/60 text-[color:var(--brand)] px-2 py-0.5 text-xs font-medium">
                          {creator ? creator.displayName || creator.username : 'Creator'}
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-100 dark:bg-zinc-950 px-2 py-0.5 text-xs">Global</span>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {start || end ? `${start ?? '∞'} — ${end ?? '∞'}` : 'Always'}
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => handleToggleActive(r)}
                        disabled={toggleLoading === r.id}
                        className={`rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                          r.isActive
                            ? 'bg-[color:var(--brand-soft)]/60 text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/80'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900'
                        }`}
                        title="Toggle active"
                      >
                        {toggleLoading === r.id ? '…' : r.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="p-2 text-xs">{new Date(r.createdAt).toISOString().slice(0, 10)}</td>
                    <td className="p-2 flex items-center gap-3">
                      <button onClick={() => openEditModal(r)} className="text-xs brand-link">
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateBonusRuleModal isOpen={isModalOpen} onClose={handleModalClose} onSuccess={handleSuccess} rule={selectedRule} />
    </main>
  );
}
