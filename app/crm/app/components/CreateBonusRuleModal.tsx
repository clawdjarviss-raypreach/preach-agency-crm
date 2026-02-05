'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BonusRule, BonusTargetType } from '@prisma/client';

type BonusType = 'percentage' | 'flat' | 'milestone';

type CreatorOption = {
  id: string;
  username: string;
  displayName: string | null;
  platform: string;
  status: string;
};

interface CreateBonusRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  rule?: BonusRule | null;
}

type FormState = {
  name: string;
  description: string;

  type: BonusType;
  targetType: BonusTargetType;

  isActive: boolean;

  targetThreshold: string;
  percentageBps: string;
  flatAmountCents: string;

  multiplier: string;

  creatorId: string;
  startDate: string;
  endDate: string;
};

const TARGET_TYPES: Array<{ value: BonusTargetType; label: string }> = [
  { value: 'manual', label: 'Manual (no auto-eval)' },
  { value: 'net_revenue', label: 'Net Revenue' },
  { value: 'revenue', label: 'Gross Revenue' },
  { value: 'messages_sent', label: 'Messages Sent' },
  { value: 'new_subs', label: 'New Subscriptions' },
  { value: 'tips', label: 'Tips' },
];

function labelForType(t: BonusType) {
  if (t === 'percentage') return 'Percentage';
  if (t === 'flat') return 'Flat Amount';
  return 'Milestone';
}

function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return '';
  // Input expects YYYY-MM-DD.
  return new Date(d).toISOString().slice(0, 10);
}

