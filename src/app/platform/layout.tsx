import { getPlatformSession } from '@/lib/platform-auth';
import { PlatformSidebar } from '@/components/platform/PlatformSidebar';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();

  // Login page doesn't need the sidebar layout
  // The middleware already handles redirects, but we need session for sidebar
  if (!session) {
    // If no session, just render children (login page)
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <PlatformSidebar adminName={session.name} adminEmail={session.email} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
