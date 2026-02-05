import Sidebar from '@/app/components/Sidebar';
import { getRole } from '@/lib/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getRole();

  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="mt-4 rounded border bg-yellow-50 p-4 text-sm text-yellow-800">
            Unauthorized.
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
