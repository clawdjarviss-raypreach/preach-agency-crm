import { cookies } from 'next/headers';

export type SessionRole = 'admin' | 'supervisor' | 'chatter';
const COOKIE = 'mc_role';

export async function getRole(): Promise<SessionRole | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (v === 'admin' || v === 'supervisor' || v === 'chatter') return v;
  return null;
}

export async function setRole(role: SessionRole) {
  const jar = await cookies();
  jar.set(COOKIE, role, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
}

export async function clearRole() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
