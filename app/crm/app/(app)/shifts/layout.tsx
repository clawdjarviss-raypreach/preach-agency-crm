import { auth } from '@/lib/auth';
import { ReactNode } from 'react';

export default async function ShiftsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await auth();

  if (!user || user.role !== 'chatter') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 max-w-md">
          <h1 className="text-lg font-semibold text-red-900">Unauthorized</h1>
          <p className="mt-2 text-sm text-red-700">
            Only chatters can access their shift history.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
