# Preach Agency — CRM (Dashboard v0)

A complete OnlyFans agency CRM system for shift tracking, payroll calculation, bonus management, and KPI tracking.

## Features

- **Role-based access**: Admin, Supervisor, Chatter (creator/content team member)
- **Shift management**: Clock in/out with break tracking, supervisor approval, admin override
- **Payroll system**: Draft → Approved → Paid workflow with bonus rule application
- **Bonus rules**: Percentage-based, flat-amount, and milestone-based bonuses
- **KPI snapshots**: Revenue, message count, and team performance tracking
- **CSV export**: Payroll data export for accounting/external systems
- **End-to-end workflows**: From clock-in → shift approval → payroll generation → bonuses → payroll approval → mark paid

## Tech Stack

- **Framework**: Next.js 16 (Turbopack)
- **Database**: SQLite with Prisma ORM
- **Styling**: Tailwind CSS + Geist UI
- **Auth**: Dev-only cookie-based role selection (upgrade to real auth as needed)

## Getting Started

### Prerequisites
- Node.js 22+
- npm (or pnpm/yarn)

### Installation

```bash
cd app/crm
npm install
```

### Database Setup

```bash
# Run migrations and seed demo data
npx prisma migrate dev
node prisma/seed.js
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login) and select a role:
- **admin** → Full system access (users, creators, payroll, approvals)
- **supervisor** → Team oversight (shift approvals, payroll reviews)
- **chatter** → Shift logging (clock in/out, KPI entry)

Demo credentials:
```
Email: admin@local.dev / supervisor@local.dev / chatter2@local.dev
Password: admin1234 (dev-only, not real)
```

### Build

```bash
npm run build
npm run start
```

### Linting

```bash
npm run lint
```

## Project Structure

```
dashboard-v0/
├── PLAN.md                          # Original requirements & design doc
├── PROGRESS.md                      # Continuous build log & feature tracking
└── app/crm/                         # Next.js application
    ├── app/                         # App router
    │   ├── (app)/                   # Authenticated routes
    │   │   ├── admin/               # Admin dashboard & management
    │   │   ├── supervisor/          # Supervisor workflows
    │   │   └── shifts/              # Chatter shift logging
    │   ├── (auth)/login/            # Login page
    │   ├── api/                     # API routes
    │   └── layout.tsx               # Root layout with sidebar
    ├── lib/                         # Utilities (auth, prisma client)
    ├── prisma/
    │   ├── schema.prisma            # Database schema
    │   ├── migrations/              # Schema migrations
    │   └── seed.js                  # Demo data seeding
    ├── package.json
    ├── tsconfig.json
    └── next.config.ts
```

## API Routes

### Shifts
- `POST /api/shifts/clock-in` — Start a shift
- `POST /api/shifts/clock-out` — End a shift
- `POST /api/shifts/[id]/approve` — Supervisor approves shift
- `POST /api/shifts/[id]/deny` — Supervisor denies shift
- `PATCH /api/shifts/[id]` — Admin edits/approves shifts

### Payroll
- `POST /api/payrolls/generate` — Generate payroll from approved shifts
- `POST /api/payrolls/[id]/apply-bonuses` — Apply bonus rules
- `PATCH /api/payrolls/[id]` — Admin approves/unapproves
- `POST /api/payrolls/[id]/approve` — Supervisor approves
- `POST /api/payrolls/[id]/mark-paid` — Mark payroll as paid
- `GET /api/payrolls/export` — CSV export

### Bonus Rules
- `POST /api/bonus-rules` — Create rule
- `PUT /api/bonus-rules/[id]` — Update rule
- `DELETE /api/bonus-rules/[id]` — Delete rule

### Admin
- `POST /api/admin/users` — Create user
- `PATCH /api/admin/users/[id]` — Edit user
- `POST /api/admin/creators` — Create creator
- `PATCH /api/creators/[id]` — Edit creator
- `POST /api/admin/assignments` — Assign chatter to creator
- `DELETE /api/assignments/[id]` — Unassign chatter
- `POST /api/admin/kpi-snapshots` — Log KPI data

## Database Schema (Prisma)

See `app/crm/prisma/schema.prisma` for full schema. Key models:

- **User** — Admin, Supervisor, Chatter roles
- **Shift** — Clock-in/out records with approval tracking
- **Payroll** — Aggregated payment records (draft → approved → paid)
- **Bonus** — Individual bonus records tied to payroll + bonus rules
- **BonusRule** — Reusable bonus templates (percentage, flat, milestone)
- **ChatterCreator** — Many-to-many assignment + primary flag
- **KpiSnapshot** — Historical KPI data per chatter/creator
- **PayPeriod** — Billing period tracking

## Workflow Example

1. **Chatter clocks in** → `POST /api/shifts/clock-in`
2. **Supervisor reviews** → visits `/supervisor/shifts`, approves pending shifts
3. **Admin generates payroll** → visits `/admin/payrolls`, clicks "Generate", selects pay period
4. **Admin applies bonuses** → clicks "Apply Bonuses" on payroll row
5. **Supervisor approves** → visits `/supervisor/payrolls`, approves the payroll record
6. **Admin marks paid** → supervisor clicks "Mark as Paid"
7. **Export for accounting** → click "Export CSV"

## Development Notes

- **Server components** fetch data asynchronously; client components handle interactivity
- **Params as Promise**: All `[id]` routes use `params: Promise<{id}>` (Next.js 16 requirement)
- **Money storage**: All monetary values stored in **cents** (multiply by 100)
- **Time storage**: Break/shift durations stored in **minutes**
- **Currency**: USD formatting throughout UI
- **Soft deletes**: Assignments use `unassignedAt` timestamp rather than hard delete (preserves history)

## To-Do / Future

- [ ] Real authentication (OAuth2, email verification)
- [ ] Email/Slack notifications on payroll approvals
- [ ] Advanced analytics dashboard (revenue trends, team performance)
- [ ] Audit logging for compliance
- [ ] Timezone handling for international teams
- [ ] Mobile app or PWA
- [ ] Integration with payment processors (Stripe, wise, etc.)

## License

Proprietary — OnlyFans Agency Operations

## Support

Questions? Check `PLAN.md` for design rationale or `PROGRESS.md` for recent updates.
