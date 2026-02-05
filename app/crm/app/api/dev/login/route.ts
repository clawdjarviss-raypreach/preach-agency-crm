import { NextResponse } from 'next/server';

// Dev-only login endpoint for scripts/tools.
// Rationale: Next.js Server Actions (used by /login page) are not convenient to call via curl.
// This route sets the same role cookie used by middleware + API authorization.

type Role = 'admin' | 'supervisor' | 'chatter';
const COOKIE = 'mc_role';

function parseRole(role: unknown): Role | null {
  if (role === 'admin' || role === 'supervisor' || role === 'chatter') return role;
  return null;
}

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const contentType = req.headers.get('content-type') || '';

    let roleRaw: unknown = null;
    if (contentType.includes('application/json')) {
      const body = await req.json();
      roleRaw = body?.role;
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      roleRaw = form.get('role');
    }

    const role = parseRole(roleRaw);
    if (!role) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true, role });
    res.cookies.set(COOKIE, role, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });

    return res;
  } catch (error) {
    console.error('Dev login failed:', error);
    return NextResponse.json({ error: 'Dev login failed' }, { status: 500 });
  }
}
