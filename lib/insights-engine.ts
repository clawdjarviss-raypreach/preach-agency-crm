/**
 * Insights Engine — LTV, Segmentation, and Seasonality Calculations
 * 
 * This module provides stateless compute functions for queue analytics.
 * Used by analytics routes and scheduled sync jobs.
 */

export type Segment = 'vip' | 'whale' | 'core' | 'casual';

export interface ChatterLTVData {
  chatterId: string;
  name: string;
  totalRevenue: number;
  messageCount: number;
  responseRate: number;
  avgTipValue: number;
  avgMessageValue: number;
  daysSinceLastActivity: number;
}

export interface LTVProjection {
  chatterId: string;
  name: string;
  ltv90d: number;
  confidence: 'high' | 'medium' | 'low';
  breakdown: {
    baseRevenue: number;
    responseMultiplier: number;
    churnDiscount: number;
  };
}

export interface SeasonalityCell {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  hour: number; // 0-23
  avgMessages: number;
  peakFlag: boolean;
}

export interface SegmentStats {
  segment: Segment;
  count: number;
  avgLTV: number;
  avgResponseTime: number; // seconds
  churnRate: number; // 0-1
}

// ─── LTV Projection ────────────────────────────────────────────

/**
 * Calculate 90-day LTV projection for a chatter
 * 
 * Formula:
 *   base = (avgDailyRevenue * 90)
 *   responseMultiplier = 1 + (responseRate - 0.5) * 0.4  // ±20% swing
 *   churnProbability = calculateChurnProbability(daysSinceLastActivity, messageCount)
 *   ltv90d = base * responseMultiplier * (1 - churnProbability * 0.5)
 */
export function computeLTV(data: ChatterLTVData, historyDays: number = 90): LTVProjection {
  const avgDailyRevenue = historyDays > 0 ? data.totalRevenue / historyDays : 0;
  const baseRevenue = avgDailyRevenue * 90;
  
  // Response rate multiplier (50% response rate = 1.0x, 100% = 1.2x, 0% = 0.8x)
  const responseMultiplier = 1 + (data.responseRate - 0.5) * 0.4;
  
  // Churn probability based on recency and engagement
  const churnProb = calculateChurnProbability(data.daysSinceLastActivity, data.messageCount);
  
  // Discount LTV by expected churn (50% impact factor)
  const churnDiscount = 1 - (churnProb * 0.5);
  
  const ltv90d = Math.max(0, baseRevenue * responseMultiplier * churnDiscount);
  
  // Confidence based on message count
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (data.messageCount >= 50) confidence = 'high';
  else if (data.messageCount >= 20) confidence = 'medium';
  
  return {
    chatterId: data.chatterId,
    name: data.name,
    ltv90d: Math.round(ltv90d * 100) / 100,
    confidence,
    breakdown: {
      baseRevenue: Math.round(baseRevenue * 100) / 100,
      responseMultiplier: Math.round(responseMultiplier * 100) / 100,
      churnDiscount: Math.round(churnDiscount * 100) / 100,
    },
  };
}

/**
 * Calculate churn probability (0-1)
 * 
 * Based on:
 * - Days since last activity (higher = more likely to churn)
 * - Message count (higher = more engaged = less likely)
 */
export function calculateChurnProbability(daysSinceLastActivity: number, messageCount: number): number {
  // Recency factor: 30+ days = high risk
  const recencyRisk = Math.min(1, daysSinceLastActivity / 30);
  
  // Engagement factor: 50+ messages = well engaged
  const engagementProtection = Math.min(1, messageCount / 50) * 0.5;
  
  // Combined probability
  const churnProb = Math.max(0, Math.min(1, recencyRisk - engagementProtection));
  
  return Math.round(churnProb * 100) / 100;
}

// ─── Segmentation ──────────────────────────────────────────────

/**
 * Assign segment based on LTV percentile rank
 * 
 * Segments:
 * - VIP: top 10% spenders
 * - Whale: 50-90th percentile
 * - Core: 10-50th percentile  
 * - Casual: bottom 10%
 */
