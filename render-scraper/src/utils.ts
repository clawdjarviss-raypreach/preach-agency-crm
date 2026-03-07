export function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function toIsoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPosterUrl(media: Record<string, unknown>): string | null {
  const imageVersions2 = media.image_versions2 as
    | { candidates?: Array<{ url?: string | null }>; [key: string]: unknown }
    | undefined;

  const candidates = imageVersions2?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    return candidates[0]?.url ?? null;
  }

  const thumbnailUrl = media.thumbnail_url;
  if (typeof thumbnailUrl === 'string' && thumbnailUrl.length > 0) return thumbnailUrl;

  const displayUrl = media.display_url;
  if (typeof displayUrl === 'string' && displayUrl.length > 0) return displayUrl;

  return null;
}

export function getVideoUrl(media: Record<string, unknown>): string | null {
  const versions = media.video_versions as Array<{ url?: string | null }> | undefined;
  if (Array.isArray(versions) && versions.length > 0) {
    return versions[0]?.url ?? null;
  }

  const videoUrl = media.video_url;
  if (typeof videoUrl === 'string' && videoUrl.length > 0) return videoUrl;

  return null;
}

export type RetryOptions = {
  retries: number;
  delayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, delayMs = 0, shouldRetry } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const allowed = shouldRetry ? shouldRetry(error) : true;
      if (!allowed || attempt === retries) break;
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  throw lastError;
}
