# Dashboard v0 — TODO (source of truth)

Rules:
- This file is the primary backlog.
- Jarvis will sync these items into Mission Control (projects + tasks) so you can track status.
- Status keywords used in Mission Control:
  - 📥 Backlog
  - 🚧 In Progress
  - ✅ Done

## 🚧 In Progress
- [ ] Analytics MVP: Admin dashboard (revenue/tips trend, hours worked, top chatters) (priority: High)

## 📥 Backlog
- [ ] Supervisor dashboard page with pending counts (shifts + draft payrolls) (priority: High)
- [ ] Fix + harden `scripts/smoke-test.sh` auth flow (priority: Medium)
- [ ] Add basic task linking: show related tasks on CRM sidebar (priority: Low)

## ✅ Done
- [x] End-to-end workflow: clock-in → shift approval → payroll gen → apply bonuses → approve → mark paid → CSV export
- [x] Role-gated routing for admin/supervisor/chatter areas
- [x] Bonus rules CRUD + toggles + validation
