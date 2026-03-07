# Winning Patterns & Content Ideas — Full Export

System for scraping competitor Instagram reels (watchlist), detecting outliers, analyzing them with AI, and tracking own reel performance against discovered patterns.

Tech stack: React 19, Vite, Tailwind v4, Zustand, Supabase (Postgres + Edge Functions)

---

## Table of Contents

1. [Database Schema (SQL)](#1-database-schema)
2. [TypeScript Types](#2-typescript-types)
3. [API Layer (Supabase Client)](#3-api-layer)
4. [Zustand Stores](#4-zustand-stores)
5. [Content Ideas Page — Components](#5-content-ideas-page)
6. [Winning Patterns Page — Components](#6-winning-patterns-page)

---

## 1. Database Schema

### Tables

```sql
-- ─── Intelligence (Competitor Watchlist) ────────────────────────────

CREATE TABLE IF NOT EXISTS watchlist_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  platform TEXT DEFAULT 'instagram',
  character_ids JSONB DEFAULT '[]'::jsonb,  -- links account to characters/units
  tier INTEGER DEFAULT 2,
  follower_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  last_scraped_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES watchlist_accounts(id) ON DELETE CASCADE,
  shortcode TEXT DEFAULT '',
  instagram_url TEXT DEFAULT '',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  virality_ratio NUMERIC DEFAULT 0,         -- views / account avg views
  engagement_rate NUMERIC DEFAULT 0,
  is_outlier BOOLEAN DEFAULT false,          -- flagged if virality_ratio > threshold
  caption TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  audio_name TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  visual_analysis TEXT DEFAULT '',           -- AI analysis text (legacy freetext)
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_character_id TEXT DEFAULT '',
  matched_pattern_id TEXT DEFAULT '',
  pattern_type TEXT DEFAULT 'unprocessed',   -- 'unprocessed' | 'proven' | 'exploration'
  briefing TEXT DEFAULT '',                  -- single briefing (legacy)
  briefings JSONB DEFAULT '{}'::jsonb,       -- per-character briefings { characterId: text }
  suggested_pattern_name TEXT DEFAULT '',
  processed_at TIMESTAMPTZ,
  -- Structured analysis fields (filled by AI)
  hook TEXT DEFAULT '',
  retention TEXT DEFAULT '',
  pattern_formula TEXT DEFAULT '',
  triggers JSONB DEFAULT '[]'::jsonb,        -- text[]
  props JSONB DEFAULT '[]'::jsonb,           -- text[]
  difficulty INTEGER DEFAULT NULL,           -- 1-5
  difficulty_note TEXT DEFAULT '',
  performance_analysis TEXT DEFAULT '',
  analysis_status TEXT DEFAULT 'pending'     -- 'pending' | 'analyzing' | 'done' | 'opus_done' | 'error'
);

-- ─── Patterns (Global Pattern Library) ──────────────────────────────

CREATE TABLE IF NOT EXISTS patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id TEXT DEFAULT NULL,            -- legacy, now always '' (patterns are global)
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'proven',              -- 'proven' | 'exploration' | 'retired'
  avg_views INTEGER DEFAULT 0,
  total_reels INTEGER DEFAULT 0,
  total_own_reels INTEGER DEFAULT 0,
  avg_own_views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Own Reels (Our Published Reels) ────────────────────────────────

CREATE TABLE IF NOT EXISTS own_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,                    -- Instagram account username
  model TEXT DEFAULT '',                     -- character/model name
  country TEXT DEFAULT '',
  shortcode TEXT DEFAULT '',
  instagram_url TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  account_avg_views NUMERIC DEFAULT 0,
  performance_ratio NUMERIC DEFAULT 0,       -- views / account avg views
  is_winner BOOLEAN DEFAULT false,           -- flagged if performance_ratio > threshold
  caption TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  audio_name TEXT DEFAULT '',
  matched_pattern_id TEXT DEFAULT '',
  pattern_name TEXT DEFAULT '',
  visual_analysis TEXT DEFAULT '',
  performance_analysis TEXT DEFAULT '',
  -- Structured analysis fields (filled by AI)
  hook TEXT DEFAULT '',
  retention TEXT DEFAULT '',
  pattern_formula TEXT DEFAULT '',
  triggers JSONB DEFAULT '[]'::jsonb,
  props JSONB DEFAULT '[]'::jsonb,
  difficulty INTEGER DEFAULT NULL,
  difficulty_note TEXT DEFAULT '',
  analysis_status TEXT DEFAULT 'pending',
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  -- Re-analysis pipeline
  gemini_visual_analysis TEXT DEFAULT '',
  previous_is_winner BOOLEAN DEFAULT NULL
);

-- ─── Posted Reels (Tracking) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posted_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_task_id TEXT,
  character_id TEXT DEFAULT '',
  pattern_id TEXT DEFAULT '',
  pattern_type TEXT DEFAULT '',
  reference_reel_id TEXT DEFAULT '',
  reference_url TEXT DEFAULT '',
  posted_account TEXT NOT NULL,
  post_url TEXT NOT NULL,
  posted_by TEXT DEFAULT '',
  posted_at TIMESTAMPTZ NOT NULL,
  views_48h INTEGER DEFAULT 0,
  views_7d INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  creator_id TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Indexes

```sql
-- Watchlist / Intelligence
CREATE INDEX IF NOT EXISTS idx_watchlist_reels_pattern_type ON watchlist_reels(pattern_type);
CREATE INDEX IF NOT EXISTS idx_watchlist_reels_matched_pattern ON watchlist_reels(matched_pattern_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_reels_account ON watchlist_reels(account_id);

-- Own Reels
CREATE INDEX IF NOT EXISTS idx_own_reels_analyzed ON own_reels(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_own_reels_matched_pattern ON own_reels(matched_pattern_id);
CREATE INDEX IF NOT EXISTS idx_own_reels_username ON own_reels(username);

-- Posted Reels
CREATE INDEX IF NOT EXISTS idx_posted_reels_pattern ON posted_reels(pattern_id);
CREATE INDEX IF NOT EXISTS idx_posted_reels_posted_at ON posted_reels(posted_at);
```

---

## 2. TypeScript Types

### `types/watchlist.ts`

```typescript
export interface WatchlistAccount {
  id: string
  username: string
  platform: string
  characterIds: string[]
  tier: number
  followerCount: number
  status: string
  lastScrapedAt: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface WatchlistReel {
  id: string
  accountId: string
  accountUsername: string
  shortcode: string
  instagramUrl: string
  videoUrl: string
  views: number
  likes: number
  commentsCount: number
  viralityRatio: number
  engagementRate: number
  isOutlier: boolean
  caption: string
  thumbnailUrl: string
  audioName: string
  postedAt: string | null
  scrapedAt: string
  matchedCharacterId: string
  matchedPatternId: string
  patternType: 'unprocessed' | 'proven' | 'exploration'
  briefing: string
  briefings: Record<string, string>
  suggestedPatternName: string
  visualAnalysis: string
  processedAt: string | null
  // Structured analysis fields
  hook: string
  retention: string
  patternFormula: string
  triggers: string[]
  props: string[]
  difficulty: number | null
  difficultyNote: string
  performanceAnalysis: string
  analysisStatus: string
}
```

### `types/pattern.ts`

```typescript
export interface Pattern {
  id: string
  characterId: string // legacy, now always '' — patterns are global
  name: string
  description: string
  status: 'proven' | 'exploration' | 'retired'
  avgViews: number
  totalReels: number
  totalOwnReels: number
  avgOwnViews: number
  createdAt: string
  updatedAt: string
}
```

### `types/ownReel.ts`

```typescript
export type AnalysisStatus = 'pending' | 'analyzing' | 'done' | 'gemini_done' | 'opus_pending' | 'opus_done' | 'error'

export interface OwnReel {
  id: string
  username: string
  model: string
  shortcode: string
  instagramUrl: string
  videoUrl: string
  views: number
  likes: number
  commentsCount: number
  accountAvgViews: number
  performanceRatio: number
  isWinner: boolean
  caption: string
  thumbnailUrl: string
  audioName: string
  matchedPatternId: string
  patternName: string
  visualAnalysis: string
  performanceAnalysis: string
  hook: string
  retention: string
  patternFormula: string
  triggers: string[]
  props: string[]
  difficulty: number | null
  difficultyNote: string
  analysisStatus: AnalysisStatus
  postedAt: string | null
  scrapedAt: string
  analyzedAt: string | null
}

export interface OwnAccount {
  username: string
  model: string
  country: string
  followerCount: number
  reelCount: number
  avgViews: number
  lastScrapedAt: string | null
}

export interface PatternSummary {
  patternId: string
  patternName: string
  reelCount: number
  avgPerformanceRatio: number
  avgViews: number
  winnerCount: number
}
```

---

## 3. API Layer

### `api/watchlist.ts` — Watchlist Accounts & Reels CRUD

```typescript
import { supabase } from '../lib/supabase'
import type { WatchlistAccount, WatchlistReel } from '../types/watchlist'

function rowToAccount(r: Record<string, unknown>): WatchlistAccount {
  return {
    id: r.id as string,
    username: (r.username as string) ?? '',
    platform: (r.platform as string) ?? 'instagram',
    characterIds: (r.character_ids as string[]) ?? [],
    tier: (r.tier as number) ?? 2,
    followerCount: (r.follower_count as number) ?? 0,
    status: (r.status as string) ?? 'active',
    lastScrapedAt: r.last_scraped_at as string | null,
    notes: (r.notes as string) ?? '',
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function rowToReel(r: Record<string, unknown>): WatchlistReel {
  return {
    id: r.id as string,
    accountId: r.account_id as string,
    accountUsername: (r.account_username as string) ?? (r.watchlist_accounts as Record<string, unknown>)?.username as string ?? '',
    shortcode: (r.shortcode as string) ?? '',
    instagramUrl: (r.instagram_url as string) ?? '',
    videoUrl: (r.video_url as string) ?? '',
    views: (r.views as number) ?? 0,
    likes: (r.likes as number) ?? 0,
    commentsCount: (r.comments_count as number) ?? 0,
    viralityRatio: (r.virality_ratio as number) ?? 0,
    engagementRate: (r.engagement_rate as number) ?? 0,
    isOutlier: (r.is_outlier as boolean) ?? false,
    caption: (r.caption as string) ?? '',
    thumbnailUrl: (r.thumbnail_url as string) ?? '',
    audioName: (r.audio_name as string) ?? '',
    postedAt: r.posted_at as string | null,
    scrapedAt: r.scraped_at as string,
    matchedCharacterId: (r.matched_character_id as string) ?? '',
    matchedPatternId: (r.matched_pattern_id as string) ?? '',
    patternType: (r.pattern_type as WatchlistReel['patternType']) ?? 'unprocessed',
    briefing: (r.briefing as string) ?? '',
    briefings: (r.briefings as Record<string, string>) ?? {},
    suggestedPatternName: (r.suggested_pattern_name as string) ?? '',
    visualAnalysis: (r.visual_analysis as string) ?? '',
    processedAt: r.processed_at as string | null,
    hook: (r.hook as string) ?? '',
    retention: (r.retention as string) ?? '',
    patternFormula: (r.pattern_formula as string) ?? '',
    triggers: (r.triggers as string[]) ?? [],
    props: (r.props as string[]) ?? [],
    difficulty: (r.difficulty as number) ?? null,
    difficultyNote: (r.difficulty_note as string) ?? '',
    performanceAnalysis: (r.performance_analysis as string) ?? '',
    analysisStatus: (r.analysis_status as string) ?? 'pending',
  }
}

export async function fetchAccounts(): Promise<WatchlistAccount[]> {
  const { data, error } = await supabase
    .from('watchlist_accounts')
    .select('*')
    .order('tier', { ascending: true })
    .order('username', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAccount)
}

export async function createAccount(account: Partial<WatchlistAccount>): Promise<WatchlistAccount> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('watchlist_accounts')
    .insert({
      username: account.username ?? '',
      platform: account.platform ?? 'instagram',
      character_ids: account.characterIds ?? [],
      tier: account.tier ?? 2,
      notes: account.notes ?? '',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToAccount(data)
}

export async function updateAccount(id: string, updates: Partial<WatchlistAccount>): Promise<WatchlistAccount> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.username !== undefined) patch.username = updates.username
  if (updates.platform !== undefined) patch.platform = updates.platform
  if (updates.characterIds !== undefined) patch.character_ids = updates.characterIds
  if (updates.tier !== undefined) patch.tier = updates.tier
  if (updates.followerCount !== undefined) patch.follower_count = updates.followerCount
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.lastScrapedAt !== undefined) patch.last_scraped_at = updates.lastScrapedAt
  if (updates.notes !== undefined) patch.notes = updates.notes

  const { data, error } = await supabase
    .from('watchlist_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToAccount(data)
}

export async function deleteAccount(id: string): Promise<void> {
  await supabase.from('watchlist_reels').delete().eq('account_id', id)
  const { error } = await supabase.from('watchlist_accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchReels(params?: {
  is_outlier?: number
  pattern_type?: string
  character_id?: string
  limit?: number
}): Promise<WatchlistReel[]> {
  let query = supabase
    .from('watchlist_reels')
    .select('*, watchlist_accounts!inner(username)')

  if (params?.is_outlier !== undefined) {
    query = query.eq('is_outlier', params.is_outlier === 1)
  }
  if (params?.pattern_type && params.pattern_type !== 'all') {
    query = query.eq('pattern_type', params.pattern_type)
  }
  if (params?.character_id) {
    query = query.eq('matched_character_id', params.character_id)
  }

  query = query.order('virality_ratio', { ascending: false }).order('views', { ascending: false })

  if (params?.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((r: Record<string, unknown>) => {
    const acct = r.watchlist_accounts as Record<string, unknown> | undefined
    return rowToReel({ ...r, account_username: acct?.username ?? '' })
  })
}

export async function updateReel(id: string, updates: Partial<WatchlistReel>): Promise<WatchlistReel> {
  const patch: Record<string, unknown> = {}
  if (updates.matchedCharacterId !== undefined) patch.matched_character_id = updates.matchedCharacterId
  if (updates.matchedPatternId !== undefined) patch.matched_pattern_id = updates.matchedPatternId
  if (updates.patternType !== undefined) patch.pattern_type = updates.patternType
  if (updates.briefing !== undefined) patch.briefing = updates.briefing
  if (updates.briefings !== undefined) patch.briefings = updates.briefings
  if (updates.suggestedPatternName !== undefined) patch.suggested_pattern_name = updates.suggestedPatternName
  if (updates.processedAt !== undefined) patch.processed_at = updates.processedAt
  if (updates.views !== undefined) patch.views = updates.views
  if (updates.likes !== undefined) patch.likes = updates.likes
  if (updates.commentsCount !== undefined) patch.comments_count = updates.commentsCount
  if (updates.viralityRatio !== undefined) patch.virality_ratio = updates.viralityRatio
  if (updates.engagementRate !== undefined) patch.engagement_rate = updates.engagementRate
  if (updates.isOutlier !== undefined) patch.is_outlier = updates.isOutlier

  const { error } = await supabase
    .from('watchlist_reels')
    .update(patch)
    .eq('id', id)

  if (error) throw new Error(error.message)

  const { data, error: fetchError } = await supabase
    .from('watchlist_reels')
    .select('*, watchlist_accounts!inner(username)')
    .eq('id', id)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  const acct = data.watchlist_accounts as Record<string, unknown> | undefined
  return rowToReel({ ...data, account_username: acct?.username ?? '' })
}
```

### `api/patterns.ts` — Pattern Library CRUD

```typescript
import { supabase } from '../lib/supabase'
import type { Pattern } from '../types/pattern'

function rowToPattern(r: Record<string, unknown>): Pattern {
  return {
    id: r.id as string,
    characterId: (r.character_id as string) ?? '',
    name: (r.name as string) ?? '',
    description: (r.description as string) ?? '',
    status: (r.status as Pattern['status']) ?? 'proven',
    avgViews: (r.avg_views as number) ?? 0,
    totalReels: (r.total_reels as number) ?? 0,
    totalOwnReels: (r.total_own_reels as number) ?? 0,
    avgOwnViews: (r.avg_own_views as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export async function fetchPatterns(characterId?: string): Promise<Pattern[]> {
  let query = supabase
    .from('patterns')
    .select('*')

  if (characterId) {
    query = query.eq('character_id', characterId)
  }

  query = query.order('avg_views', { ascending: false })

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToPattern)
}

export async function createPattern(pattern: Partial<Pattern>): Promise<Pattern> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('patterns')
    .insert({
      character_id: pattern.characterId ?? null,
      name: pattern.name ?? 'Untitled',
      description: pattern.description ?? '',
      status: pattern.status ?? 'proven',
      avg_views: pattern.avgViews ?? 0,
      total_reels: pattern.totalReels ?? 0,
      total_own_reels: pattern.totalOwnReels ?? 0,
      avg_own_views: pattern.avgOwnViews ?? 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToPattern(data)
}

export async function updatePattern(id: string, updates: Partial<Pattern>): Promise<Pattern> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.characterId !== undefined) patch.character_id = updates.characterId
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.avgViews !== undefined) patch.avg_views = updates.avgViews
  if (updates.totalReels !== undefined) patch.total_reels = updates.totalReels
  if (updates.totalOwnReels !== undefined) patch.total_own_reels = updates.totalOwnReels
  if (updates.avgOwnViews !== undefined) patch.avg_own_views = updates.avgOwnViews

  const { data, error } = await supabase
    .from('patterns')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToPattern(data)
}

export async function deletePattern(id: string): Promise<void> {
  const { error } = await supabase.from('patterns').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
```

### `api/winningPatterns.ts` — Own Reels & Performance

```typescript
import { supabase } from '../lib/supabase'
import type { OwnReel, OwnAccount, PatternSummary, AnalysisStatus } from '../types/ownReel'

function rowToReel(r: Record<string, unknown>): OwnReel {
  return {
    id: r.id as string,
    username: (r.username as string) ?? '',
    model: (r.model as string) ?? '',
    shortcode: (r.shortcode as string) ?? '',
    instagramUrl: (r.instagram_url as string) ?? '',
    videoUrl: (r.video_url as string) ?? '',
    views: (r.views as number) ?? 0,
    likes: (r.likes as number) ?? 0,
    commentsCount: (r.comments_count as number) ?? 0,
    accountAvgViews: (r.account_avg_views as number) ?? 0,
    performanceRatio: (r.performance_ratio as number) ?? 0,
    isWinner: (r.is_winner as boolean) ?? false,
    caption: (r.caption as string) ?? '',
    thumbnailUrl: (r.thumbnail_url as string) ?? '',
    audioName: (r.audio_name as string) ?? '',
    matchedPatternId: (r.matched_pattern_id as string) ?? '',
    patternName: (r.pattern_name as string) ?? '',
    visualAnalysis: (r.visual_analysis as string) ?? '',
    performanceAnalysis: (r.performance_analysis as string) ?? '',
    hook: (r.hook as string) ?? '',
    retention: (r.retention as string) ?? '',
    patternFormula: (r.pattern_formula as string) ?? '',
    triggers: (r.triggers as string[]) ?? [],
    props: (r.props as string[]) ?? [],
    difficulty: (r.difficulty as number) ?? null,
    difficultyNote: (r.difficulty_note as string) ?? '',
    analysisStatus: ((r.analysis_status as string) ?? 'pending') as AnalysisStatus,
    postedAt: r.posted_at as string | null,
    scrapedAt: r.scraped_at as string,
    analyzedAt: r.analyzed_at as string | null,
  }
}

export async function fetchAccounts(): Promise<OwnAccount[]> {
  // Get unique active accounts from device_accounts table
  const { data: accountRows, error: accError } = await supabase
    .from('device_accounts')
    .select('username, model, country, follower_count')
    .eq('status', 'active')
    .neq('username', '')
    .not('username', 'is', null)

  if (accError) throw new Error(accError.message)

  // Deduplicate by username, keeping max follower_count
  const byUsername = new Map<string, { username: string; model: string; country: string; followerCount: number }>()
  for (const r of accountRows ?? []) {
    const existing = byUsername.get(r.username)
    if (!existing || r.follower_count > existing.followerCount) {
      byUsername.set(r.username, {
        username: r.username,
        model: r.model ?? '',
        country: r.country ?? '',
        followerCount: r.follower_count ?? 0,
      })
    }
  }

  // Get reel stats per username
  const usernames = Array.from(byUsername.keys())
  if (usernames.length === 0) return []

  const { data: reelStats, error: reelError } = await supabase
    .from('own_reels')
    .select('username, views, scraped_at')

  if (reelError) throw new Error(reelError.message)

  // Aggregate reel stats by username
  const statsMap = new Map<string, { count: number; totalViews: number; lastScrapedAt: string | null }>()
  for (const r of reelStats ?? []) {
    const s = statsMap.get(r.username) ?? { count: 0, totalViews: 0, lastScrapedAt: null }
    s.count++
    s.totalViews += r.views ?? 0
    if (!s.lastScrapedAt || r.scraped_at > s.lastScrapedAt) s.lastScrapedAt = r.scraped_at
    statsMap.set(r.username, s)
  }

  const accounts: OwnAccount[] = []
  for (const [username, acct] of byUsername.entries()) {
    const stats = statsMap.get(username)
    accounts.push({
      username: acct.username,
      model: acct.model,
      country: acct.country,
      followerCount: acct.followerCount,
      reelCount: stats?.count ?? 0,
      avgViews: stats ? Math.round(stats.totalViews / stats.count) : 0,
      lastScrapedAt: stats?.lastScrapedAt ?? null,
    })
  }

  accounts.sort((a, b) => {
    const cmp = a.country.localeCompare(b.country)
    if (cmp !== 0) return cmp
    const cmp2 = a.model.localeCompare(b.model)
    if (cmp2 !== 0) return cmp2
    return a.username.localeCompare(b.username)
  })

  return accounts
}

export async function fetchReels(params?: {
  username?: string
  model?: string
  is_winner?: number
  pattern_id?: string
  limit?: number
}): Promise<OwnReel[]> {
  let query = supabase
    .from('own_reels')
    .select('*')

  if (params?.username) query = query.eq('username', params.username)
  if (params?.model) query = query.eq('model', params.model)
  if (params?.is_winner !== undefined) query = query.eq('is_winner', params.is_winner === 1)
  if (params?.pattern_id) query = query.eq('matched_pattern_id', params.pattern_id)

  query = query.order('performance_ratio', { ascending: false }).order('views', { ascending: false })

  if (params?.limit) query = query.limit(params.limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToReel)
}

export async function updateReel(id: string, updates: Partial<OwnReel>): Promise<OwnReel> {
  const patch: Record<string, unknown> = {}
  if (updates.matchedPatternId !== undefined) patch.matched_pattern_id = updates.matchedPatternId
  if (updates.patternName !== undefined) patch.pattern_name = updates.patternName
  if (updates.visualAnalysis !== undefined) patch.visual_analysis = updates.visualAnalysis
  if (updates.performanceAnalysis !== undefined) patch.performance_analysis = updates.performanceAnalysis
  if (updates.analyzedAt !== undefined) patch.analyzed_at = updates.analyzedAt

  const { data, error } = await supabase
    .from('own_reels')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToReel(data)
}

export async function fetchSummary(): Promise<PatternSummary[]> {
  const { data, error } = await supabase
    .from('own_reels')
    .select('matched_pattern_id, pattern_name, views, performance_ratio, is_winner')
    .neq('matched_pattern_id', '')
    .not('matched_pattern_id', 'is', null)

  if (error) throw new Error(error.message)

  const byPattern = new Map<string, {
    patternName: string; reelCount: number; totalRatio: number; totalViews: number; winnerCount: number
  }>()

  for (const r of data ?? []) {
    const pid = r.matched_pattern_id as string
    const s = byPattern.get(pid) ?? { patternName: r.pattern_name ?? '', reelCount: 0, totalRatio: 0, totalViews: 0, winnerCount: 0 }
    s.reelCount++
    s.totalRatio += r.performance_ratio ?? 0
    s.totalViews += r.views ?? 0
    if (r.is_winner) s.winnerCount++
    byPattern.set(pid, s)
  }

  const summary: PatternSummary[] = []
  for (const [patternId, s] of byPattern.entries()) {
    summary.push({
      patternId,
      patternName: s.patternName,
      reelCount: s.reelCount,
      avgPerformanceRatio: Math.round((s.totalRatio / s.reelCount) * 100) / 100,
      avgViews: Math.round(s.totalViews / s.reelCount),
      winnerCount: s.winnerCount,
    })
  }

  summary.sort((a, b) => b.avgPerformanceRatio - a.avgPerformanceRatio)
  return summary
}
```

---

## 4. Zustand Stores

### `stores/watchlistStore.ts`

```typescript
import { create } from 'zustand'
import type { WatchlistAccount, WatchlistReel } from '../types/watchlist'
import * as api from '../api/watchlist'

interface WatchlistStore {
  accounts: WatchlistAccount[]
  reels: WatchlistReel[]
  loading: boolean
  error: string | null

  fetchAccounts: () => Promise<void>
  createAccount: (account: Partial<WatchlistAccount>) => Promise<void>
  updateAccount: (id: string, updates: Partial<WatchlistAccount>) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  fetchReels: (params?: { is_outlier?: number; pattern_type?: string; character_id?: string; limit?: number }) => Promise<void>
  updateReel: (id: string, updates: Partial<WatchlistReel>) => Promise<void>
}

export const useWatchlistStore = create<WatchlistStore>((set) => ({
  accounts: [],
  reels: [],
  loading: false,
  error: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null })
    try {
      const accounts = await api.fetchAccounts()
      set({ accounts, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  createAccount: async (account) => {
    try {
      const created = await api.createAccount(account)
      set(s => ({ accounts: [...s.accounts, created] }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  updateAccount: async (id, updates) => {
    try {
      const updated = await api.updateAccount(id, updates)
      set(s => ({ accounts: s.accounts.map(a => a.id === id ? updated : a) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteAccount: async (id) => {
    try {
      await api.deleteAccount(id)
      set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchReels: async (params) => {
    set({ loading: true, error: null })
    try {
      const reels = await api.fetchReels(params)
      set({ reels, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  updateReel: async (id, updates) => {
    try {
      const updated = await api.updateReel(id, updates)
      set(s => ({ reels: s.reels.map(r => r.id === id ? updated : r) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },
}))
```

### `stores/patternStore.ts`

```typescript
import { create } from 'zustand'
import type { Pattern } from '../types/pattern'
import * as api from '../api/patterns'

interface PatternStore {
  patterns: Pattern[]
  loading: boolean
  error: string | null

  fetchPatterns: (characterId?: string) => Promise<void>
  createPattern: (pattern: Partial<Pattern>) => Promise<void>
  updatePattern: (id: string, updates: Partial<Pattern>) => Promise<void>
  deletePattern: (id: string) => Promise<void>
}

export const usePatternStore = create<PatternStore>((set) => ({
  patterns: [],
  loading: false,
  error: null,

  fetchPatterns: async (characterId) => {
    set({ loading: true, error: null })
    try {
      const patterns = await api.fetchPatterns(characterId)
      set({ patterns, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  createPattern: async (pattern) => {
    try {
      const created = await api.createPattern(pattern)
      set(s => ({ patterns: [...s.patterns, created] }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  updatePattern: async (id, updates) => {
    try {
      const updated = await api.updatePattern(id, updates)
      set(s => ({ patterns: s.patterns.map(p => p.id === id ? updated : p) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deletePattern: async (id) => {
    try {
      await api.deletePattern(id)
      set(s => ({ patterns: s.patterns.filter(p => p.id !== id) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },
}))
```

### `stores/winningPatternsStore.ts`

```typescript
import { create } from 'zustand'
import type { OwnReel, OwnAccount, PatternSummary } from '../types/ownReel'
import * as api from '../api/winningPatterns'

interface WinningPatternsStore {
  accounts: OwnAccount[]
  reels: OwnReel[]
  summary: PatternSummary[]
  loading: boolean
  error: string | null

  fetchAccounts: () => Promise<void>
  fetchReels: (params?: { username?: string; model?: string; is_winner?: number; pattern_id?: string; limit?: number }) => Promise<void>
  fetchSummary: () => Promise<void>
  updateReel: (id: string, updates: Partial<OwnReel>) => Promise<void>
}

export const useWinningPatternsStore = create<WinningPatternsStore>((set) => ({
  accounts: [],
  reels: [],
  summary: [],
  loading: false,
  error: null,

  fetchAccounts: async () => {
    try {
      const accounts = await api.fetchAccounts()
      set({ accounts })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchReels: async (params) => {
    set({ loading: true, error: null })
    try {
      const reels = await api.fetchReels(params)
      set({ reels, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  fetchSummary: async () => {
    try {
      const summary = await api.fetchSummary()
      set({ summary })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  updateReel: async (id, updates) => {
    try {
      const updated = await api.updateReel(id, updates)
      set(s => ({ reels: s.reels.map(r => r.id === id ? updated : r) }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },
}))
```

---

## 5. Content Ideas Page (Competitor Intelligence)

### Overview

The Content Ideas system scrapes competitor Instagram accounts ("watchlist"), detects outlier reels (high virality_ratio), runs AI analysis on them, and presents actionable content ideas with a "Reproduce" button that creates production tasks.

### Components

#### `components/unit/ContentIdeasTab.tsx` — Per-Character Tab View

```tsx
import { useState, useMemo } from 'react'
import { IdeaCard } from '../ideas/IdeaCard'
import { Spinner } from '../common/Spinner'
import { Plus, X, ExternalLink } from 'lucide-react'
import { useWatchlistStore } from '../../stores/watchlistStore'
import type { ContentCharacter } from '../../types/contentCharacter'
import type { WatchlistReel } from '../../types/watchlist'

interface ContentIdeasTabProps {
  character: ContentCharacter
  reels: WatchlistReel[]
}

export function ContentIdeasTab({ character, reels }: ContentIdeasTabProps) {
  const loading = useWatchlistStore(s => s.loading)
  const accounts = useWatchlistStore(s => s.accounts)
  const createAccount = useWatchlistStore(s => s.createAccount)
  const updateAccount = useWatchlistStore(s => s.updateAccount)

  const [outlierOnly, setOutlierOnly] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showAddInput, setShowAddInput] = useState(false)
  const [newUsername, setNewUsername] = useState('')

  // Character-filtered accounts
  const characterAccounts = useMemo(() => {
    return accounts.filter(a => a.characterIds.includes(character.id))
  }, [accounts, character.id])

  const handleAddAccount = async () => {
    const username = newUsername.trim().replace('@', '')
    if (!username) return
    const existing = accounts.find(a => a.username.toLowerCase() === username.toLowerCase())
    if (existing) {
      if (!existing.characterIds.includes(character.id)) {
        await updateAccount(existing.id, { characterIds: [...existing.characterIds, character.id] })
      }
    } else {
      await createAccount({ username, characterIds: [character.id] })
    }
    setNewUsername('')
    setShowAddInput(false)
  }

  const deleteAccount = useWatchlistStore(s => s.deleteAccount)

  const handleRemoveAccount = async (accountId: string) => {
    if (!confirm('Account und alle zugehörigen Reels löschen?')) return
    await deleteAccount(accountId)
  }

  const filteredReels = reels
    .filter(r => {
      if (outlierOnly) {
        if (!r.isOutlier) return false
        if (r.analysisStatus !== 'done' && r.analysisStatus !== 'opus_done') return false
      }
      if (selectedAccountId && r.accountId !== selectedAccountId) return false
      return true
    })
    .sort((a, b) => b.views - a.views)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-6">
      {/* Watchlist Accounts */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xs font-semibold text-warm-muted uppercase tracking-wider">
            Watchlist — {character.name}
          </h2>
          <span className="text-[10px] text-warm-muted">{characterAccounts.length} accounts</span>
          <button
            onClick={() => setShowAddInput(true)}
            className="ml-auto flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            <Plus size={12} />
            Account
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {characterAccounts.map(account => (
            <span
              key={account.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cream-light border border-warm-border text-xs text-warm-dark group"
            >
              <a
                href={`https://www.instagram.com/${account.username}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors flex items-center gap-1"
              >
                @{account.username}
                <ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              {account.followerCount > 0 && (
                <span className="text-[10px] text-warm-muted">{(account.followerCount / 1000).toFixed(0)}k</span>
              )}
              <button
                onClick={() => handleRemoveAccount(account.id)}
                className="text-warm-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {showAddInput && (
            <div className="inline-flex items-center gap-1">
              <input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="@username"
                className="w-32 px-2 py-1 rounded-lg border border-warm-border bg-cream-light text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddAccount()
                  if (e.key === 'Escape') { setShowAddInput(false); setNewUsername('') }
                }}
              />
              <button onClick={handleAddAccount} className="text-xs text-accent hover:text-accent/80">Add</button>
              <button onClick={() => { setShowAddInput(false); setNewUsername('') }} className="text-xs text-warm-muted hover:text-warm-dark">
                <X size={12} />
              </button>
            </div>
          )}

          {characterAccounts.length === 0 && !showAddInput && (
            <span className="text-[10px] text-warm-muted">No watchlist accounts — click + Account to add one</span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-sm font-semibold text-warm-dark uppercase tracking-wider">Content Ideas</h2>
        <span className="text-[10px] text-warm-muted">{filteredReels.length} of {reels.length}</span>
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={selectedAccountId ?? ''}
            onChange={e => setSelectedAccountId(e.target.value || null)}
            className="px-2 py-1 text-xs rounded-lg border border-warm-border bg-cream text-warm-dark focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All Accounts</option>
            {characterAccounts.map(a => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
          <button
            onClick={() => setOutlierOnly(v => !v)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              outlierOnly
                ? 'bg-orange-100 text-orange-700 border-orange-300'
                : 'bg-cream text-warm-muted border-warm-border hover:bg-cream-dark'
            }`}
          >
            Outliers Only
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredReels.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-warm-muted">
            {reels.length === 0
              ? 'No watchlist reels for this character yet.'
              : 'No reels match current filters.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReels.map(reel => (
              <IdeaCard key={reel.id} reel={reel} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

#### `components/ideas/IdeaCard.tsx` — Reel Card with Video + AI Analysis

```tsx
import { useState, useRef } from 'react'
import { ExternalLink, Repeat, Check, Loader2, Play } from 'lucide-react'
import { useContentTaskStore } from '../../stores/contentTaskStore'
import type { WatchlistReel } from '../../types/watchlist'

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

/** Legacy parser for reels that still have freetext or JSON visual_analysis */
function parseAnalysis(text: string): Record<string, string> {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as Record<string, string>
      const result: Record<string, string> = {}
      if (json.HOOK) result.Hook = json.HOOK
      if (json.MIDDLE) result.Retention = json.MIDDLE
      if (json.END) result.Pattern = json.END
      if (json.PSYCHOLOGICAL_TRIGGER) result.Triggers = json.PSYCHOLOGICAL_TRIGGER
      if (json.AUDIO) result.Props = `Audio: ${json.AUDIO}`
      return result
    } catch { /* fall through */ }
  }

  const result: Record<string, string> = {}
  const lines = text.split('\n')
  let currentKey = ''
  let currentValue = ''
  for (const line of lines) {
    const l = line.trim()
    if (!l) {
      if (currentKey && currentValue) { result[currentKey] = currentValue.trim(); currentKey = ''; currentValue = '' }
      continue
    }
    const match = l.match(/^(Hook|Retention|Pattern|Triggers|Props|Difficulty|Performance):\s*(.*)$/i)
    if (match) {
      if (currentKey && currentValue) result[currentKey] = currentValue.trim()
      currentKey = match[1]!
      currentValue = match[2] ?? ''
    } else if (currentKey) {
      currentValue += ' ' + l
    }
  }
  if (currentKey && currentValue) result[currentKey] = currentValue.trim()
  return result
}

function parseDifficulty(text: string): { level: number; note: string } {
  const match = text.match(/^(\d)\/5\s*[·—-]\s*(.*)$/)
  if (match) return { level: parseInt(match[1]!), note: match[2]! }
  const numMatch = text.match(/^(\d)\/5/)
  if (numMatch) return { level: parseInt(numMatch[1]!), note: '' }
  return { level: 0, note: text }
}

export function IdeaCard({ reel }: { reel: WatchlistReel }) {
  const createTask = useContentTaskStore(s => s.createTask)
  const [reproduceState, setReproduceState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const hasStructured = !!reel.hook
  const legacy = !hasStructured && reel.visualAnalysis ? parseAnalysis(reel.visualAnalysis) : null
  const hasLegacy = legacy && Object.keys(legacy).length >= 3

  const hook = reel.hook || legacy?.Hook || ''
  const retention = reel.retention || legacy?.Retention || ''
  const patternFormula = reel.patternFormula || legacy?.Pattern || ''
  const triggers = reel.triggers.length > 0 ? reel.triggers : (legacy?.Triggers?.split('·').map(t => t.trim()).filter(Boolean) ?? [])
  const props = reel.props.length > 0 ? reel.props : (legacy?.Props ? [legacy.Props] : [])
  const performanceAnalysis = reel.performanceAnalysis || legacy?.Performance || ''
  const difficulty = reel.difficulty ?? (legacy?.Difficulty ? parseDifficulty(legacy.Difficulty).level : null)
  const difficultyNote = reel.difficultyNote || (legacy?.Difficulty ? parseDifficulty(legacy.Difficulty).note : '')

  const hasAnalysis = hasStructured || hasLegacy

  const handlePlayClick = () => {
    if (videoRef.current) {
      setVideoPlaying(true)
      videoRef.current.play()
    }
  }

  const handleReproduce = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (reproduceState === 'loading' || reproduceState === 'done') return
    setReproduceState('loading')
    try {
      await createTask({
        title: `Reproduce: ${reel.suggestedPatternName || reel.shortcode}`,
        description: `Reproduce watchlist pattern: "${reel.suggestedPatternName || 'Unknown'}"\nReference: ${reel.instagramUrl}\nOriginal: ${formatViews(reel.views)} views (${reel.viralityRatio.toFixed(1)}x avg)\n\n${reel.visualAnalysis || reel.performanceAnalysis || ''}`,
        status: 'todo',
        characterId: reel.matchedCharacterId,
        referenceUrl: reel.instagramUrl,
        referenceReelId: reel.id,
        patternId: reel.matchedPatternId,
        source: 'intelligence',
      })
      setReproduceState('done')
    } catch {
      setReproduceState('error')
      setTimeout(() => setReproduceState('idle'), 2000)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-warm-border overflow-hidden flex">
      {/* Left: 9:16 Video */}
      <div className="flex-shrink-0 w-[320px] relative bg-black rounded-l-xl overflow-hidden">
        {reel.videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={reel.videoUrl}
              poster={reel.thumbnailUrl || undefined}
              className="w-full h-full object-cover"
              controls={videoPlaying}
              playsInline
              preload="none"
              style={{ aspectRatio: '9/16' }}
            />
            {!videoPlaying && (
              <button
                onClick={handlePlayClick}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                  <Play size={20} className="text-warm-dark ml-0.5" fill="currentColor" />
                </div>
              </button>
            )}
          </>
        ) : reel.thumbnailUrl ? (
          <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" style={{ aspectRatio: '9/16' }} />
        ) : (
          <div className="w-full bg-warm-border/20" style={{ aspectRatio: '9/16' }} />
        )}
      </div>

      {/* Right: Analysis */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-warm-border/50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-warm-dark">@{reel.accountUsername}</span>
            <span className="text-sm font-bold text-warm-dark">{formatViews(reel.views)}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
              reel.viralityRatio > 2 ? 'bg-green-100 text-green-700' :
              reel.viralityRatio >= 1 ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-600'
            }`}>
              {reel.viralityRatio.toFixed(1)}x
            </span>
            {reel.isOutlier && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">OUTLIER</span>
            )}
            <a href={reel.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-warm-muted hover:text-accent transition-colors">
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Body — structured analysis */}
        {hasAnalysis && (
          <div className="px-5 py-4 flex-1">
            {hook && (
              <div className="flex gap-2 py-2">
                <span className="flex-shrink-0 w-[72px] text-[11px] font-bold uppercase tracking-wide text-red-600 pt-px">Hook</span>
                <p className="text-[13px] text-warm-dark leading-relaxed">{hook}</p>
              </div>
            )}
            {retention && (
              <div className="flex gap-2 py-2 border-t border-warm-border/30">
                <span className="flex-shrink-0 w-[72px] text-[11px] font-bold uppercase tracking-wide text-blue-600 pt-px">Retention</span>
                <p className="text-[13px] text-warm-dark leading-relaxed">{retention}</p>
              </div>
            )}
            {patternFormula && (
              <div className="flex gap-2 py-2 border-t border-warm-border/30">
                <span className="flex-shrink-0 w-[72px] text-[11px] font-bold uppercase tracking-wide text-amber-700 pt-px">Pattern</span>
                <p className="text-[13px] text-warm-dark leading-relaxed">{patternFormula.replace(/^\[|\]$/g, '')}</p>
              </div>
            )}
            {triggers.length > 0 && (
              <div className="flex gap-2 py-2 border-t border-warm-border/30">
                <span className="flex-shrink-0 w-[72px] text-[11px] font-bold uppercase tracking-wide text-purple-600 pt-px">Triggers</span>
                <p className="text-[13px] text-warm-dark leading-relaxed">{triggers.join(' · ')}</p>
              </div>
            )}
            {props.length > 0 && (
              <div className="flex gap-2 py-2 border-t border-warm-border/30">
                <span className="flex-shrink-0 w-[72px] text-[11px] font-bold uppercase tracking-wide text-warm-muted pt-px">Props</span>
                <p className="text-[13px] text-warm-dark leading-relaxed">{props.join(', ')}</p>
              </div>
            )}
            {performanceAnalysis && (
              <div className="mt-3 px-3.5 py-2.5 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200">
                <p className="text-xs text-amber-900 leading-relaxed">{performanceAnalysis}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer with difficulty + reproduce */}
        {(difficulty || hasAnalysis) && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-warm-border/50 bg-cream-light/50 mt-auto">
            {difficulty && difficulty > 0 ? (
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i <= difficulty ? 'bg-amber-400' : 'bg-warm-border/40'}`} />
                  ))}
                </div>
                <span className="text-xs text-warm-muted">{difficulty}/5</span>
                {difficultyNote && <span className="text-[11px] text-warm-muted/60 ml-1">· {difficultyNote}</span>}
              </div>
            ) : <div />}

            <button
              onClick={handleReproduce}
              disabled={reproduceState === 'loading' || reproduceState === 'done'}
              className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ml-auto ${
                reproduceState === 'done' ? 'bg-green-100 text-green-700 cursor-default' :
                reproduceState === 'error' ? 'bg-red-100 text-red-600' :
                reproduceState === 'loading' ? 'bg-warm-border/20 text-warm-muted cursor-wait' :
                'bg-accent/10 text-accent hover:bg-accent/20 active:scale-95'
              }`}
            >
              {reproduceState === 'loading' && <><Loader2 size={10} className="animate-spin" /> Creating...</>}
              {reproduceState === 'done' && <><Check size={10} /> Added</>}
              {reproduceState === 'error' && <>Failed</>}
              {reproduceState === 'idle' && <><Repeat size={10} /> Reproduce</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 6. Winning Patterns Page (Own Reel Performance)

### Overview

The Winning Patterns system tracks our own published reels, detects winners (high performance_ratio), runs AI analysis, and ranks patterns by effectiveness. Shows KPIs, pattern ranking table, and actionable "Reproduce" recommendations.

### Components

#### `components/unit/WinningPatternsTab.tsx` — Per-Character Tab

```tsx
import { useState } from 'react'
import { WinningReelCard } from '../winning/WinningReelCard'
import { Spinner } from '../common/Spinner'
import { useWinningPatternsStore } from '../../stores/winningPatternsStore'
import type { ContentCharacter } from '../../types/contentCharacter'
import type { OwnReel } from '../../types/ownReel'

interface WinningPatternsTabProps {
  character: ContentCharacter
  reels: OwnReel[]
}

export function WinningPatternsTab({ character, reels }: WinningPatternsTabProps) {
  const loading = useWinningPatternsStore(s => s.loading)
  const [winnerOnly, setWinnerOnly] = useState(true)

  const filteredReels = reels
    .filter(r => {
      if (winnerOnly && !r.isWinner) return false
      return true
    })
    .sort((a, b) => b.performanceRatio - a.performanceRatio)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-64">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-xs font-semibold text-warm-muted uppercase tracking-wider">Reels — Browse</h2>
        <span className="text-[10px] text-warm-muted">{filteredReels.length} of {reels.length}</span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setWinnerOnly(v => !v)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              winnerOnly
                ? 'bg-green-100 text-green-700 border-green-300'
                : 'bg-cream text-warm-muted border-warm-border hover:bg-cream-dark'
            }`}
          >
            Winners Only
          </button>
        </div>
      </div>

      <div>
        {filteredReels.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-warm-muted">
            {reels.length === 0 ? 'No own reels for this character yet.' : 'No reels match current filters.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReels.map(reel => (
              <WinningReelCard key={reel.id} reel={reel} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

#### `components/winning/WinningReelCard.tsx` — Own Reel Card

Same structure as IdeaCard but for OwnReel type. Shows performance ratio instead of virality ratio, WINNER badge instead of OUTLIER, and reproduces from winning patterns.

```tsx
// (Same card layout as IdeaCard — see IdeaCard above for full code)
// Key differences:
// - Uses OwnReel type instead of WatchlistReel
// - Shows performanceRatio instead of viralityRatio
// - WINNER badge instead of OUTLIER
// - Reproduce creates task with source: 'winning-patterns'
// - Shows model/character info from reel.model
```

#### `components/winning/WinningBoard.tsx` — Full Page with KPIs + Pattern Ranking

Features:
- **Performance KPIs**: Total Reach, Views per Reel, Top Pattern, Analyzed count
- **Pattern Ranking Table**: Click to filter reels by pattern, shows SCALE/OPTIMIZE/TEST/PIVOT status
- **Reel Browse**: Filter by model, pattern, winners only

Pattern Status Logic:
```typescript
function getPatternStatus(reelCount: number, winnerCount: number, avgViews: number, globalAvgViews: number): PatternStatus {
  if (reelCount < 3) return 'TEST'           // Not enough data
  if (avgViews > globalAvgViews && winnerCount >= 1) return 'SCALE'  // Working well, make more
  if (winnerCount === 0 && avgViews < globalAvgViews) return 'PIVOT'  // Not working, try something else
  return 'OPTIMIZE'                           // Room for improvement
}
```

---

## Architecture Notes

1. **Data Flow**: Instagram → Scraper (Edge Function) → Supabase → Frontend (Zustand) → UI
2. **AI Pipeline**: Outlier detected → AI Job created → AI Server analyzes video → Structured fields written back to DB
3. **Pattern Matching**: Patterns are global (not per-character). Reels link to patterns via `matched_pattern_id`.
4. **Character Assignment**: Watchlist accounts are assigned to characters via `character_ids` JSONB array. Reels inherit character assignment.
5. **Outlier Detection**: `virality_ratio = views / account_avg_views`. Threshold for outlier flagging is configurable per scraper.
6. **Winner Detection**: `performance_ratio = views / account_avg_views`. Winner threshold set in scraper.
7. **Reproduce Flow**: Click "Reproduce" → creates `content_task` with reference to original reel → appears in Content Production pipeline.
