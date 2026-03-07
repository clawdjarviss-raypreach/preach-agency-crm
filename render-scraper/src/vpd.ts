export type ReelVPD = {
  lifetime_vpd: number;
  delta_vpd: number | null;
  effective_vpd: number;
  age_days: number;
  projected_views: number;
};

export type AccountTier = 'small' | 'mid' | 'large';

export type AccountVPD = {
  median_vpd: number;
  median_delta_vpd: number | null;
  winner_threshold: number;
  tier: AccountTier;
  active_reel_count: number;
};

export type ReelFlags = {
  is_winner: boolean;
  is_outlier: boolean;
  is_trending: boolean;
  virality_ratio: number;
};

export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateReelVPD(
  views: number,
  postedAt: Date,
  prevSnapshot: { views: number; scrapedAt: Date } | null,
  now: Date,
): ReelVPD {
  const ageDays = Math.max((now.getTime() - postedAt.getTime()) / 86_400_000, 0.25);
  const lifetimeVpd = views / ageDays;

  let deltaVpd: number | null = null;
  if (prevSnapshot) {
    const hoursBetween = (now.getTime() - prevSnapshot.scrapedAt.getTime()) / 3_600_000;
    if (hoursBetween >= 1) {
      deltaVpd = ((views - prevSnapshot.views) / hoursBetween) * 24;
      if (deltaVpd < 0) deltaVpd = 0;
    }
  }

  const effectiveVpd = Math.max(lifetimeVpd, deltaVpd ?? 0);
  const remainingDays = Math.max(14 - ageDays, 0);
  const projectedViews = views + effectiveVpd * remainingDays;

  return {
    lifetime_vpd: lifetimeVpd,
    delta_vpd: deltaVpd,
    effective_vpd: effectiveVpd,
    age_days: ageDays,
    projected_views: projectedViews,
  };
}

export function calculateAccountVPD(reels: ReelVPD[]): AccountVPD {
  const vpds = reels.map((r) => r.lifetime_vpd).sort((a, b) => a - b);
  const medianVpd = median(vpds);

  const deltas = reels
    .map((r) => r.delta_vpd)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  const medianDelta = deltas.length > 0 ? median(deltas) : null;

  let threshold: number;
  let tier: AccountTier;
  if (medianVpd < 1_000) {
    threshold = 5;
    tier = 'small';
  } else if (medianVpd < 10_000) {
    threshold = 3;
    tier = 'mid';
  } else {
    threshold = 2;
    tier = 'large';
  }

  return {
    median_vpd: medianVpd,
    median_delta_vpd: medianDelta,
    winner_threshold: threshold,
    tier,
    active_reel_count: reels.length,
  };
}

export function flagReel(reel: ReelVPD, account: AccountVPD): ReelFlags {
  const baseline = Math.max(account.median_vpd, 1);
  const ratio = reel.effective_vpd / baseline;

  const isWinner = ratio >= account.winner_threshold;

  let isTrending = false;
  if (reel.delta_vpd !== null && account.median_delta_vpd !== null && account.median_delta_vpd > 0) {
    isTrending = reel.delta_vpd / account.median_delta_vpd >= 5;
  }

  return {
    is_winner: isWinner,
    is_outlier: isWinner,
    is_trending: isTrending,
    virality_ratio: ratio,
  };
}
