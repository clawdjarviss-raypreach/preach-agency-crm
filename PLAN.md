# Dashboard v0 — Internal CRM Plan

**Created:** 2026-02-04  
**Status:** Planning  
**Purpose:** Manage chatters, creators, shifts, payrolls, bonuses, and KPIs for agency operations

---

## 1. Product Spec (Bullets)

### Vision
Internal tool to track chatter performance, manage shifts, calculate payroll/bonuses, and surface KPIs — replacing spreadsheets and manual CreatorHero lookups.

### Core Capabilities
- **Chatter Management:** Onboard, track activity, assign to creators
- **Creator Management:** Track creator accounts, link to chatters, store platform credentials/metadata
- **Shift Tracking:** Clock in/out, shift duration, break time, overtime
- **Payroll Calculation:** Base pay + performance bonuses, per pay period
- **Bonus System:** Configurable rules (% of revenue, flat bonuses, milestones)
- **KPI Dashboard:** Revenue per chatter, response time, conversion rate, hours worked
- **Data Ingestion:** Pull stats from CreatorHero (scraping) → OnlyMonster API (future)

### Non-Goals (v0)
- Public-facing creator portal
- Real-time chat monitoring
- Mobile app
- Multi-agency/white-label

---

## 2. Permissions Matrix

| Action                        | Chatter | Supervisor | Admin |
|-------------------------------|:-------:|:----------:|:-----:|
| View own profile              | ✅      | ✅         | ✅    |
| View own shifts               | ✅      | ✅         | ✅    |
| View own KPIs                 | ✅      | ✅         | ✅    |
| View own payroll              | ✅      | ✅         | ✅    |
| Clock in/out                  | ✅      | ✅         | ✅    |
| View team chatters            | ❌      | ✅         | ✅    |
| View team KPIs                | ❌      | ✅         | ✅    |
| Edit shifts (own team)        | ❌      | ✅         | ✅    |
| Approve payroll (own team)    | ❌      | ✅         | ✅    |
| View all chatters             | ❌      | ❌         | ✅    |
| View all creators             | ❌      | ❌         | ✅    |
| View all payrolls             | ❌      | ❌         | ✅    |
| Manage users (CRUD)           | ❌      | ❌         | ✅    |
| Manage creators (CRUD)        | ❌      | ❌         | ✅    |
| Configure bonus rules         | ❌      | ❌         | ✅    |
| Trigger data sync             | ❌      | ❌         | ✅    |
| View system logs              | ❌      | ❌         | ✅    |

### Role Hierarchy
```
Admin (full access)
  └── Supervisor (team-scoped)
        └── Chatter (self-scoped)
```

---

## 3. Data Model / Schema

### Core Tables