export default function CreateBonusRuleModal({ isOpen, onClose, onSuccess, rule }: CreateBonusRuleModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    | null
    | {
        periodStart: string;
        periodEnd: string;
        qualified: Array<{
          chatterId: string;
          chatterName: string;
          chatterEmail: string;
          amountCents: number;
          description: string;
        }>;
      }
  >(null);

  const [formData, setFormData] = useState<FormState>({
    name: '',
    description: '',
    type: 'percentage',
    targetType: 'manual',
    isActive: true,
    targetThreshold: '',
    percentageBps: '',
    flatAmountCents: '',
    multiplier: '1.0',
    creatorId: '',
    startDate: '',
    endDate: '',
  });

  const typeHelp = useMemo(() => {
    if (formData.type === 'percentage') {
      return 'Percentage: awards percentageBps (basis points) of the selected target metric (e.g., net sales). You can also set a flat base amount (for promos).';
    }
    if (formData.type === 'flat') {
      return 'Flat: awards a fixed flatAmountCents when the target threshold is met.';
    }
    return 'Milestone: awards flatAmountCents when the target threshold is met (e.g. $100 when net sales ≥ $5,000).';
  }, [formData.type]);

  const thresholdHint = useMemo(() => {
    if (formData.targetType === 'revenue' || formData.targetType === 'net_revenue' || formData.targetType === 'tips') {
      return 'Cents (e.g., 500000 = $5,000.00)';
    }
    if (formData.targetType === 'messages_sent' || formData.targetType === 'new_subs') {
      return 'Count (e.g., 100)';
    }
    return 'Leave blank for manual rules.';
  }, [formData.targetType]);

  useEffect(() => {
    if (!isOpen) return;

    // Load creators for the scope dropdown.
    (async () => {
      try {
        setCreatorsLoading(true);
        const res = await fetch('/api/admin/creators');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as CreatorOption[];
        setCreators(data);
      } catch (e) {
        console.error('Failed to load creators:', e);
        // Non-blocking; dropdown can stay empty.
        setCreators([]);
      } finally {
        setCreatorsLoading(false);
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    setError(null);
    setPreview(null);
    setPreviewError(null);

    setFormData({
      name: rule?.name || '',
      description: rule?.description || '',
      type: (rule?.type as BonusType) || 'percentage',
      targetType: (rule?.targetType as BonusTargetType) || 'manual',
      isActive: rule?.isActive ?? true,
      targetThreshold: (rule?.targetThreshold ?? rule?.thresholdCents)?.toString() || '',
      percentageBps: rule?.percentageBps?.toString() || '',
      flatAmountCents: rule?.flatAmountCents?.toString() || '',
      multiplier: (rule?.multiplier ?? 1.0).toString(),
      creatorId: rule?.creatorId || '',
      startDate: toDateInputValue(rule?.startDate),
      endDate: toDateInputValue(rule?.endDate),
    });
  }, [rule, isOpen]);

  // Clear irrelevant fields when changing type/target type.
  useEffect(() => {
    setFormData((prev) => {
      const next = { ...prev };

      if (prev.type === 'flat') {
        next.percentageBps = '';
      }

      if (prev.type === 'percentage') {
        // keep flatAmountCents allowed for promo-style rules
      }

      if (prev.targetType === 'manual') {
        next.targetThreshold = '';
      }

      return next;
    });
  }, [formData.type, formData.targetType]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type: inputType } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: inputType === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const buildPayload = () => {
    const targetThreshold = formData.targetThreshold ? parseInt(formData.targetThreshold, 10) : null;

    // Keep legacy thresholdCents in sync so old code paths remain consistent.
    const thresholdCents = targetThreshold;

    const percentageBps = formData.percentageBps ? parseInt(formData.percentageBps, 10) : null;
    const flatAmountCents = formData.flatAmountCents ? parseInt(formData.flatAmountCents, 10) : null;

    const multiplier = formData.multiplier ? Number(formData.multiplier) : 1.0;

    return {
      name: formData.name,
      description: formData.description || null,
      type: formData.type,
      targetType: formData.targetType,
      isActive: formData.isActive,
      targetThreshold,
      thresholdCents,
      percentageBps,
      flatAmountCents,
      multiplier,
      creatorId: formData.creatorId || null,
      startDate: formData.startDate || null,
      endDate: formData.endDate || null,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = buildPayload();

      const url = rule ? `/api/bonus-rules/${rule.id}` : '/api/bonus-rules';
      const method = rule ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to save bonus rule');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bonus rule');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);

    try {
      const res = await fetch('/api/admin/bonus-rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule: buildPayload() }),
      });

      const json = (await res.json()) as {
        error?: string;
        periodStart?: string;
        periodEnd?: string;
        qualified?: unknown;
      };
      if (!res.ok) {
        throw new Error(json.error || 'Failed to preview');
      }

      const qualifiedRaw: unknown[] = Array.isArray(json.qualified) ? (json.qualified as unknown[]) : [];

      const qualified = qualifiedRaw.flatMap((q) => {
        if (!q || typeof q !== 'object') return [];
        const rec = q as Record<string, unknown>;

        const chatterId = typeof rec.chatterId === 'string' ? rec.chatterId : null;
        const chatterName = typeof rec.chatterName === 'string' ? rec.chatterName : null;
        const chatterEmail = typeof rec.chatterEmail === 'string' ? rec.chatterEmail : null;
        const description = typeof rec.description === 'string' ? rec.description : null;
        const amountCents = typeof rec.amountCents === 'number' ? rec.amountCents : null;

        if (!chatterId || !chatterName || !chatterEmail || !description || amountCents == null) return [];

        return [{ chatterId, chatterName, chatterEmail, description, amountCents }];
      });

      setPreview({
        periodStart: json.periodStart ?? '',
        periodEnd: json.periodEnd ?? '',
        qualified,
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Failed to preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!rule) return;
    if (!confirm(`Delete bonus rule "${rule.name}"? This cannot be undone.`)) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bonus-rules/${rule.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to delete bonus rule');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bonus rule');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card max-w-xl w-full mx-4">
        <div className="p-4 border-b border-zinc-200/50 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">{rule ? 'Edit Bonus Rule' : 'Create Bonus Rule'}</h2>
          <div className="mt-1 text-xs text-zinc-500">{labelForType(formData.type)} rule</div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              rows={2}
              placeholder="Internal notes (e.g., Valentine's promo)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              >
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Amount</option>
                <option value="milestone">Milestone</option>
              </select>
              <div className="mt-1 text-xs text-zinc-500">{typeHelp}</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Target Type *</label>
              <select
                name="targetType"
                value={formData.targetType}
                onChange={handleChange}
                className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-zinc-500">What metric triggers this rule.</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isActive"
              id="isActive"
              checked={formData.isActive}
              onChange={handleChange}
              className="w-4 h-4"
            />
            <label htmlFor="isActive" className="text-sm">
              Active
            </label>
          </div>

          {formData.targetType !== 'manual' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Target Threshold {formData.type === 'milestone' ? '*' : ''}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                name="targetThreshold"
                value={formData.targetThreshold}
                onChange={handleChange}
                className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
                placeholder={formData.targetType === 'messages_sent' ? '100' : '500000'}
              />
              <div className="mt-1 text-xs text-zinc-500">{thresholdHint}</div>
            </div>
          )}

          {formData.type === 'percentage' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Percentage (bps)</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  name="percentageBps"
                  value={formData.percentageBps}
                  onChange={handleChange}
                  className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
                  placeholder="200 (2%)"
                />
                <div className="mt-1 text-xs text-zinc-500">1% = 100 bps • 10% = 1000 bps</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Or Flat Base (cents)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  name="flatAmountCents"
                  value={formData.flatAmountCents}
                  onChange={handleChange}
                  className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
                  placeholder="5000 ($50)"
                />
                <div className="mt-1 text-xs text-zinc-500">Optional (useful with multipliers).</div>
              </div>
            </div>
          )}

          {(formData.type === 'flat' || formData.type === 'milestone') && (
            <div>
              <label className="block text-sm font-medium mb-1">Flat Amount (cents) *</label>
              <input
                type="number"
                min={0}
                step={1}
                name="flatAmountCents"
                value={formData.flatAmountCents}
                onChange={handleChange}
                className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Multiplier</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                name="multiplier"
                value={formData.multiplier}
                onChange={handleChange}
                className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              />
              <div className="mt-1 text-xs text-zinc-500">1.0 = normal • 2.0 = double</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Creator Scope</label>
              <select
                name="creatorId"
                value={formData.creatorId}
                onChange={handleChange}
                className="w-full rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
                disabled={creatorsLoading}
              >
                <option value="">All Creators (Global)</option>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.displayName || c.username) + (c.status !== 'active' ? ` (${c.status})` : '')}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-zinc-500">Optional.</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Active Period (optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className="rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              />
              <span className="text-xs text-zinc-500">to</span>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="rounded px-2 py-1 text-sm bg-transparent border border-zinc-300 dark:border-zinc-800"
              />
            </div>
            <div className="mt-1 text-xs text-zinc-500">Leave blank for always active.</div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handlePreview}
              className="btn-ghost px-3 py-1"
              disabled={previewLoading || loading}
              title="Preview which chatters would qualify (uses last 7 days of KPI snapshots)"
            >
              {previewLoading ? 'Previewing…' : 'Preview / Simulate'}
            </button>

            {rule && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                disabled={loading}
              >
                Delete
              </button>
            )}
          </div>

          {previewError && (
            <div className="text-xs text-red-600">Preview failed: {previewError}</div>
          )}

          {preview && (
            <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
              <div className="text-xs text-zinc-500">
                Preview period: {preview.periodStart.slice(0, 10)} → {preview.periodEnd.slice(0, 10)}
              </div>
              <div className="mt-2 font-medium">
                Qualified: {preview.qualified.length}
              </div>
              {preview.qualified.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto space-y-1 text-xs">
                  {preview.qualified.map((q) => (
                    <li key={q.chatterId + q.description} className="flex items-center justify-between gap-3">
                      <div className="truncate">
                        {q.chatterName} <span className="text-zinc-500">({q.chatterEmail})</span>
                        <div className="text-zinc-500 truncate">{q.description}</div>
                      </div>
                      <div className="whitespace-nowrap">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(q.amountCents / 100)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-ghost px-3 py-1" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary px-3 py-1" disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
