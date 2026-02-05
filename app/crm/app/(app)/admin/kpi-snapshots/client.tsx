'use client';

import { FormEvent, useMemo, useState } from 'react';
import { parseDiscordSalesReport } from '@/lib/discordSalesReport';

type SnapshotRow = {
  id: string;
  chatterId: string;
  chatterName: string;
  creatorId: string;
  creatorLabel: string;
  snapshotDate: string;
  revenueCents: number | null;
  messagesSent: number | null;
  tipsReceivedCents: number | null;
  newSubs: number | null;
  source: string;
};

type Chatter = { id: string; name: string; email: string };
type Creator = { id: string; platform: string; username: string; displayName: string | null };

interface KpiSnapshotsClientProps {
  initialSnapshots: SnapshotRow[];
  chatters: Chatter[];
  creators: Creator[];
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatMoney(cents: number | null): string {
  if (cents === null) return '—';
  return USD.format(cents / 100);
}

export default function KpiSnapshotsClient({
  initialSnapshots,
  chatters,
  creators,
}: KpiSnapshotsClientProps) {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>(initialSnapshots);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discordPaste, setDiscordPaste] = useState('');
  const [discordParsed, setDiscordParsed] = useState<Record<string, unknown> | null>(null);

  const [formData, setFormData] = useState({
    chatterId: '',
    creatorId: '',
    snapshotDate: new Date().toISOString().split('T')[0],
    revenueCents: '',
    messagesSent: '',
    tipsReceivedCents: '',
    newSubs: '',
    source: 'manual' as 'manual' | 'discord',
  });

  const chatterOptions = useMemo(() => chatters, [chatters]);
  const creatorOptions = useMemo(() => creators, [creators]);

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
      if (!formData.chatterId || !formData.creatorId) {
        setError('Please select both chatter and creator');
        setLoading(false);
        return;
      }

      const revenueCents = formData.revenueCents
        ? Math.round(parseFloat(formData.revenueCents) * 100)
        : null;
      const tipsReceivedCents = formData.tipsReceivedCents
        ? Math.round(parseFloat(formData.tipsReceivedCents) * 100)
        : null;

