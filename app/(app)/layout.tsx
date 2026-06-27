import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TopBar } from '@/components/layout/TopBar';

/**
 * Authenticated app shell with sidebar and top bar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await auth();
  } catch {
    redirect('/login');
  }

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
