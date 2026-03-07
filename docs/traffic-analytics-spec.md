# Traffic Analytics Dashboard — Feature Spec
> Source: Rayan + Tom discussion, Mar 4, 2026 (transcript + voice notes)

## Overview
New section in Preach CRM left sidebar: **Traffic Analysis** (or "Traffic Analytics")

## Navigation Structure

```
Traffic Analysis (sidebar)
└── [Creator/Model Selector] — shows models assigned to the logged-in user
    ├── Model Info Tab
    │   ├── Key model information (dashboards, outfit analysis, branding info)
    │   └── Character reference (face images, outfits, branding assets)
    │       → New employee can pull everything they need to produce content
    │
    ├── Winning Patterns Tab (OWN reels)
    │   └── AI analysis of own outlier reels (1.5x account avg views)
    │       → Uses Claude SDK / Opus reel analysis skill
    │       → Data source: Tom's Supabase (am_reels + snapshots)
    │
    └── Competitor Analysis Tab
        ├── [Content Format Sub-tabs] — per format, NOT per competitor
        │   ├── Omegle
        │   ├── Mechanic
        │   ├── Talking
        │   └── (other formats as needed)
        │
        └── Per format:
            ├── Watchlist of competitor accounts (user-curated)
            │   → User adds competitor IG accounts to their watchlist
            │   → Data source: RapidAPI for competitor IG data
            │
            └── AI analysis of competitor outlier reels (1.5x avg views)
                → Same Claude SDK / Opus reel analysis skill
                → Results stored in our Supabase
```

## Key Design Decisions

### 1. Competitor Analysis is per FORMAT, not per competitor
- Formats: Omegle, Mechanic, Talking, Generic/Branding
- Each format has its own watchlist of competitor accounts
- Competitor reels across accounts in the same format get analyzed together
- Example: "Omegle" watchlist might have 10 competitor accounts, all analyzed as a group

### 2. Per-creator watchlists
- Each creator/model has their own competitor watchlists per format
- If two models both need Omegle competitors, they each have separate lists
- Tom acknowledged potential duplicate analysis but considers API costs manageable ($200 Anthropic plan)

### 3. Role-based visibility
- Content employees see only formats relevant to their assigned creators
- Example: Employee assigned to 2 creators doing Omegle → sees Omegle competitor tab, NOT Mechanic
- Implementation: can show/hide or collapse/expand format tabs based on relevance
- Rayan: "Es wäre gut wenn er das nicht sieht weil es einfach so ein Gebootel ist weil er es nicht braucht"

### 4. Character/Branding Reference (Model Info)
- Show character images (face references, outfits)
- Branding info, overlay styles, outfit requirements
- One-stop shop for new employees: "give them this and they can pull everything they need"
- Tom already has character faces in 1ClickContent
- We need: outfit images, branding assets, key model info

### 5. Outlier Definition
- **Outlier = 1.5x views of account average** (hardcoded)
- Only outliers get AI analysis (saves API costs)
- AI analysis uses Opus via Claude SDK, NOT OpenClaw

## Data Sources
| Data | Source | Method |
|------|--------|--------|
| Own reels + snapshots | Tom's Supabase (`am_reels`, `am_reels_daily_snapshots`) | Already synced daily |
| Own reel AI analysis | Claude SDK (Opus) | Triggered by Supabase cron |
| Competitor reels | RapidAPI | New integration needed |
| Competitor reel AI analysis | Claude SDK (Opus) | Triggered by Supabase cron |
| Character/branding assets | Our Supabase | Manual upload + existing training data |

## Technical Architecture
```
Supabase Edge Function (cron daily)
  → Identifies new outliers (1.5x account avg)
  → Sends analysis job to Claude SDK (Mac Mini via Cloudflare tunnel)
  → Claude SDK runs reel analysis skill (Opus, frame-by-frame every 3s)
  → Results written back to our Supabase
  → Frontend displays analysis in Traffic Analytics dashboard
```

## New DB Tables Needed
- `crm_competitor_watchlists` — which competitor accounts each creator tracks, per format
- `crm_competitor_reels` — competitor reel data (from RapidAPI)
- `crm_reel_analyses` — AI analysis results (own + competitor), linked to reel ID
- `crm_content_formats` — format definitions (Omegle, Mechanic, Talking, etc.)

## Dependencies
1. ~~Tom's reel analysis markdown skill file~~ ✅ Received — saved to `docs/reel-analysis-skill.md`
2. Claude SDK setup on Mac Mini (Cloudflare tunnel)
3. RapidAPI key + integration for competitor IG data
4. Character/branding asset upload system

## Reel Analysis Skill Summary
- Downloads video, extracts frames at 3fps via ffmpeg
- Reads 5 evenly-spaced key frames visually (Opus vision)
- Analyzes: hook element, retention mechanic, props, triggers, difficulty
- Combines with metrics (views, likes, shares, outlier multiplier) + top comments
- Outputs structured JSON: hook, retention, pattern_name, pattern_formula, triggers, props, difficulty, performance_analysis
- Full skill: `docs/reel-analysis-skill.md`
