'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BonusRule } from '@prisma/client';
import CreateBonusRuleModal from './CreateBonusRuleModal';

function formatCents(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBps(bps: number | null) {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(2)}%`;
}

export default function BonusRulesAdmin() {
  const [rules, setRules] = useState<BonusRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<BonusRule | null>(null);

  const activeCount = useMemo(() => rules.filter((r) => r.isActive).length, [rules]);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/bonus-rules');
      if (!res.ok) throw new Error('Failed to load bonus rules');
      const data = (await res.json()) as BonusRule[];
      setRules(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bonus rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRules();
  }, []);

  const openCreate = () => {
    setSelectedRule(null);
    setIsModalOpen(true);
  };

  const openEdit = (rule: BonusRule) => {
    setSelectedRule(rule);
    setIsModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">
          {loading ? 'Loading…' : `${rules.length} rules • ${activeCount} active`}
        </div>
        <button onClick={openCreate} className="btn-primary px-3 py-1">
          New rule
        </button>
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto table-wrap">
        <table className="table-ui min-w-full">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Type</th>
              <th className="p-2">Active</th>
              <th className="p-2">Threshold</th>
              <th className="p-2">%</th>
              <th className="p-2">Flat</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-medium">{r.name}</td>
                <td className="p-2">{r.type}</td>
                <td className="p-2">{r.isActive ? 'Yes' : 'No'}</td>
                <td className="p-2">{formatCents(r.thresholdCents)}</td>
                <td className="p-2">{formatBps(r.percentageBps)}</td>
                <td className="p-2">{formatCents(r.flatAmountCents)}</td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => openEdit(r)}
                    className="px-2 py-1 text-xs border rounded hover:bg-zinc-50"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rules.length === 0 && (
              <tr>
                <td className="p-4 text-zinc-500" colSpan={7}>
                  No bonus rules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateBonusRuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchRules}
        rule={selectedRule}
      />
    </div>
  );
}
