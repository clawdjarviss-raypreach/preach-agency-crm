/**
 * Leaderboard Engine — Badge calculation and rank computation
 * 
 * Provides stateless compute functions for leaderboard rankings.
 * Used by leaderboard services and the API endpoint.
 */

// ─── BADGE TYPES ────────────────────────────────────────────────

export type BadgeType = 'speedster' | 'top_earner' | 'vip_favorite' | 'consistency';

export interface Badge {
  type: BadgeType;
  emoji: string;
  label: string;
  description: string;
}

export const BADGES: Record<BadgeType, Omit<Badge, 'type'>> = {
  speedster: {
    emoji: '⚡',
    label: 'Speedster',
    description: 'Avg response time under 1 minute',
  },
  top_earner: {
    emoji: '💰',
    label: 'Top Earner',
    description: 'Top 3 earnings this period',
  },
  vip_favorite: {
    emoji: '👑',
    label: 'VIP Favorite',
    description: 'Handled 10+ VIP messages',
  },
  consistency: {
    emoji: '🎯',
    label: 'Consistency',
    description: '95%+ response rate for 7+ days',
  },
};

export function getBadgeInfo(type: BadgeType): Badge {
  return { type, ...BADGES[type] };
}

// ─── PERIOD TYPES ───────────────────────────────────────────────

export type LeaderboardPeriod = 'ytd' | 'mtd' | 'wtd';

export interface PeriodRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
}

/**
 * Get date range for a period
 */
export function getPeriodRange(period: LeaderboardPeriod, referenceDate?: Date): PeriodRange {
  const now = referenceDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.toISOString().split('T')[0];
  
  switch (period) {
    case 'ytd': {
      const start = `${year}-01-01`;
      return {
        start,
        end: today,
        label: `Year to Date (Jan 1 – Today)`,
      };
    }
    case 'mtd': {
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthName = now.toLocaleString('en-US', { month: 'short' });
      return {
        start,
        end: today,
        label: `${monthName} to Date`,
      };
    }
    case 'wtd': {
      // Week starts on Monday
      const dayOfWeek = now.getDay();
      const diff = (dayOfWeek + 6) % 7; // Days since Monday
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      const start = monday.toISOString().split('T')[0];
      return {
        start,
        end: today,
        label: `Week to Date (Mon – Today)`,
      };
    }
  }
}

// ─── LEADERBOARD ENTRY ──────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  chatterId: string;
  chatterName: string;
  chatterAvatar: string;
  responseRate: number;        // 0-100 percentage
  avgResponseTimeSec: number;  // seconds
  earnings: number;            // USD cents
  badges: BadgeType[];
  trend: number;               // rank change from previous period
}

export interface ChatterMetrics {
  chatterId: string;
  name: string;
  avatar: string;
  totalMessages: number;
  respondedMessages: number;
  totalResponseTimeSec: number;
  responseCount: number;
  earnings: number;
  vipMessagesHandled: number;
  consecutiveDaysAbove95: number;
}

// ─── BADGE CALCULATION ──────────────────────────────────────────

export interface BadgeContext {
  metrics: ChatterMetrics;
  earningsRank: number;  // 1 = highest earner
  totalChatters: number;
}

/**
 * Calculate which badges a chatter has earned
 */
export function calculateBadges(ctx: BadgeContext): BadgeType[] {
  const badges: BadgeType[] = [];
  const { metrics, earningsRank } = ctx;
  
  // Speedster: avg response time < 60 seconds
  const avgResponseTime = metrics.responseCount > 0 
    ? metrics.totalResponseTimeSec / metrics.responseCount 
    : Infinity;
  if (avgResponseTime < 60 && metrics.responseCount >= 10) {
    badges.push('speedster');
  }
  
  // Top Earner: top 3 earnings
  if (earningsRank <= 3 && metrics.earnings > 0) {
    badges.push('top_earner');
  }
  
  // VIP Favorite: 10+ VIP messages handled
  if (metrics.vipMessagesHandled >= 10) {
    badges.push('vip_favorite');
  }
  
  // Consistency: 95%+ response rate for 7+ consecutive days
  if (metrics.consecutiveDaysAbove95 >= 7) {
    badges.push('consistency');
  }
  
  return badges;
}

/**
 * Calculate response rate percentage
 */
export function calculateResponseRate(respondedMessages: number, totalMessages: number): number {
  if (totalMessages === 0) return 0;
  const rate = (respondedMessages / totalMessages) * 100;
  return Math.round(rate * 10) / 10; // 1 decimal place
}

/**
 * Calculate average response time in seconds
 */
export function calculateAvgResponseTime(totalTimeSec: number, responseCount: number): number {
  if (responseCount === 0) return 0;
  return Math.round(totalTimeSec / responseCount);
}

