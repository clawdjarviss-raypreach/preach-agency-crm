import { getRole } from '@/lib/auth';

// V0 mapping: cookie role -> seeded demo user email
export async function getActingUserEmail() {
  const role = await getRole();
  if (!role) return null;
  if (role === 'admin') return 'admin@local.dev';
  if (role === 'supervisor') return 'supervisor@local.dev';
  return 'chatter@local.dev';
}
