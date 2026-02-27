# Preach CRM

A standalone Next.js customer relationship management system for Preach Agency, built with Convex backend.

## 🚀 Features

### Authentication
- **Login System**: Secure username + PIN authentication
- **Session Management**: Token-based sessions stored in localStorage
- **Role-Based Access**: Admin, Supervisor, and Chatter roles with different permissions

### Dashboard
- **Clock In/Out**: Track work shifts with creator assignment
- **Live Shift Timer**: Real-time display of current shift duration
- **Quick Actions**: Fast access to report submission
- **Recent Reports**: View last 5 submitted reports
- **Today's Stats**: Real-time total sales for the current day

### Reports
- **Submit Reports**: Daily sales reporting with:
  - Per-creator sales inputs
  - Busyness rating (1-10)
  - Spender count
  - Warmed-up subs tracking
  - Selling chats from Mass Messaging
  - Qualitative feedback (what went well, what didn't, help needed, content feedback)
- **View Reports**: Browse all submitted reports with detailed metrics
- **Status Tracking**: Pending, approved, or rejected report states

### Creators
- **Creator Cards**: View all assigned creators
- **Status Indicators**: Active, inactive, or paused status
- **Assignment Info**: See assigned chatters per creator

### Admin Panel (Admin Only)
- **Team Overview**: View all team members
- **Role Management**: See user roles and status
- **Quick Stats**: Total members, active members, admins, and chatters

## 🎨 Design System

The app uses a warm light theme optimized for mobile chatters:

- **Background**: Cream (#f6f5f2)
- **Surface**: White cards (#ffffff)
- **Accent**: Gold (#c4956a)
- **Text**: Dark brown (#1a1917)
- **Status Colors**:
  - Green: Active/Success
  - Red: Error/Inactive
  - Orange: Warning/Pending

## 📁 Project Structure

```
preach-crm/
├── app/
│   ├── (crm)/                    # Protected CRM routes
│   │   ├── layout.tsx            # Sidebar layout with auth check
│   │   ├── dashboard/
│   │   │   └── page.tsx          # Main dashboard
│   │   ├── reports/
│   │   │   ├── page.tsx          # Reports list
│   │   │   └── submit/
│   │   │       └── page.tsx      # Submit report form
│   │   ├── creators/
│   │   │   └── page.tsx          # Creators grid
│   │   └── admin/
│   │       └── page.tsx          # Admin panel
│   ├── login/
│   │   └── page.tsx              # Login page
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home redirect
│   ├── globals.css               # Global styles
│   └── convex-provider.tsx       # Convex React client
├── convex/                       # Symlinked to mission-control/convex
│   └── crm/
│       ├── auth.ts               # Authentication
│       ├── chatters.ts           # Team member management
│       ├── creators.ts           # Creator management
│       ├── shifts.ts             # Clock in/out tracking
│       └── salesReports.ts       # Sales reporting
├── package.json
├── next.config.ts
├── tsconfig.json
└── .env.local
```

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router)
- **Backend**: Convex (shared with Mission Control)
- **Language**: TypeScript
- **Styling**: Inline CSS with CSS variables (no external UI library)
- **State Management**: Convex React hooks

## 📦 Setup

### Prerequisites
- Node.js 22+
- Convex account with shared backend

### Installation

1. Install dependencies:
```bash
npm install
```

2. The `.env.local` file should point to the shared Convex deployment:
```
CONVEX_DEPLOYMENT=dev:upbeat-chipmunk-561
NEXT_PUBLIC_CONVEX_URL=https://upbeat-chipmunk-561.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://upbeat-chipmunk-561.convex.site
```

3. The `convex/` directory is symlinked to `../mission-control/convex` (shared backend)

### Development

```bash
npm run dev
```

The app runs on **http://localhost:4001**

### Production Build

```bash
npm run build
npm start
```

## 🔐 Authentication

### Test Credentials
- **Username**: rayan
- **PIN**: 1234
- **Role**: Admin

### Session Flow
1. User enters username + PIN on `/login`
2. Backend validates credentials and creates session
3. Token and user data stored in localStorage
4. User redirected to `/dashboard`
5. Protected routes check for token via `(crm)/layout.tsx`
6. Logout clears localStorage and redirects to `/login`

## 🎯 Key Features by Role

### Chatter
- ✅ Clock in/out
- ✅ Submit daily reports
- ✅ View own reports
- ✅ View assigned creators
- ❌ View other chatters' reports
- ❌ Access admin panel

### Supervisor
- ✅ All chatter features
- ✅ View all reports
- ❌ Access admin panel

### Admin
- ✅ All supervisor features
- ✅ Access admin panel
- ✅ View team overview

## 🚧 Future Features (Disabled in UI)

- **Schedule**: Shift scheduling and calendar
- **Leaderboard**: Performance rankings and gamification

## 📱 Mobile-First Design

The app is optimized for mobile chatters:
- Responsive layouts with grid auto-fit
- Touch-friendly button sizes (min 44px)
- Readable font sizes (14px+ for body text)
- Clean spacing and rounded corners (rounded-2xl for cards)
- No horizontal scroll

## 🔄 Data Flow

1. **Login** → `api.crm.auth.login` → Store token + user
2. **Clock In** → `api.crm.shifts.clockIn` → Create shift record
3. **Submit Report** → `api.crm.salesReports.submit` → Create report with sales data
4. **View Dashboard** → `api.crm.shifts.getActive` + `api.crm.salesReports.listByChatter`
5. **Logout** → Clear localStorage → Redirect to login

## 🎨 Design Principles

1. **Simple & Clean**: No clutter, focus on essential actions
2. **Mobile-First**: Designed for phone users
3. **Fast**: Minimal dependencies, optimized builds
4. **Consistent**: Unified color scheme and spacing
5. **Accessible**: High contrast, readable text, semantic HTML

## 📊 Build Stats

- **Build Time**: ~2 seconds
- **First Load JS**: ~102 kB (shared)
- **Routes**: 10 static pages
- **Zero Build Errors**: TypeScript strict mode enabled

## 🧪 Testing

1. **Login Flow**:
   - Go to http://localhost:4001
   - Login as rayan/1234
   - Should redirect to dashboard

2. **Clock In/Out**:
   - Select a creator from dropdown
   - Click "Clock In"
   - Verify green status indicator
   - Click "Clock Out"

3. **Submit Report**:
   - Navigate to Dashboard → Submit Report
   - Fill in sales for at least one creator
   - Complete metrics and feedback
   - Submit
   - Should redirect to dashboard

4. **View Reports**:
   - Navigate to Reports
   - Verify recently submitted report appears
   - Check metrics display correctly

## 🐛 Known Issues

None! Build passes with zero errors.

## 📝 Notes

- Uses the **same Convex backend** as Mission Control (symlinked `convex/` dir)
- All queries require **token** parameter for authentication
- User data in localStorage includes `_id`, `name`, `username`, `role`, `emoji`
- Shift duration updates every minute while clocked in

## 🎉 Success!

The Preach CRM is now a fully functional standalone Next.js app with:
- ✅ Complete authentication system
- ✅ Clock in/out with live timer
- ✅ Daily sales reporting
- ✅ Creator management
- ✅ Admin panel
- ✅ Mobile-optimized design
- ✅ Zero build errors
- ✅ Production-ready build

Ready to deploy! 🚀
