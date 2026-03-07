// @ts-nocheck
import { query } from '@anthropic-ai/claude-agent-sdk'
import { supabase } from './supabase.js'

export type JobSource = 'competitor_reels' | 'ig_reels'

export type AnalyzeReelJobParams = {
  reelId: string
  source: JobSource
  videoUrl: string
  metrics?: Record<string, unknown>
  topComments?: Array<{ text: string; likes?: number }>
}

export type JobPayload = {
  jobId: string
  type: 'analyze-reel'
  params: AnalyzeReelJobParams
}

type AnalysisOutput = {
  hook: string
  retention: string
  pattern_name: string
  pattern_formula: string
  triggers: string[]
  props: string[]
  difficulty: number
  difficulty_note: string
  performance_analysis: string
}

function buildPrompt(params: AnalyzeReelJobParams) {
  return [
    'You are running the Reel Analysis skill. Follow this output contract exactly.',
    'Analyze this Instagram reel and return ONLY a raw JSON object with these exact fields:',
    'hook, retention, pattern_name, pattern_formula, triggers, props, difficulty, difficulty_note, performance_analysis.',
    'Use the reel-analysis-skill formatting rules: specific hook, clear retention mechanic, reproducible pattern formula, concrete triggers and props, difficulty 1-5.',
    '',
    `reel_id: ${params.reelId}`,
    `video_url: ${params.videoUrl}`,
    `temp_prefix: /tmp/reel_${params.reelId.replace(/-/g, '')}`,
    `metrics: ${JSON.stringify(params.metrics ?? {})}`,
    `top_comments: ${JSON.stringify(params.topComments ?? [])}`,
  ].join('\n')
}

function parseJsonResult(raw: string): AnalysisOutput {
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Claude output did not contain JSON object')
  }

  const jsonText = raw.slice(firstBrace, lastBrace + 1)
  const parsed = JSON.parse(jsonText) as Partial<AnalysisOutput>

  return {
    hook: parsed.hook ?? '',
    retention: parsed.retention ?? '',
    pattern_name: parsed.pattern_name ?? '',
    pattern_formula: parsed.pattern_formula ?? '',
    triggers: Array.isArray(parsed.triggers) ? parsed.triggers.map(String) : [],
    props: Array.isArray(parsed.props) ? parsed.props.map(String) : [],
    difficulty: Number(parsed.difficulty ?? 0),
    difficulty_note: parsed.difficulty_note ?? '',
    performance_analysis: parsed.performance_analysis ?? '',
  }
}

async function getOrCreatePatternId(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return null

  const { data: existing, error: findError } = await supabase
    .from('patterns')
    .select('id')
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle()

  if (findError) throw findError
  if (existing?.id) return existing.id as string

  const { data: created, error: createError } = await supabase
    .from('patterns')
    .insert({ name: trimmed, status: 'exploration' })
    .select('id')
    .single()

  if (createError) throw createError
  return created.id as string
}

async function upsertReelAnalysis(source: JobSource, reelId: string, analysis: AnalysisOutput) {
  if (source === 'competitor_reels') {
    const { data: existing, error: existingError } = await supabase
      .from('crm_reel_analyses')
      .select('id')
      .eq('competitor_reel_id', reelId)
      .limit(1)
      .maybeSingle()

    if (existingError) throw existingError

    const payload = {
      competitor_reel_id: reelId,
      hook: analysis.hook,
      retention: analysis.retention,
      pattern_name: analysis.pattern_name,
      pattern_formula: analysis.pattern_formula,
      triggers: analysis.triggers,
      props: analysis.props,
      difficulty: Number.isFinite(analysis.difficulty) ? analysis.difficulty : null,
      difficulty_note: analysis.difficulty_note,
      performance_analysis: analysis.performance_analysis,
      analyzed_at: new Date().toISOString(),
      model_used: 'opus',
    }

    if (existing?.id) {
      const { error } = await supabase.from('crm_reel_analyses').update(payload).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('crm_reel_analyses').insert(payload)
      if (error) throw error
    }

    return
  }

  const { data: existing, error: existingError } = await supabase
    .from('crm_reel_analyses')
    .select('id')
    .eq('own_reel_id', reelId)
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError

  const payload = {
    own_reel_id: reelId,
    hook: analysis.hook,
    retention: analysis.retention,
    pattern_name: analysis.pattern_name,
    pattern_formula: analysis.pattern_formula,
    triggers: analysis.triggers,
    props: analysis.props,
    difficulty: Number.isFinite(analysis.difficulty) ? analysis.difficulty : null,
    difficulty_note: analysis.difficulty_note,
    performance_analysis: analysis.performance_analysis,
    analyzed_at: new Date().toISOString(),
    model_used: 'opus',
  }

  if (existing?.id) {
    const { error } = await supabase.from('crm_reel_analyses').update(payload).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('crm_reel_analyses').insert(payload)
    if (error) throw error
  }
}

export async function analyzeReelJob(job: JobPayload) {
  const { jobId, params } = job

  const now = new Date().toISOString()
  await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: now, updated_at: now, progress: 'Starting analysis...' })
    .eq('id', jobId)

  const analysisPrompt = buildPrompt(params)
  const stream = query({
    prompt: analysisPrompt,
    options: {
      model: 'opus',
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable: '/Users/jarvis/.local/bin/claude',
      cwd: process.cwd(),
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      maxTurns: 80,
    },
  })

  let combinedText = ''
  let turns = 0

  for await (const message of stream as AsyncIterable<any>) {
    if (message?.type === 'assistant' && typeof message?.text === 'string') {
      combinedText += `\n${message.text}`
      await supabase
        .from('ai_jobs')
        .update({ progress: message.text.slice(-240), updated_at: new Date().toISOString() })
        .eq('id', jobId)
    }

    if (message?.type === 'result') {
      turns = Number(message?.num_turns ?? turns)
      if (typeof message?.result === 'string') {
        combinedText += `\n${message.result}`
      }
    }
  }

  const analysis = parseJsonResult(combinedText)
  const matchedPatternId = await getOrCreatePatternId(analysis.pattern_name)

  await upsertReelAnalysis(params.source, params.reelId, analysis)

  if (params.source === 'competitor_reels') {
    const { error } = await supabase
      .from('crm_competitor_reels')
      .update({
        analysis_status: 'done',
        matched_pattern_id: matchedPatternId,
        pattern_type: matchedPatternId ? 'proven' : 'unprocessed',
      })
      .eq('id', params.reelId)

    if (error) throw error
  } else {
    const { error } = await supabase
      .from('crm_ig_reels')
      .update({
        analysis_status: 'done',
        matched_pattern_id: matchedPatternId,
      })
      .eq('id', params.reelId)

    if (error) throw error
  }

  const finishedAt = new Date().toISOString()
  const { error: jobUpdateError } = await supabase
    .from('ai_jobs')
    .update({
      status: 'completed',
      result: analysis,
      turns,
      completed_at: finishedAt,
      updated_at: finishedAt,
      progress: 'Completed',
    })
    .eq('id', jobId)

  if (jobUpdateError) throw jobUpdateError

  return analysis
}
