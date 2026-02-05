export type DiscordSalesReportParsed = {
  revenueDollars?: number;
  tipsDollars?: number;
  ppvDollars?: number;
  messagesSent?: number;
  messagesReceived?: number;
  newSubs?: number;
  subsRenewed?: number;
};

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseIntLike(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, '');
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Best-effort parser for common Discord “sales report” messages.
 *
 * Supports variants like:
 * - Revenue: $1,234.56
 * - Tips: $123
 * - PPV: $420.00
 * - New subs: 12
 * - Messages sent: 1500
 */
export function parseDiscordSalesReport(text: string): DiscordSalesReportParsed {
  const t = text.replace(/\r/g, '');

  const out: DiscordSalesReportParsed = {};

  const moneyPatterns: Array<[keyof DiscordSalesReportParsed, RegExp]> = [
    ['revenueDollars', /(?:^|\n)\s*(?:revenue|total\s*(?:sales|revenue)|sales)\s*[:=\-]\s*\$?\s*([\d,.]+)\s*(?:$|\n)/i],
    ['tipsDollars', /(?:^|\n)\s*(?:tips?)\s*[:=\-]\s*\$?\s*([\d,.]+)\s*(?:$|\n)/i],
    ['ppvDollars', /(?:^|\n)\s*(?:ppv|pay\s*per\s*view)\s*[:=\-]\s*\$?\s*([\d,.]+)\s*(?:$|\n)/i],
  ];

  for (const [key, rx] of moneyPatterns) {
    const m = t.match(rx);
    if (!m) continue;
    const n = parseNumber(m[1]);
    if (Number.isFinite(n)) out[key] = n;
  }

  const intPatterns: Array<[keyof DiscordSalesReportParsed, RegExp]> = [
    ['messagesSent', /(?:^|\n)\s*(?:messages\s*sent|sent\s*messages)\s*[:=\-]\s*([\d,]+)\s*(?:$|\n)/i],
    ['messagesReceived', /(?:^|\n)\s*(?:messages\s*received|received\s*messages)\s*[:=\-]\s*([\d,]+)\s*(?:$|\n)/i],
    ['newSubs', /(?:^|\n)\s*(?:new\s*subs?|new\s*subscribers?)\s*[:=\-]\s*([\d,]+)\s*(?:$|\n)/i],
    ['subsRenewed', /(?:^|\n)\s*(?:subs?\s*renewed|renewals?)\s*[:=\-]\s*([\d,]+)\s*(?:$|\n)/i],
  ];

  for (const [key, rx] of intPatterns) {
    const m = t.match(rx);
    if (!m) continue;
    const n = parseIntLike(m[1]);
    if (Number.isFinite(n)) out[key] = n;
  }

  return out;
}