```sql
-- Users (chatters, supervisors, admins)
users (
  id              UUID PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  role            ENUM('chatter', 'supervisor', 'admin') NOT NULL,
  supervisor_id   UUID REFERENCES users(id),  -- NULL for admins/top supervisors
  hourly_rate     DECIMAL(10,2),
  status          ENUM('active', 'inactive', 'onboarding') DEFAULT 'active',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Creators (OnlyFans/Fansly accounts managed)
creators (
  id              UUID PRIMARY KEY,
  platform        ENUM('onlyfans', 'fansly', 'other') NOT NULL,
  username        VARCHAR(255) NOT NULL,
  display_name    VARCHAR(255),
  platform_id     VARCHAR(255),  -- external ID from platform
  status          ENUM('active', 'paused', 'churned') DEFAULT 'active',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform, username)
);

-- Chatter-Creator assignments (many-to-many)
chatter_creators (
  id              UUID PRIMARY KEY,
  chatter_id      UUID REFERENCES users(id) NOT NULL,
  creator_id      UUID REFERENCES creators(id) NOT NULL,
  assigned_at     TIMESTAMP DEFAULT NOW(),
  unassigned_at   TIMESTAMP,  -- NULL if still active
  is_primary      BOOLEAN DEFAULT false,
  UNIQUE(chatter_id, creator_id, assigned_at)
);

-- Shifts
shifts (
  id              UUID PRIMARY KEY,
  chatter_id      UUID REFERENCES users(id) NOT NULL,
  clock_in        TIMESTAMP NOT NULL,
  clock_out       TIMESTAMP,  -- NULL if still clocked in
  break_minutes   INT DEFAULT 0,
  notes           TEXT,
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Pay Periods
pay_periods (
  id              UUID PRIMARY KEY,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          ENUM('open', 'calculating', 'review', 'approved', 'paid') DEFAULT 'open',
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Payrolls (one per chatter per pay period)
payrolls (
  id              UUID PRIMARY KEY,
  chatter_id      UUID REFERENCES users(id) NOT NULL,
  pay_period_id   UUID REFERENCES pay_periods(id) NOT NULL,
  hours_worked    DECIMAL(10,2) NOT NULL,
  base_pay        DECIMAL(10,2) NOT NULL,
  bonus_total     DECIMAL(10,2) DEFAULT 0,
  deductions      DECIMAL(10,2) DEFAULT 0,
  net_pay         DECIMAL(10,2) NOT NULL,
  status          ENUM('draft', 'approved', 'paid') DEFAULT 'draft',
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMP,
  UNIQUE(chatter_id, pay_period_id)
);

-- Bonuses (individual bonus line items)
bonuses (
  id              UUID PRIMARY KEY,
  payroll_id      UUID REFERENCES payrolls(id) NOT NULL,
  bonus_rule_id   UUID REFERENCES bonus_rules(id),
  description     VARCHAR(255) NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Bonus Rules (configurable)
bonus_rules (
  id              UUID PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  type            ENUM('percentage', 'flat', 'milestone') NOT NULL,
  threshold       DECIMAL(10,2),  -- e.g., revenue threshold for milestone
  percentage      DECIMAL(5,2),   -- e.g., 5.00 = 5%
  flat_amount     DECIMAL(10,2),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- KPI Snapshots (daily metrics per chatter-creator pair)
kpi_snapshots (
  id              UUID PRIMARY KEY,
  chatter_id      UUID REFERENCES users(id) NOT NULL,
  creator_id      UUID REFERENCES creators(id) NOT NULL,
  snapshot_date   DATE NOT NULL,
  revenue         DECIMAL(12,2),
  messages_sent   INT,
  messages_received INT,
  tips_received   DECIMAL(12,2),
  ppv_revenue     DECIMAL(12,2),
  subs_renewed    INT,
  new_subs        INT,
  avg_response_time_sec INT,
  source          ENUM('creatorhero_scrape', 'onlymonster_api', 'manual') NOT NULL,
  raw_data        JSONB,  -- store original payload for debugging
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(chatter_id, creator_id, snapshot_date)
);

-- Sync Logs (track ingestion runs)
sync_logs (
  id              UUID PRIMARY KEY,
  source          VARCHAR(50) NOT NULL,
  started_at      TIMESTAMP NOT NULL,
  completed_at    TIMESTAMP,
  status          ENUM('running', 'success', 'partial', 'failed') NOT NULL,
  records_fetched INT,
  records_inserted INT,
  errors          JSONB,
  triggered_by    UUID REFERENCES users(id)
);
```

### Indexes (Key)
```sql
CREATE INDEX idx_shifts_chatter_date ON shifts(chatter_id, clock_in);
CREATE INDEX idx_kpi_chatter_date ON kpi_snapshots(chatter_id, snapshot_date);
CREATE INDEX idx_kpi_creator_date ON kpi_snapshots(creator_id, snapshot_date);
CREATE INDEX idx_payrolls_period ON payrolls(pay_period_id);
```

---

## 4. MVP Pages

### Authentication
1. **Login** — Email/password, role-based redirect

### Chatter Views
2. **My Dashboard** — Today's shift status, week's hours, current KPIs
3. **My Shifts** — Calendar view of past/upcoming shifts, clock in/out button
4. **My KPIs** — Performance charts (revenue, messages, response time)
5. **My Payroll** — Pay stubs, bonus breakdown

