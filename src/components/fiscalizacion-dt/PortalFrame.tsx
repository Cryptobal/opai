"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROVIDER_DISPLAY_NAME } from "@/lib/app-version";

export function PortalFrame({
  version,
  email,
  children,
}: {
  version: string;
  email?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/fiscalizacion-dt/sesion", { method: "DELETE" });
    router.push("/fiscalizacion-dt");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-ds-surface-1 text-ds-text-1">
      <header className="border-b border-ds-border-subtle bg-ds-surface-2">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-[15px] font-semibold">{PROVIDER_DISPLAY_NAME}</p>
            <p className="text-[12px] text-ds-text-3">Portal de Fiscalización — Dirección del Trabajo · v{version}</p>
          </div>
          {email ? (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ds-text-3">{email}</span>
              <button
                type="button"
                onClick={logout}
                className="ds-tap h-10 min-w-[44px] rounded-lg border border-ds-border-default px-3 text-[13px]"
              >
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="border-t border-ds-border-subtle px-4 py-4 text-center text-[12px] text-ds-text-4">
        <Link href="/" className="underline">
          www.opai.cl
        </Link>
        {" · "}Opai SpA — OPAI v{version}
      </footer>
    </div>
  );
}
