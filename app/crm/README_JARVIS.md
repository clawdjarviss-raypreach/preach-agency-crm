# Dashboard v0 CRM (WIP)

This folder is the beginning of the internal CRM described in `../PLAN.md`.

## What exists now
- Next.js app scaffold (App Router + Tailwind)
- Prisma + SQLite schema + first migration applied (`prisma/migrations/*`)
- Core tables for Users, Creators, Assignments, Shifts, Payroll, Bonus rules, KPI snapshots, Sync logs

## Run locally
```bash
cd projects/dashboard-v0/app/crm
npm run dev
```

## Next build steps (queued)
1) Add seed script (admin user + sample creator + sample chatter)
2) Add minimal auth placeholder (dev-only login) + role gating middleware
3) Build CRUD pages: Users (admin), Creators (admin), Assignments (admin), Shifts (chatter + supervisor approve)
4) Add Sync Logs page + stub ingestion job runner

## Money storage convention
All money is stored as **integer cents** (sqlite-safe).
All time worked is stored as **minutes**.