### Supervisor Views
6. **Team Dashboard** — Aggregate KPIs for supervised chatters
7. **Team Shifts** — Approve/edit shifts, view coverage gaps
8. **Team Payroll** — Review and approve payroll for team

### Admin Views
9. **All Chatters** — List, search, filter, CRUD
10. **All Creators** — List, CRUD, view assigned chatters
11. **Assignments** — Manage chatter↔creator mappings
12. **Payroll Admin** — Create pay periods, bulk approve, export
13. **Bonus Rules** — Configure bonus formulas
14. **Data Sync** — Trigger sync, view logs, error details
15. **Settings** — System config, audit log

### MVP = 10 pages
**Phase 1 (MVP):** 1, 2, 3, 5, 9, 10, 11, 14  
**Phase 2:** 4, 6, 7, 8, 12, 13, 15

---

## 5. Ingestion Pipeline Plan

### Phase 1: CreatorHero Scraping

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Scheduler  │────▶│  Puppeteer   │────▶│  Parser     │────▶│  DB      │
│  (cron)     │     │  + Stealth   │     │  + Validator│     │  Insert  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
      │                    │                    │                  │
      ▼                    ▼                    ▼                  ▼
   4am daily         Login, navigate       Extract JSON,      Upsert to
                     to stats pages        map to schema      kpi_snapshots
```

**Tech Stack:**
- Puppeteer + puppeteer-extra-plugin-stealth
- Residential proxy rotation (if blocked)
- Queue system (BullMQ) for retry logic
- Store cookies/session in encrypted vault

**Data Points to Scrape:**
- Daily revenue (total, tips, PPV, subscriptions)
- Message counts (sent/received)
- New/renewed subscribers
- Response time metrics (if available)

**Error Handling:**
- Retry 3x with exponential backoff
- Alert on consecutive failures (Slack/Discord webhook)
- Fallback to manual entry UI

### Phase 2: OnlyMonster API

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Scheduler  │────▶│  HTTP Client │────▶│  Transform  │────▶ DB
│  (cron)     │     │  + API Key   │     │  + Validate │
└─────────────┘     └──────────────┘     └─────────────┘
```

**Benefits:**
- No stealth/proxy needed
- Structured JSON response
- Rate limits documented
- Real-time webhooks (if supported)

**Migration Path:**
1. Implement API client alongside scraper
2. Run both in parallel for 2 weeks (data reconciliation)
3. Deprecate scraper once API coverage confirmed
4. Keep `source` field to track data origin

---

## 6. Build Sequence (7-Day Increments)

### Week 1: Foundation
| Day | Task |
|-----|------|
| 1-2 | Project setup: Next.js 14, Postgres, Prisma, Auth.js |
| 3   | DB schema + migrations + seed data |
| 4   | Auth flow: login, logout, session, role middleware |
| 5   | Basic layout: sidebar, header, role-based nav |
| 6   | Users CRUD (admin only) |
| 7   | Buffer/testing/deployment to staging |

**Deliverable:** Authenticated shell with user management

### Week 2: Core Entities
| Day | Task |
|-----|------|
| 1-2 | Creators CRUD + list/detail pages |
| 3-4 | Chatter↔Creator assignments UI |
| 5   | Shifts table + clock in/out API |
| 6   | My Shifts page (calendar view) |
| 7   | Buffer/testing |

**Deliverable:** Can manage creators, assignments, and track shifts

### Week 3: Data Ingestion
| Day | Task |
|-----|------|
| 1-2 | CreatorHero scraper (auth + navigation) |
| 3   | Scraper data extraction + parsing |
| 4   | kpi_snapshots upsert logic + sync_logs |
| 5   | Admin Data Sync page (trigger + logs) |
| 6   | Error handling + retry queue |
| 7   | Buffer/monitoring setup |

