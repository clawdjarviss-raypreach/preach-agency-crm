import type { AiJobSource, StorageService } from './storage';

export type MediaDetail = {
  takenAtIso: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
};

const PROJECTION_THRESHOLD = 100_000;

export type AnalyzeCandidate = {
  is_winner?: boolean;
  is_outlier?: boolean;
  is_trending: boolean;
  projected_views: number;
  analysis_status: string | null;
};

export function shouldAnalyze(reel: AnalyzeCandidate): boolean {
  const flagged = Boolean(reel.is_winner || reel.is_outlier || reel.is_trending);
  if (!flagged) return false;

  if (reel.projected_views < PROJECTION_THRESHOLD) return false;

  const status = (reel.analysis_status ?? '').toLowerCase();
  if (status === 'done' || status === 'queued' || status === 'analyzing' || status === 'completed') {
    return false;
  }

  return true;
}

export async function queueAnalysis(params: {
  storage: StorageService;
  aiServerUrl: string;
  source: AiJobSource;
  reelId: string;
  caption: string | null;
  projectedViews: number;
  mediaDetail: MediaDetail;
}): Promise<string | null> {
  const videoUrl = params.mediaDetail.videoUrl;
  if (!videoUrl) return null;

  if (params.source === 'crm_competitor_reels') {
    await params.storage.setCompetitorVideoUrl(params.reelId, videoUrl);
  }

  await params.storage.markAnalysisQueued(params.source, params.reelId);

  const jobId = await params.storage.enqueueAiJob({
    source: params.source,
    reelId: params.reelId,
    videoUrl,
    caption: params.caption,
    projectedViews: params.projectedViews,
  });

  const response = await fetch(`${params.aiServerUrl.replace(/\/$/, '')}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId,
      videoUrl,
      caption: params.caption,
      reelType: params.source === 'crm_ig_reels' ? 'own' : 'competitor',
      reelId: params.reelId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI server ${response.status}: ${text}`);
  }

  return jobId;
}
