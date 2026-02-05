import { getRole } from '@/lib/auth';
import SidebarClient from '@/app/components/SidebarClient';

export default async function Sidebar() {
  const role = await getRole();
  return <SidebarClient role={role} />;
}