**Deliverable:** Automated daily KPI ingestion from CreatorHero

### Week 4: KPIs & Dashboard
| Day | Task |
|-----|------|
| 1-2 | My Dashboard page (chatter view) |
| 3   | My KPIs page (charts: Recharts/Tremor) |
| 4   | Team Dashboard (supervisor view) |
| 5   | KPI aggregation queries + caching |
| 6-7 | Polish + performance optimization |

**Deliverable:** Functional dashboards with real data

### Week 5: Payroll & Bonuses
| Day | Task |
|-----|------|
| 1   | Pay periods CRUD |
| 2   | Payroll calculation engine |
| 3   | Bonus rules config UI |
| 4   | Bonus application logic |
| 5   | My Payroll page (chatter view) |
| 6   | Team/Admin payroll approval flow |
| 7   | Export to CSV/PDF |

**Deliverable:** End-to-end payroll workflow

### Week 6: Polish & Edge Cases
| Day | Task |
|-----|------|
| 1-2 | Audit logging |
| 3   | Bulk operations (import/export) |
| 4   | Notifications (email/in-app) |
| 5   | Mobile responsiveness |
| 6   | Error states + empty states |
| 7   | Security audit + pen testing basics |

**Deliverable:** Production-ready polish

### Week 7: Launch Prep
| Day | Task |
|-----|------|
| 1-2 | Documentation (user guide, API docs) |
| 3   | Staging → Production deploy |
| 4   | Data migration (if any legacy data) |
| 5   | User onboarding sessions |
| 6-7 | Monitor + hotfix buffer |

**Deliverable:** Live system with users onboarded

---

## 7. Risks & Edge Cases

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| CreatorHero blocks scraper | High | Proxy rotation, stealth plugins, fallback to manual entry |
| CreatorHero changes DOM | Medium | Selector abstraction layer, alerts on parse failures |
| OnlyMonster API delayed | Medium | Scraper remains primary; API is additive |
| Data discrepancies between sources | Medium | Reconciliation reports, source field tracking |
| High DB load from KPI queries | Low | Materialized views, Redis caching |

### Business Logic Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Chatter works for multiple creators same day | Aggregate KPIs per creator, split shift time if needed |
| Chatter changes supervisor mid-pay-period | Use supervisor_id at payroll generation time |
| Shift spans midnight | Store as single shift; date = clock_in date |
| Clock in without clock out | Alert after 12h; supervisor can manually close |
| Negative bonus (clawback) | Allow negative bonus amounts; require admin approval |
| Creator removed while chatters assigned | Soft delete; preserve historical data |
| Duplicate KPI snapshot (re-scrape same day) | Upsert by (chatter_id, creator_id, snapshot_date) |
| Payroll already approved, then shift edited | Lock shifts once payroll approved; require re-approval |
| Timezone differences | Store all timestamps UTC; display in user's local TZ |

### Security Considerations

| Concern | Mitigation |
|---------|------------|
| Credential storage (CreatorHero login) | Encrypt at rest (AES-256), limited access |
| Role escalation | Server-side role checks on every mutation |
| Payroll data exposure | Row-level security; audit all access |
| CSRF/XSS | Next.js defaults + CSP headers |
| Brute force login | Rate limiting + lockout after 5 failures |

### Operational Risks

| Risk | Mitigation |
|------|------------|
| Single point of failure (scraper) | Manual entry fallback; alert on failures |
| Data loss | Daily backups; point-in-time recovery |
| Compliance (payroll records) | 7-year retention policy; immutable audit log |

---

## Next Steps

1. **Confirm tech stack** — Next.js 14 + Postgres + Prisma + Auth.js (or alternatives?)
2. **Set up repo** — Monorepo? Separate frontend/backend?
3. **Provision infra** — Vercel/Railway/self-hosted?
4. **Get CreatorHero credentials** — For scraper development
5. **Define pay period schedule** — Weekly? Bi-weekly? Monthly?

---

*Plan authored by Claude • Last updated: 2026-02-04*
