import type { Metadata } from "next";
import { getPlatformSession } from "@/lib/platform-auth";
import { parsePlatformRole } from "@/lib/platform/roles";
import { PlatformSidebar } from "@/components/platform/PlatformSidebar";
import { PlatformUiProvider } from "@/components/platform/PlatformUiProvider";
import { PlatformDarkLock } from "@/components/platform/PlatformDarkLock";
import { CreateTenantSheet } from "@/components/platform/CreateTenantSheet";
import { Toaster } from "@/components/ui/toaster";
import { UndoSnackbarHost } from "@/components/opai-ds";

export const metadata: Metadata = {
  title: "OPAI Platform",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();

  if (!session) {
    return (
      <div className="dark min-h-dvh bg-ds-surface-0 text-ds-text-1">
        <PlatformDarkLock />
        {children}
        <Toaster />
      </div>
    );
  }

  const role = parsePlatformRole(session.role);

  return (
    <div className="dark h-dvh bg-ds-surface-0 text-ds-text-1">
      <PlatformDarkLock />
      <PlatformUiProvider role={role} adminName={session.name} adminEmail={session.email}>
        <div className="flex h-dvh">
          <PlatformSidebar />
          <main className="min-w-0 flex-1 overflow-y-auto pt-14 lg:pt-0">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
          </main>
        </div>
        <CreateTenantSheet />
        <UndoSnackbarHost />
        <Toaster />
      </PlatformUiProvider>
    </div>
  );
}