      const response = await fetch('/api/admin/kpi-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatterId: formData.chatterId,
          creatorId: formData.creatorId,
          snapshotDate: formData.snapshotDate,
          revenueCents,
          messagesSent: formData.messagesSent ? parseInt(formData.messagesSent) : null,
          tipsReceivedCents,
          newSubs: formData.newSubs ? parseInt(formData.newSubs) : null,
          source: formData.source,
          rawData:
            formData.source === 'discord'
              ? {
                  discordPaste,
                  parsed: discordParsed,
                  revenueCents,
                  tipsReceivedCents,
                }
              : null,
        }),
      });

      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to create snapshot');
      }

      const created = await response.json();
      setSnapshots((prev) => [
        {
          ...created,
          chatterName: chatterOptions.find((c) => c.id === created.chatterId)?.name || '?',
          creatorLabel: `${creators.find((cr) => cr.id === created.creatorId)?.displayName || creators.find((cr) => cr.id === created.creatorId)?.username || '?'} (${creators.find((cr) => cr.id === created.creatorId)?.platform || '?'})`,
        },
        ...prev,
      ]);
      setShowForm(false);
      setDiscordPaste('');
      setDiscordParsed(null);
      setFormData({
        chatterId: '',
        creatorId: '',
        snapshotDate: new Date().toISOString().split('T')[0],
        revenueCents: '',
        messagesSent: '',
        tipsReceivedCents: '',
        newSubs: '',
        source: 'manual',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create snapshot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin — KPI Snapshots</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manual KPI data entry for chatter/creator performance tracking.
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          {showForm ? 'Cancel' : '+ New Snapshot'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <div className="mb-6 rounded border bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Create KPI Snapshot</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Chatter</span>
                <select
                  name="chatterId"
                  value={formData.chatterId}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  required
                >
                  <option value="">Select…</option>
                  {chatterOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Creator</span>
                <select
                  name="creatorId"
                  value={formData.creatorId}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  required
                >
                  <option value="">Select…</option>
                  {creatorOptions.map((cr) => (
                    <option key={cr.id} value={cr.id}>
                      {cr.displayName ?? cr.username} ({cr.platform})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Source</span>
                <select
                  name="source"
                  value={formData.source}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="manual">Manual</option>
                  <option value="discord">Discord (paste)</option>
                </select>
              </label>

              <div className="text-xs text-zinc-500 flex items-end">
                {formData.source === 'discord'
                  ? 'Paste a Discord sales report below, click Parse, then submit.'
                  : 'Standard manual entry.'}
              </div>
            </div>

            {formData.source === 'discord' && (
              <div className="rounded border bg-zinc-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-700">Discord sales report paste</div>
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseDiscordSalesReport(discordPaste);
                      setDiscordParsed(parsed as Record<string, unknown>);
                      // Prefill common fields.
                      setFormData((prev) => ({
                        ...prev,
                        revenueCents:
                          typeof parsed.revenueDollars === 'number'
                            ? String(parsed.revenueDollars)
                            : prev.revenueCents,
                        tipsReceivedCents:
                          typeof parsed.tipsDollars === 'number'
                            ? String(parsed.tipsDollars)
                            : prev.tipsReceivedCents,
                        messagesSent:
                          typeof parsed.messagesSent === 'number'
                            ? String(parsed.messagesSent)
                            : prev.messagesSent,
                        newSubs:
                          typeof parsed.newSubs === 'number'
                            ? String(parsed.newSubs)
                            : prev.newSubs,
                      }));
                    }}
                    className="rounded bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    Parse
                  </button>
                </div>

                <textarea
                  value={discordPaste}
                  onChange={(e) => setDiscordPaste(e.target.value)}
                  className="w-full rounded border bg-white p-2 text-xs font-mono"
                  rows={6}
                  placeholder={`Revenue: $1,234.56\nTips: $123.00\nPPV: $420.00\nNew subs: 12\nMessages sent: 1500`}
                />

                {discordParsed && (
                  <pre className="mt-2 overflow-auto rounded bg-white p-2 text-[11px] text-zinc-700">
                    {JSON.stringify(discordParsed, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-600">Snapshot Date</span>
              <input
                type="date"
                name="snapshotDate"
                value={formData.snapshotDate}
                onChange={handleInputChange}
                className="rounded border px-2 py-1 text-sm"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Revenue ($)</span>
                <input
                  type="number"
                  step="0.01"
                  name="revenueCents"
                  value={formData.revenueCents}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="e.g., 500.50"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Messages Sent</span>
                <input
                  type="number"
                  name="messagesSent"
                  value={formData.messagesSent}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="e.g., 150"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Tips Received ($)</span>
                <input
                  type="number"
                  step="0.01"
                  name="tipsReceivedCents"
                  value={formData.tipsReceivedCents}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="e.g., 100.00"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">New Subs</span>
                <input
                  type="number"
                  name="newSubs"
                  value={formData.newSubs}
                  onChange={handleInputChange}
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="e.g., 25"
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

      {snapshots.length === 0 ? (
        <div className="rounded border bg-white p-4 text-sm text-zinc-600">
          No KPI snapshots yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border bg-white">
          <table className="table-ui">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Chatter</th>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Revenue</th>
                <th className="px-3 py-2">Messages</th>
                <th className="px-3 py-2">Tips</th>
                <th className="px-3 py-2">New Subs</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshots.map((s) => (
                <tr key={s.id} >
                  <td className="px-3 py-2 font-medium">{s.chatterName}</td>
                  <td className="px-3 py-2 text-xs">{s.creatorLabel}</td>
                  <td className="px-3 py-2 text-xs">{s.snapshotDate}</td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {formatMoney(s.revenueCents)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.messagesSent !== null ? s.messagesSent : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatMoney(s.tipsReceivedCents)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.newSubs !== null ? s.newSubs : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
