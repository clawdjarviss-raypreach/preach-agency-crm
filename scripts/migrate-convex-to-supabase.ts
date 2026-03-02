/* eslint-disable no-console */
import { ConvexHttpClient } from 'convex/browser';
import { createClient } from '@supabase/supabase-js';

type Json = Record<string, any>;

type TableConfig = {
  convexTable: string;
  pgTable: string;
  fkFields?: string[];
};

const CONVEX_URL = process.env.CONVEX_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE ?? 500);

if (!CONVEX_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env: CONVEX_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

const convex = new ConvexHttpClient(CONVEX_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES: TableConfig[] = [
  { convexTable: 'crm_roles', pgTable: 'crm_roles', fkFields: ['createdBy'] },
  { convexTable: 'crm_chatters', pgTable: 'crm_chatters', fkFields: ['roleId', 'inviteTokenId'] },
  { convexTable: 'crm_creators', pgTable: 'crm_creators' },
  { convexTable: 'crm_sessions', pgTable: 'crm_sessions', fkFields: ['chatterId'] },
  { convexTable: 'crm_user_creator_access', pgTable: 'crm_user_creator_access', fkFields: ['userId', 'creatorId'] },
  { convexTable: 'crm_of_accounts', pgTable: 'crm_of_accounts', fkFields: ['creatorId'] },
  { convexTable: 'crm_of_sync_state', pgTable: 'crm_of_sync_state' },
  { convexTable: 'crm_of_transactions', pgTable: 'crm_of_transactions' },
  { convexTable: 'crm_of_daily_earnings', pgTable: 'crm_of_daily_earnings' },
  { convexTable: 'crm_message_queue', pgTable: 'crm_message_queue', fkFields: ['creatorId', 'chatterId', 'originalChatterId', 'escalatedTo'] },
  { convexTable: 'crm_om_transactions', pgTable: 'crm_om_transactions', fkFields: ['creatorId'] },
  { convexTable: 'crm_om_chargebacks', pgTable: 'crm_om_chargebacks', fkFields: ['creatorId'] },
  { convexTable: 'crm_om_daily_aggregates', pgTable: 'crm_om_daily_aggregates', fkFields: ['creatorId'] },
];

const idMap = new Map<string, string>();

function toSnakeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase();
}

function toIsoIfMsTimestamp(value: unknown): unknown {
  if (typeof value === 'number' && value > 1_000_000_000_000) {
    return new Date(value).toISOString();
  }
  return value;
}

function mapId(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  const existing = idMap.get(value);
  if (existing) return existing;
  const next = crypto.randomUUID();
  idMap.set(value, next);
  return next;
}

function transformRow(row: Json, config: TableConfig): Json {
  const out: Json = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === '_id') {
      out.id = mapId(value);
      continue;
    }

    if (key === '_creationTime') {
      continue;
    }

    const snakeKey = toSnakeKey(key);
    out[snakeKey] = toIsoIfMsTimestamp(value);
  }

  for (const fkField of config.fkFields ?? []) {
    const snake = toSnakeKey(fkField);
    if (out[snake]) {
      out[snake] = mapId(out[snake]);
    }
  }

  return out;
}

async function exportConvexTable(table: string): Promise<Json[]> {
  const rows: Json[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = (await (convex as any).query('migration:exportTable', {
      table,
      cursor: cursor ?? undefined,
      limit: 1000,
    })) as { rows: Json[]; nextCursor?: string | null };

    rows.push(...(page?.rows ?? []));
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }

  return rows;
}

async function upsertBatches(pgTable: string, rows: Json[]) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(pgTable).upsert(batch, { onConflict: 'id' });
    if (error) {
      throw new Error(`Upsert failed (${pgTable}) batch=${i / BATCH_SIZE}: ${error.message}`);
    }
  }
}

async function migrateTable(config: TableConfig) {
  console.log(`→ ${config.convexTable}`);
  const sourceRows = await exportConvexTable(config.convexTable);
  const transformed = sourceRows.map((row) => transformRow(row, config));
  await upsertBatches(config.pgTable, transformed);
  console.log(`✓ ${config.pgTable} migrated: ${transformed.length}`);
}

async function persistIdMap() {
  const rows = Array.from(idMap.entries()).map(([convex_id, pg_id]) => ({
    convex_id,
    pg_id,
    table_name: 'mixed',
  }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('convex_id_map').upsert(rows, { onConflict: 'convex_id' });
  if (error) {
    console.warn('⚠️ Could not persist convex_id_map table. Create it before migration if you need persistent mapping.', error.message);
  }
}

async function main() {
  for (const table of TABLES) {
    await migrateTable(table);
  }

  await persistIdMap();
  console.log('✅ Convex → Supabase migration complete');
}

main().catch((err) => {
  console.error('❌ Migration failed', err);
  process.exit(1);
});
