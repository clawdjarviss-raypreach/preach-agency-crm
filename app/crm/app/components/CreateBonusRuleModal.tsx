'use client';

import { useEffect, useState } from 'react';
import type { BonusRule } from '@prisma/client';

interface CreateBonusRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  rule?: BonusRule | null;
}

export default function CreateBonusRuleModal({
  isOpen,
  onClose,
  onSuccess,
  rule,
}: CreateBonusRuleModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'percentage',
    isActive: true,
    thresholdCents: '',
    percentageBps: '',
    flatAmountCents: '',
  });

  useEffect(() => {
    // Keep form state in sync when switching between create/edit
    setError(null);
    setFormData({
      name: rule?.name || '',
      type: rule?.type || 'percentage',
      isActive: rule?.isActive ?? true,
      thresholdCents: rule?.thresholdCents?.toString() || '',
      percentageBps: rule?.percentageBps?.toString() || '',
      flatAmountCents: rule?.flatAmountCents?.toString() || '',
    });
  }, [rule, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type: inputType } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        inputType === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        isActive: formData.isActive,
        thresholdCents: formData.thresholdCents ? parseInt(formData.thresholdCents) : null,
        percentageBps: formData.percentageBps ? parseInt(formData.percentageBps) : null,
        flatAmountCents: formData.flatAmountCents ? parseInt(formData.flatAmountCents) : null,
      };

      const url = rule ? `/api/bonus-rules/${rule.id}` : '/api/bonus-rules';
      const method = rule ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save bonus rule');

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bonus rule');
    } finally {
      setLoading(false);
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
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">
            {rule ? 'Edit Bonus Rule' : 'Create Bonus Rule'}
          </h2>
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
              className="w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type *</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="percentage">Percentage</option>
              <option value="flat">Flat Amount</option>
              <option value="milestone">Milestone</option>
            </select>
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
            <label htmlFor="isActive" className="text-sm">Active</label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Threshold (cents)</label>
            <input
              type="number"
              name="thresholdCents"
              value={formData.thresholdCents}
              onChange={handleChange}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Percentage (bps)</label>
            <input
              type="number"
              name="percentageBps"
              value={formData.percentageBps}
              onChange={handleChange}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Flat Amount (cents)</label>
            <input
              type="number"
              name="flatAmountCents"
              value={formData.flatAmountCents}
              onChange={handleChange}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>

          <div className="flex gap-2 justify-between pt-4">
            <div>
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 text-sm border rounded hover:bg-zinc-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
