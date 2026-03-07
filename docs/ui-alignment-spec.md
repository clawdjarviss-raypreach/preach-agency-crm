# UI Alignment Spec — Match Tom's IdeaCard Design

## Reference
See screenshot in Discord. Tom's Content Ideas page shows horizontal reel cards with:
- Left: 9:16 video (width ~320px) with play button overlay
- Right: structured analysis with colored labels

## Changes to `app/(crm)/traffic-analytics/page.tsx`

### 1. IdeaCard video width: 240px → 320px
Change the left column width from 240 to 320.

### 2. IdeaCard header: Add account username
The header should show `@username` before the view count. 
- For winning reels: need to join `ig_account_id` → `crm_ig_accounts.username`
- For competitor reels: the watchlist's `ig_username`
- Pass `accountUsername` as a new prop to IdeaCard

### 3. Analysis field labels — match Tom's color coding
Tom uses these label colors (left-aligned, uppercase, bold):
- **HOOK** → red (#dc2626)
- **RETENTION** → blue (#2563eb) 
- **PATTERN** → amber (#d97706)
- **TRIGGERS** → purple (#7c3aed)
- **PROPS** → gray (#6b7280)

The AnalysisRows component should use a 2-column layout:
- Left column: colored label (72px wide, uppercase, bold, 11px)
- Right column: analysis text (13px, light gray)
- Separator lines between rows (1px solid #2a2a2a with 0.3 opacity)

### 4. Performance analysis → amber highlighted box
Wrap performance_analysis in a gradient box like Tom:
```
background: linear-gradient to bottom-right from #451a03 to #422006
border: 1px solid #92400e
border-radius: 8px
padding: 10px 14px
text color: #fbbf24 (amber-300)
font-size: 12px
```

### 5. Difficulty dots — match Tom's style
Show 5 dots (filled = amber-400, unfilled = gray-700), then "X/5" text and note.

### 6. "Reproduce" button styling — match Tom's
Tom uses: light accent background, small text, icon + "Reproduce" label

### 7. Remove caption from body
Don't show caption as a separate section. The analysis fields ARE the content.
Only show caption if there's no analysis.

### 8. ThumbnailCard: show as grid (3-4 per row)
Unanalyzed reels should render as a thumbnail grid (not full-width cards).
Use CSS grid: `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`

### 9. Outer link icon
Add a small external link icon (🔗 or ↗) next to the username that links to `https://instagram.com/reel/{shortcode}` — but we don't have shortcode. Skip for now.

## Data changes needed
- Winning reels query needs to also fetch the account username via join:
  ```
  .select("..., crm_ig_accounts!inner(username)")
  ```
- Pass `accountUsername` to IdeaCard

## DO NOT change:
- The Pattern Library section (working fine)
- The Model Info tab
- The Competitor Analysis tab structure (same IdeaCard applies there too)
- The data fetching logic (just add the join for username)
