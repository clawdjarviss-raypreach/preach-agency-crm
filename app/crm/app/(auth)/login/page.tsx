import { redirect } from 'next/navigation';
import { setRole } from '@/lib/auth';

export default function LoginPage() {
  async function login(formData: FormData) {
    'use server';
    const role = String(formData.get('role') || '');
    if (role !== 'admin' && role !== 'supervisor' && role !== 'chatter') return;
    await setRole(role);
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Preach Agency — CRM</h1>
        <p className="mt-1 text-sm text-zinc-600">Dev login (cookie role). Real auth comes later.</p>

        <form action={login} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Role</label>
          <select name="role" className="w-full rounded-md border px-3 py-2">
            <option value="admin">admin</option>
            <option value="supervisor">supervisor</option>
            <option value="chatter">chatter</option>
          </select>
          <button className="w-full rounded-md bg-black px-3 py-2 text-white">Login</button>
        </form>

        <p className="mt-4 text-xs text-zinc-500">Seeded demo users exist in DB; this login is role-only for now.</p>
      </div>
    </div>
  );
}
