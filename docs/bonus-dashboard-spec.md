# SPEC: Gamified Bonus Dashboard (Traffic Dashboard Toggle)

## Overview
Add a gamified "Bonus Tracker" view to the Traffic Dashboard, togglable alongside the existing subs/tracking links view. Shows employees their weekly performance bonuses in a motivating, game-like UI.

## Bonus Structure

### Base Pay
- **$120 (₱6,960) per week** — guaranteed, paid every Friday

### Views Bonus (per account, per week)
| Tier | Weekly Views | Bonus |
|------|-------------|-------|
| — | Under 50K | $0 |
| 🥉 BRONZE | 50K – 200K | +$10 (₱580) |
| 🥈 SILVER | 200K – 500K | +$25 (₱1,450) |
| 🥇 GOLD | 500K – 1M | +$50 (₱2,900) |
| 💎 DIAMOND | 1M+ | +$80 (₱4,640) |

### Follower Bonus (per account, per week)
| Tier | New Followers | Bonus |
|------|--------------|-------|
| — | Under 100 | $0 |
| 🥉 BRONZE | 100 – 500 | +$10 (₱580) |
| 🥈 SILVER | 500 – 1,500 | +$20 (₱1,160) |
| 🥇 GOLD | 1,500 – 3,000 | +$40 (₱2,320) |
| 💎 DIAMOND | 3,000+ | +$60 (₱3,480) |

## UI Design — Gamified

### Access & Configuration
- **Admin Members page**: Toggle per employee to enable/disable bonus system (stored in `crm_chatters.bonus_enabled` boolean). Not all employees are on this pay structure.
- **Traffic Dashboard for employees** (`marketing_manager` role with `bonus_enabled = true`): Shows their personalized bonus tracker instead of/alongside the standard view
- **Admin Traffic Dashboard**: Shows full subs + tracking links + bonus overview for all bonus-enabled employees

### Bonus Tracker View
1. **Weekly Summary Card** (top)
   - Current week period (Mon–Sun)
   - Base pay: $120
   - Total views bonus: $X
   - Total follower bonus: $X
   - **TOTAL THIS WEEK: $X** (large, prominent)
   - Progress bar showing % through the week

2. **Per-Account Breakdown** (main content)
   - Card per IG account assigned to the employee
   - Each card shows:
     - Account username + avatar
     - Current week views + tier badge (BRONZE/SILVER/GOLD/DIAMOND)
     - Progress bar to NEXT tier (e.g., "120K / 200K to Silver")
     - Current week new followers + tier badge
     - Progress bar to next follower tier
     - Bonus earned this account: $X
   - Sort by highest bonus first

3. **Gamification Elements**
   - Tier badges with colors (bronze=#CD7F32, silver=#C0C0C0, gold=#FFD700, diamond=#B9F2FF)
   - Progress bars showing distance to next tier
   - "🔥 X accounts at Gold or higher!" motivational text
   - Weekly leaderboard (if admin: shows all employees; if employee: shows their rank)

### Data Sources
- **Views per account per week**: `ig_account_reel_stats` RPC with Monday→Sunday date range
- **New followers per account per week**: `crm_ig_daily_snapshots` follower delta
- **Account assignment**: `crm_ig_accounts.creator_id` → `crm_creators` → employee's assigned creators
- **Employee identification**: Current user's `crm_chatters` record → `assigned_creators` array

### Role-Based Visibility
- **Admin**: Sees all employees' bonuses, can switch between employees, sees leaderboard
- **Marketing Manager**: Sees only their own assigned accounts/bonuses
- **Other roles**: No access to bonus tracker

### Weekly Period
- Week = Monday 00:00 UTC → Sunday 23:59 UTC
- Data refreshes with IG sync (daily at 02:00 UTC)
- Shows current week by default, with option to view previous weeks

## Technical Notes
- Bonus calculation is CLIENT-SIDE (simple threshold logic, no need for backend)
- Uses existing IG data infrastructure (RPCs, snapshots)
- Currency display: USD primary, PHP in parentheses (exchange rate: 1 USD = 58 PHP, hardcoded for now)
- Weekly period helper: `getWeekRange(date)` → { start: Monday, end: Sunday }

## Phase
This is Phase 2 of the Traffic Dashboard. Phase 1 (subs + tracking links) already exists.
Build AFTER the IG Stats page extraction is complete.
