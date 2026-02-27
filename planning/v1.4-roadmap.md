# Preach CRM v1.4 Roadmap

**Planning Date:** 2026-02-06  
**Previous:** v1.3 (3 features, +9,471 lines)  
**Sprint Goal:** Maximum leverage with minimal effort

---

## Executive Summary

After analyzing all 6 candidate features against ROI, effort, and strategic value, the **top 3 recommendations for v1.4** are:

| Rank | Feature | Est. Hours | ROI Score | Why |
|------|---------|-----------|-----------|-----|
| 🥇 | **Bulk Operations** | 45-55h | ⭐⭐⭐⭐⭐ | Quickest win, massive daily time savings |
| 🥈 | **Chat Queue Optimization** | 70-85h | ⭐⭐⭐⭐⭐ | Core workflow, competitive differentiator |
| 🥉 | **Advanced Analytics** | 55-70h | ⭐⭐⭐⭐ | Natural v1.3 extension, leverages existing code |

**Total v1.4 Estimate:** 170-210 hours (~4-5 weeks with 1 dev)

---

## Feature Analysis

### 🥇 #1: Bulk Operations (RECOMMENDED)

**Why First:** Highest ROI. Every user benefits immediately. Low complexity, high impact.

#### Value Proposition
- **Bulk Messaging:** Send templated messages to 50-500 contacts at once
- **Bulk Tag Assignment:** Segment customers in seconds vs. minutes
- **Bulk Export:** One-click CSV/Excel for reporting

#### Effort Estimate: 45-55 hours

| Phase | Hours | Deliverables |
|-------|-------|--------------|
| Phase 1: Selection UI | 12h | Multi-select checkboxes, select all, range select |
| Phase 2: Bulk Actions Toolbar | 10h | Floating action bar, confirmation dialogs |
| Phase 3: Bulk Messaging | 15h | Template picker, variable substitution, rate limiting |
| Phase 4: Bulk Tags/Export | 8h | Tag multi-assign, CSV/XLSX generation |
| Testing & Polish | 5h | Edge cases, performance with 1000+ selections |

#### Dependencies on v1.3
- ✅ Uses existing contact list UI (extend with selection state)
- ✅ Leverages dashboard infrastructure for progress indicators
- ⚠️ Needs rate limiting if messaging API has quotas

#### Quick Wins 🎯
- **Multi-select UI** (12h) can ship independently
- **Bulk export** (5h) is trivial and immediately useful

---

### 🥈 #2: Chat Queue Optimization (RECOMMENDED)

**Why Second:** Core agent workflow. Smart features = competitive moat. Builds on live dashboards.

#### Value Proposition
- **Smart Queue Sorting:** VIP first, oldest first, predicted-easy-wins first
- **Response Time Predictions:** ML-based "likely response time" badges
- **Smart Reply Suggestions:** Template recommendations based on message content

#### Effort Estimate: 70-85 hours

| Phase | Hours | Deliverables |
|-------|-------|--------------|
| Phase 1: Queue Sorting | 15h | Segment-based priority, SLA timers, custom sort |
| Phase 2: Response Time UI | 12h | Prediction badges, historical avg display |
| Phase 3: Prediction Engine | 20h | Simple ML model (message length, segment, time-of-day) |
| Phase 4: Smart Replies | 25h | Template matching, keyword extraction, suggestion UI |
| Testing & Tuning | 8h | Model accuracy, UX refinement |

#### Dependencies on v1.3
- ✅ Dashboards provide baseline metrics (avg response time, volume)
- ✅ Chat history data for training simple prediction model
- ⚠️ Smart replies need curated template library

#### Quick Wins 🎯
- **Queue sorting by segment** (8h) is pure UI, instant value
- **Response time badges** (12h) with simple averages (no ML) ships fast

#### Risk Mitigation
Start with rule-based "smart" (keywords → template) before ML. Can iterate toward ML in v1.5.

---

### 🥉 #3: Advanced Analytics (RECOMMENDED)

**Why Third:** Natural v1.3 extension. Reuses dashboard components. Management loves it.

