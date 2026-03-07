// @ts-nocheck
import { supabaseAdmin, json } from '../_shared/supabase.ts'

const AI_SERVER_URL = Deno.env.get('AI_SERVER_URL') ?? ''

function isMissingVideo(url: string | null | undefined) {
  return !url || !url.trim()
}

async function queueCompetitorReels() {
  const { data, error } = await supabaseAdmin
    .from('crm_competitor_reels')
    .select('id,video_url,play_count,like_count,comment_count,caption,virality_ratio')
    .eq('is_outlier', true)
    .or('analysis_status.eq.pending,analysis_status.is.null')
    .order('play_count', { ascending: false })
    .limit(5)

  if (error) throw error
  return (data ?? []).filter((row) => !isMissingVideo(row.video_url))
}

async function queueOwnReels() {
  const { data, error } = await supabaseAdmin
    .from('crm_ig_reels')
    .select('id,video_url,views,likes,comments,caption,performance_ratio,account_avg_views')
    .eq('is_winner', true)
    .neq('is_deleted', true)
    .or('analysis_status.eq.pending,analysis_status.is.null')
    .order('views', { ascending: false })
    .limit(5)

  if (error) throw error
  return (data ?? []).filter((row) => !isMissingVideo(row.video_url))
}

async function insertJob(source: 'competitor_reels' | 'ig_reels', sourceId: string, params: Record<string, unknown>) {
  const now = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('ai_jobs')
    .insert({
      type: 'analyze-reel',
      source,
      source_id: sourceId,
      params,
      status: 'queued',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

async function markQueued(table: 'crm_competitor_reels' | 'crm_ig_reels', reelId: string) {
  const { error } = await supabaseAdmin
    .from(table)
    .update({ analysis_status: 'queued' })
    .eq('id', reelId)

  if (error) throw error
}

async function dispatchToAiServer(payload: { jobId: string; type: 'analyze-reel'; params: Record<string, unknown> }) {
  if (!AI_SERVER_URL) throw new Error('Missing AI_SERVER_URL')

  const response = await fetch(AI_SERVER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AI server ${response.status}: ${text}`)
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 })
    }

    const [competitors, own] = await Promise.all([queueCompetitorReels(), queueOwnReels()])
    const dispatched: Array<Record<string, unknown>> = []

    for (const reel of competitors) {
      const params = {
        reelId: reel.id,
        source: 'competitor_reels',
        videoUrl: reel.video_url,
        metrics: {
          views: Number(reel.play_count ?? 0),
          likes: Number(reel.like_count ?? 0),
          comments: Number(reel.comment_count ?? 0),
          caption: reel.caption ?? '',
          viralityRatio: Number(reel.virality_ratio ?? 0),
        },
      }

      const jobId = await insertJob('competitor_reels', reel.id, params)
      await markQueued('crm_competitor_reels', reel.id)
      await dispatchToAiServer({ jobId, type: 'analyze-reel', params })

      dispatched.push({ jobId, source: 'competitor_reels', reelId: reel.id })
    }

    for (const reel of own) {
      const params = {
        reelId: reel.id,
        source: 'ig_reels',
        videoUrl: reel.video_url,
        metrics: {
          views: Number(reel.views ?? 0),
          likes: Number(reel.likes ?? 0),
          comments: Number(reel.comments ?? 0),
          caption: reel.caption ?? '',
          performanceRatio: Number(reel.performance_ratio ?? 0),
          accountAvgViews: Number(reel.account_avg_views ?? 0),
        },
      }

      const jobId = await insertJob('ig_reels', reel.id, params)
      await markQueued('crm_ig_reels', reel.id)
      await dispatchToAiServer({ jobId, type: 'analyze-reel', params })

      dispatched.push({ jobId, source: 'ig_reels', reelId: reel.id })
    }

    return json({
      ok: true,
      queuedCompetitor: competitors.length,
      queuedOwn: own.length,
      dispatched,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ ok: false, error: message }, { status: 500 })
  }
})
