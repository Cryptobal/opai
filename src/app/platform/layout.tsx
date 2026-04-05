import { getPlatformSession } from '@/lib/platform-auth';
import { PlatformSidebar } from '@/components/platform/PlatformSidebar';
import { PlatformThemeForcer } from '@/components/platform/PlatformThemeForcer';

export const dynamic = 'force-dynamic';

/**
 * Platform Admin layout — forces light mode since the app defaults to dark.
 * PlatformThemeForcer removes 'dark' class from <html> while mounted,
 * then restores it on unmount (when navigating away from /platform/).
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();

  // Login page doesn't need the sidebar layout
  if (!session) {
    return (
      <PlatformThemeForcer>
        {children}
      </PlatformThemeForcer>
    );
  }

  return (
    <PlatformThemeForcer>
      <div className="flex h-screen bg-gray-100">
        <PlatformSidebar adminName={session.name} adminEmail={session.email} />
        <main className="flex-1 overflow-y-auto bg-gray-100">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </div>
    </PlatformThemeForcer>
  );
}