export function assignSegment(percentileRank: number): Segment {
  if (percentileRank >= 90) return 'vip';
  if (percentileRank >= 50) return 'whale';
  if (percentileRank >= 10) return 'core';
  return 'casual';
}

/**
 * Calculate percentile rank for a value in a sorted array
 */
export function percentileRank(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  
  let countBelow = 0;
  for (const v of sortedValues) {
    if (v < value) countBelow++;
    else break;
  }
  
  return (countBelow / sortedValues.length) * 100;
}

/**
 * Compute segment statistics from chatter data
 */
export function computeSegmentStats(
  chatters: Array<{
    chatterId: string;
    ltv90d: number;
    segment: Segment;
    avgResponseTime: number;
    daysSinceLastActivity: number;
    messageCount: number;
  }>
): SegmentStats[] {
  const segments: Segment[] = ['vip', 'whale', 'core', 'casual'];
  const stats: SegmentStats[] = [];
  
  for (const segment of segments) {
    const members = chatters.filter(c => c.segment === segment);
    
    if (members.length === 0) {
      stats.push({
        segment,
        count: 0,
        avgLTV: 0,
        avgResponseTime: 0,
        churnRate: 0,
      });
      continue;
    }
    
    const totalLTV = members.reduce((sum, c) => sum + c.ltv90d, 0);
    const totalResponseTime = members.reduce((sum, c) => sum + c.avgResponseTime, 0);
    
    // Churn rate = % of segment that's been inactive > 14 days
    const churned = members.filter(c => c.daysSinceLastActivity > 14).length;
    
    stats.push({
      segment,
      count: members.length,
      avgLTV: Math.round((totalLTV / members.length) * 100) / 100,
      avgResponseTime: Math.round(totalResponseTime / members.length),
      churnRate: Math.round((churned / members.length) * 100) / 100,
    });
  }
  
  return stats;
}

// ─── Seasonality ───────────────────────────────────────────────

export interface MessageTimestamp {
  timestamp: number; // Unix ms
}

/**
 * Compute seasonality heatmap from message timestamps
 * 
 * Returns 7x24 matrix (day x hour) with average message counts
 */
export function computeSeasonality(
  messages: MessageTimestamp[],
  timezone: string = 'UTC'
): SeasonalityCell[] {
  // Initialize 7x24 grid
  const grid: Record<string, { total: number; days: Set<string> }> = {};
  
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`;
      grid[key] = { total: 0, days: new Set() };
    }
  }
  
  // Process each message
  for (const msg of messages) {
    const date = new Date(msg.timestamp);
    const dayOfWeek = date.getDay(); // 0-6
    const hour = date.getHours();
    const dateKey = date.toISOString().split('T')[0];
    
    const key = `${dayOfWeek}-${hour}`;
    grid[key].total++;
    grid[key].days.add(dateKey);
  }
  
  // Convert to averages
  const cells: SeasonalityCell[] = [];
  let maxAvg = 0;
  
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`;
      const cell = grid[key];
      const uniqueDays = cell.days.size;
      const avg = uniqueDays > 0 ? cell.total / uniqueDays : 0;
      
      if (avg > maxAvg) maxAvg = avg;
      
      cells.push({
        dayOfWeek: day,
        hour,
        avgMessages: Math.round(avg * 100) / 100,
        peakFlag: false, // Set after we know the max
      });
    }
  }
  
  // Mark peaks (>= 80% of max)
  const threshold = maxAvg * 0.8;
  for (const cell of cells) {
    cell.peakFlag = cell.avgMessages >= threshold && cell.avgMessages > 0;
  }
  
  return cells;
}

// ─── Helpers ───────────────────────────────────────────────────

export function getDaysAgo(timestamp: number): number {
  const now = Date.now();
  const diff = now - timestamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export const SEGMENT_COLORS: Record<Segment, string> = {
  vip: '#8b5cf6',     // Purple
  whale: '#3b82f6',   // Blue
  core: '#22c55e',    // Green
  casual: '#6b7280',  // Gray
};

export const SEGMENT_EMOJIS: Record<Segment, string> = {
  vip: '👑',
  whale: '🐋',
  core: '⭐',
  casual: '🌱',
};

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