#### Value Proposition
- **Historical Trends:** 7d/30d/90d charts for all key metrics
- **Predictive Insights:** "Expected volume tomorrow", "Likely SLA breach alerts"
- **Comparative Analysis:** This week vs last week, agent vs team average

#### Effort Estimate: 55-70 hours

| Phase | Hours | Deliverables |
|-------|-------|--------------|
| Phase 1: Data Aggregation | 18h | Daily/weekly rollups, caching layer |
| Phase 2: Trend Charts | 15h | Line/area charts, date range picker |
| Phase 3: Comparison Views | 12h | Period-over-period, benchmark overlays |
| Phase 4: Predictive Alerts | 15h | Simple forecasting, threshold alerts |
| Testing & Polish | 5h | Performance, mobile responsiveness |

#### Dependencies on v1.3
- ✅ Dashboard infrastructure (charts, layouts, filters)
- ✅ Real-time data pipeline (extend with historical storage)
- ⚠️ Needs data retention policy (how far back?)

#### Quick Wins 🎯
- **7-day trend charts** (10h) using existing chart components
- **Week-over-week comparison** (8h) with minimal backend work

---

## Features NOT Recommended for v1.4

### ❌ Performance Dashboards
**Defer to v1.5.** Overlaps with Advanced Analytics. Better to ship analytics first, then layer in team/individual views.

### ❌ Team Management
**Defer to v1.6+.** HR-adjacent features (hiring, training, reviews) are high effort, lower CRM ROI. Better suited as separate module.

### ❌ Report Extensions
**Defer to v1.5.** Salesforce/HubSpot integrations require API partnerships and customer demand validation. Custom reports can bundle with Advanced Analytics.

---

## Recommended Implementation Order

```
Week 1-2: Bulk Operations (45-55h)
  └─ Ship quick wins: multi-select, bulk export
  
Week 3-4: Chat Queue Optimization (40h first pass)
  └─ Ship quick wins: segment sorting, response badges
  └─ Defer smart replies ML to Week 5
  
Week 4-5: Advanced Analytics (35h first pass)
  └─ Ship quick wins: 7-day trends, comparisons
  └─ Defer predictive alerts to Week 6

Week 5-6: Polish & Complete
  └─ Smart reply suggestions (rule-based)
  └─ Predictive alerts
  └─ Integration testing
```

---

## Quick Win Summary (Ship in Week 1-2)

| Feature | Hours | Impact |
|---------|-------|--------|
| Multi-select UI | 12h | Foundation for all bulk ops |
| Bulk CSV export | 5h | Instant reporting capability |
| Queue sort by segment | 8h | VIP customers handled first |
| Response time badges | 12h | Agents see urgency at glance |
| 7-day trend charts | 10h | Historical visibility |

**Total Quick Wins:** ~47h for 5 shippable features

---

## Success Metrics for v1.4

| Metric | Target |
|--------|--------|
| Bulk ops time savings | 60% reduction in multi-contact tasks |
| Queue efficiency | 20% faster VIP response times |
| Analytics adoption | 80% of managers viewing trends weekly |
| Agent satisfaction | +15 NPS on workflow tools |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Scope creep on smart replies | Ship rule-based first, ML in v1.5 |
| Bulk messaging abuse | Rate limits + admin controls |
| Analytics performance | Caching + pagination for large datasets |
| Integration complexity | Keep features independent, avoid coupling |

---

## Appendix: Full ROI Analysis

| Feature | Value (1-5) | Effort (1-5) | ROI | Notes |
|---------|-------------|--------------|-----|-------|
| Bulk Operations | 5 | 2 | **2.5** | Every user, every day |
| Chat Queue Opt | 5 | 3 | **1.7** | Core workflow, moat |
| Advanced Analytics | 4 | 3 | **1.3** | Management love, v1.3 leverage |
| Performance Dash | 4 | 3 | 1.3 | Overlaps analytics |
| Report Extensions | 3 | 3 | 1.0 | Enterprise only |
| Team Management | 3 | 5 | 0.6 | Not core CRM |

*ROI = Value / Effort (higher is better)*

---

**Prepared for:** v1.4 Sprint Planning  
**Status:** Ready for review
