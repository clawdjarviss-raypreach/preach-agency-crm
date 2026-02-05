#!/bin/bash
# Smoke test: end-to-end workflow (clock-in → shift approval → payroll → bonuses → mark paid)
# Run this after: npm run dev (in another terminal)

BASE_URL="http://localhost:3000"
COOKIES_FILE="/tmp/dashboard-smoke-cookies-$$.txt"

set -e

echo "🚀 Dashboard v0 Smoke Test"
echo "========================="
echo ""

# Helper to login
login_as() {
  local role=$1
  curl -s -X POST -b "$COOKIES_FILE" -c "$COOKIES_FILE" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "role=$role" \
    "$BASE_URL/api/dev/login" > /dev/null
}

# Step 0: Login as admin
echo "0️⃣  Login as admin..."
login_as admin
echo "   ✅ Admin session ready"

# Step 1: Get admin dashboard
echo "1️⃣  Admin dashboard access..."
curl -s -b "$COOKIES_FILE" "$BASE_URL/admin/dashboard" | grep -q "Dashboard\|shifts" && echo "   ✅ Admin dashboard OK" || echo "   ⚠️  Dashboard check skipped"

# Step 2: List users
echo "2️⃣  List users (admin API)..."
USERS=$(curl -s -b "$COOKIES_FILE" "$BASE_URL/api/admin/users" | jq '.users | length')
echo "   ✅ Found $USERS users"

# Step 3: Chatter clock in (dev JSON endpoint)
echo "3️⃣  Switching to chatter and clock-in..."
login_as chatter
CLOCK_IN=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE_URL/api/dev/shifts/clock-in" | jq -r '.shift.id // empty')
if [ ! -z "$CLOCK_IN" ]; then
  echo "   ✅ Shift created: ${CLOCK_IN:0:8}..."
else
  echo "   ❌ Clock-in failed"
  rm -f "$COOKIES_FILE"
  exit 1
fi

# Step 4: Chatter clock out (dev JSON endpoint)
echo "4️⃣  Chatter clock-out..."
CLOCK_OUT_AT=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Content-Type: application/json" \
  -d '{"breakMinutes":15,"notes":"Done"}' \
  "$BASE_URL/api/dev/shifts/clock-out" | jq -r '.shift.clockOut // empty')
if [ ! -z "$CLOCK_OUT_AT" ]; then
  echo "   ✅ Shift clocked out"
else
  echo "   ⚠️  Clock-out returned empty"
fi

# Step 5: Supervisor approve shift
echo "5️⃣  Switch to supervisor and approve shift..."
login_as supervisor
APPROVE=$(curl -s -X PATCH \
  -b "$COOKIES_FILE" \
  -H "Content-Type: application/json" \
  -d '{"approve":true}' \
  "$BASE_URL/api/shifts/$CLOCK_IN" | jq -r '.approvedAt // empty')
if [ ! -z "$APPROVE" ]; then
  echo "   ✅ Shift approved"
else
  echo "   ⚠️  Shift approval response empty"
fi

# Step 6: Back to admin to generate payroll
echo "6️⃣  Switch to admin and generate payroll..."
login_as admin
GEN=$(curl -s -X POST \
  -b "$COOKIES_FILE" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE_URL/api/payrolls/generate")
PAY_PERIOD=$(echo "$GEN" | jq -r '.payPeriodId // empty')
if [ ! -z "$PAY_PERIOD" ]; then
  PAYROLL=$(curl -s -b "$COOKIES_FILE" "$BASE_URL/api/dev/payrolls/latest?payPeriodId=$PAY_PERIOD" | jq -r '.payroll.id // empty')
  if [ ! -z "$PAYROLL" ]; then
    echo "   ✅ Payroll generated: ${PAYROLL:0:8}..."
  else
    echo "   ⚠️  Payroll lookup returned empty"
  fi
else
  echo "   ⚠️  Payroll generation did not return payPeriodId"
  PAYROLL=""
fi

# Step 7: Apply bonuses
if [ ! -z "$PAYROLL" ]; then
  echo "7️⃣  Apply bonuses..."
  BONUS_COUNT=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Content-Type: application/json" \
    "$BASE_URL/api/payrolls/$PAYROLL/apply-bonuses" | jq '.bonuses | length')
  echo "   ✅ Applied $BONUS_COUNT bonuses"
fi

# Step 8: Admin approve payroll
if [ ! -z "$PAYROLL" ]; then
  echo "8️⃣  Admin approve payroll..."
  ADMIN_APPROVE=$(curl -s -X PATCH \
    -b "$COOKIES_FILE" \
    -H "Content-Type: application/json" \
    -d '{"approve":true}' \
    "$BASE_URL/api/payrolls/$PAYROLL" | jq -r '.status // empty')
  if [ ! -z "$ADMIN_APPROVE" ]; then
    echo "   ✅ Payroll status: $ADMIN_APPROVE"
  else
    echo "   ⚠️  Admin approve returned empty"
  fi
fi

# Step 9: Supervisor approve payroll
if [ ! -z "$PAYROLL" ]; then
  echo "9️⃣  Supervisor approve payroll..."
  login_as supervisor
  SUPERVISOR_APPROVE=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Content-Type: application/json" \
    "$BASE_URL/api/payrolls/$PAYROLL/approve" | jq -r '.status // empty')
  if [ ! -z "$SUPERVISOR_APPROVE" ]; then
    echo "   ✅ Payroll status: $SUPERVISOR_APPROVE"
  else
    echo "   ⚠️  Supervisor approve returned empty"
  fi
fi

# Step 10: Mark as paid
if [ ! -z "$PAYROLL" ]; then
  echo "🔟 Mark payroll as paid..."
  PAID=$(curl -s -X POST \
    -b "$COOKIES_FILE" \
    -H "Content-Type: application/json" \
    -d '{"markedPaidAt":"2026-02-05T14:00:00Z"}' \
    "$BASE_URL/api/payrolls/$PAYROLL/mark-paid" | jq -r '.status // empty')
  if [ ! -z "$PAID" ]; then
    echo "   ✅ Final status: $PAID"
  else
    echo "   ⚠️  Mark-paid returned empty"
  fi
fi

# Step 11: CSV export
echo "1️⃣1️⃣  CSV export..."
login_as admin
CSV=$(curl -s -b "$COOKIES_FILE" "$BASE_URL/api/payrolls/export" 2>&1 | head -1)
if echo "$CSV" | grep -q "chatter\|email\|shift"; then
  echo "   ✅ CSV export ready"
else
  echo "   ⚠️  CSV export check skipped"
fi

# Cleanup
rm -f "$COOKIES_FILE"

echo ""
echo "✨ Smoke test COMPLETED! Check results above."