// ─── RANKING ────────────────────────────────────────────────────

export type SortMetric = 'earnings' | 'responseRate' | 'avgResponseTime';

/**
 * Sort chatters by a metric and assign ranks
 */
export function rankChatters(
  chatters: ChatterMetrics[],
  sortBy: SortMetric = 'earnings'
): LeaderboardEntry[] {
  // First, compute derived metrics
  const enriched = chatters.map(c => ({
    ...c,
    responseRate: calculateResponseRate(c.respondedMessages, c.totalMessages),
    avgResponseTimeSec: calculateAvgResponseTime(c.totalResponseTimeSec, c.responseCount),
  }));
  
  // Sort by earnings to get earning ranks
  const byEarnings = [...enriched].sort((a, b) => b.earnings - a.earnings);
  const earningsRankMap = new Map<string, number>();
  byEarnings.forEach((c, i) => earningsRankMap.set(c.chatterId, i + 1));
  
  // Sort by selected metric
  const sorted = [...enriched].sort((a, b) => {
    switch (sortBy) {
      case 'earnings':
        return b.earnings - a.earnings;
      case 'responseRate':
        return b.responseRate - a.responseRate;
      case 'avgResponseTime':
        // Lower is better for response time
        if (a.avgResponseTimeSec === 0) return 1;
        if (b.avgResponseTimeSec === 0) return -1;
        return a.avgResponseTimeSec - b.avgResponseTimeSec;
    }
  });
  
  // Build leaderboard entries with badges
  return sorted.map((c, index) => {
    const badges = calculateBadges({
      metrics: chatters.find(orig => orig.chatterId === c.chatterId)!,
      earningsRank: earningsRankMap.get(c.chatterId) || 999,
      totalChatters: chatters.length,
    });
    
    return {
      rank: index + 1,
      chatterId: c.chatterId,
      chatterName: c.name,
      chatterAvatar: c.avatar,
      responseRate: c.responseRate,
      avgResponseTimeSec: c.avgResponseTimeSec,
      earnings: c.earnings,
      badges,
      trend: 0, // Calculated separately when comparing periods
    };
  });
}

/**
 * Calculate trend (rank change) between current and previous period
 */
export function calculateTrends(
  current: LeaderboardEntry[],
  previous: LeaderboardEntry[]
): LeaderboardEntry[] {
  const prevRankMap = new Map<string, number>();
  previous.forEach(p => prevRankMap.set(p.chatterId, p.rank));
  
  return current.map(entry => {
    const prevRank = prevRankMap.get(entry.chatterId);
    const trend = prevRank !== undefined ? prevRank - entry.rank : 0;
    return { ...entry, trend };
  });
}

// ─── FORMATTERS ─────────────────────────────────────────────────

/**
 * Format response time for display
 */
export function formatResponseTime(seconds: number): string {
  if (seconds === 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format earnings for display
 */
export function formatEarnings(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${(dollars / 1000).toFixed(1)}K`;
  if (dollars >= 1000) return `$${Math.round(dollars).toLocaleString()}`;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format response rate for display
 */
export function formatResponseRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

// ─── PERIOD HELPERS ─────────────────────────────────────────────

/**
 * Get the previous period range (for trend calculation)
 */
export function getPreviousPeriodRange(period: LeaderboardPeriod, referenceDate?: Date): PeriodRange {
  const now = referenceDate || new Date();
  
  switch (period) {
    case 'ytd': {
      // Previous year to date
      const prevYear = now.getFullYear() - 1;
      const start = `${prevYear}-01-01`;
      const sameDay = new Date(now);
      sameDay.setFullYear(prevYear);
      const end = sameDay.toISOString().split('T')[0];
      return { start, end, label: `Previous YTD` };
    }
    case 'mtd': {
      // Previous month to date
      const prevMonth = new Date(now);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const start = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
      const dayOfMonth = Math.min(now.getDate(), new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate());
      const end = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
      return { start, end, label: `Previous MTD` };
    }
    case 'wtd': {
      // Previous week to date
      const dayOfWeek = now.getDay();
      const diff = (dayOfWeek + 6) % 7;
      const prevMonday = new Date(now);
      prevMonday.setDate(now.getDate() - diff - 7);
      const start = prevMonday.toISOString().split('T')[0];
      const sameDayPrevWeek = new Date(now);
      sameDayPrevWeek.setDate(sameDayPrevWeek.getDate() - 7);
      const end = sameDayPrevWeek.toISOString().split('T')[0];
      return { start, end, label: `Previous WTD` };
    }
  }
}

/**
 * Check if a date string falls within a range
 */
export function isDateInRange(dateStr: string, range: PeriodRange): boolean {
  return dateStr >= range.start && dateStr <= range.end;
}
