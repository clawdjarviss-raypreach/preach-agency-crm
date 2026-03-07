import cors from 'cors'
import express from 'express'
import { analyzeReelJob, type JobPayload } from './analyzer.js'
import { supabase } from './supabase.js'

const app = express()
const port = Number(process.env.PORT ?? 3456)
const restartSecret = process.env.RESTART_SECRET ?? ''

const MAX_CONCURRENT = 3
let runningCount = 0
const queue: JobPayload[] = []

app.use(cors())
app.use(express.json({ limit: '1mb' }))

function processQueue() {
  while (runningCount < MAX_CONCURRENT && queue.length > 0) {
    const nextJob = queue.shift()
    if (!nextJob) return

    runningCount += 1

    void analyzeReelJob(nextJob)
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error)
        const now = new Date().toISOString()

        await supabase
          .from('ai_jobs')
          .update({
            status: 'failed',
            error: message,
            completed_at: now,
            updated_at: now,
          })
          .eq('id', nextJob.jobId)

        const source = nextJob.params.source
        const reelTable = source === 'competitor_reels' ? 'crm_competitor_reels' : 'crm_ig_reels'
        await supabase
          .from(reelTable)
          .update({ analysis_status: 'error' })
          .eq('id', nextJob.params.reelId)
      })
      .finally(() => {
        runningCount -= 1
        processQueue()
      })
  }
}

app.post('/api/jobs', async (req, res) => {
  const body = req.body as JobPayload

  if (!body?.jobId || body?.type !== 'analyze-reel' || !body?.params?.reelId || !body?.params?.source || !body?.params?.videoUrl) {
    res.status(400).json({ ok: false, error: 'Invalid job payload' })
    return
  }

  const source = body.params.source
  if (source !== 'competitor_reels' && source !== 'ig_reels') {
    res.status(400).json({ ok: false, error: 'Invalid source' })
    return
  }

  queue.push(body)

  const reelTable = source === 'competitor_reels' ? 'crm_competitor_reels' : 'crm_ig_reels'
  await Promise.all([
    supabase
      .from('ai_jobs')
      .update({ status: 'queued', updated_at: new Date().toISOString() })
      .eq('id', body.jobId),
    supabase
      .from(reelTable)
      .update({ analysis_status: 'queued' })
      .eq('id', body.params.reelId),
  ])

  processQueue()
  res.json({ ok: true, queued: queue.length, running: runningCount, maxConcurrent: MAX_CONCURRENT })
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/status', (_req, res) => {
  res.json({ ok: true, running: runningCount, queued: queue.length, maxConcurrent: MAX_CONCURRENT })
})

app.get('/api/restart', (req, res) => {
  const secret = String(req.query.secret ?? '')
  if (!restartSecret || secret !== restartSecret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  res.json({ ok: true, message: 'Restarting process...' })
  setTimeout(() => process.exit(0), 300)
})

app.listen(port, () => {
  console.log(`[ai-server] listening on :${port}`)
})
