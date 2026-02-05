'use client';

import React from 'react';

export type ShiftReportViewProps = {
  report: {
    busyness: number;
    whatWentWell: string;
    whatDidntGoWell: string;
    mmSellingChats: string | null;
    revenueCents: number | null;
    creator: { displayName: string | null; username: string };
  };
};

function formatUsdFromCents(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100);
}

function BusynessDots({ value }: { value: number }) {
  const clamped = Math.max(1, Math.min(5, value));
  return (
    <div className="flex items-center gap-1" aria-label={`Busyness ${clamped} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`inline-block h-2.5 w-2.5 rounded-full ${n <= clamped ? 'bg-zinc-900' : 'bg-zinc-200'}`}
        />
      ))}
      <span className="ml-2 text-xs text-zinc-600">{clamped}/5</span>
    </div>
  );
}

export default function ShiftReportView({ report }: ShiftReportViewProps) {
  const creatorName = report.creator.displayName || report.creator.username;

  return (
    <div className="rounded-md border bg-white p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-zinc-600">Creator</div>
          <div className="mt-1">{creatorName}</div>
        </div>

        <div>
          <div className="text-xs font-medium text-zinc-600">Busyness</div>
          <div className="mt-2">
            <BusynessDots value={report.busyness} />
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-zinc-600">Revenue</div>
          <div className="mt-1">{formatUsdFromCents(report.revenueCents)}</div>
        </div>

        <div>
          <div className="text-xs font-medium text-zinc-600">MM selling chats</div>
          <div className="mt-1 text-zinc-700">{report.mmSellingChats?.trim() ? report.mmSellingChats : '—'}</div>
        </div>

        <div className="sm:col-span-2">
          <div className="text-xs font-medium text-zinc-600">What went well</div>
          <div className="mt-1 whitespace-pre-wrap text-zinc-800">
            {report.whatWentWell?.trim() ? report.whatWentWell : '—'}
          </div>
        </div>

        <div className="sm:col-span-2">
          <div className="text-xs font-medium text-zinc-600">What didn’t go well</div>
          <div className="mt-1 whitespace-pre-wrap text-zinc-800">
            {report.whatDidntGoWell?.trim() ? report.whatDidntGoWell : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
