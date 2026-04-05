import { getPlatformSession } from '@/lib/platform-auth';
import { PlatformSidebar } from '@/components/platform/PlatformSidebar';
import { PlatformThemeForcer } from '@/components/platform/PlatformThemeForcer';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();

  if (!session) {
    return (
      <PlatformThemeForcer>
        {children}
      </PlatformThemeForcer>
    );
  }

  return (
    <PlatformThemeForcer>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
        <PlatformSidebar adminName={session.name} adminEmail={session.email} />
        {/* pt-14 on mobile for the fixed top bar, lg:pt-0 on desktop */}
        <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>
    </PlatformThemeForcer>
  );
}
