/**
 * Landing pública tokenizada de cobro: /cobro/[token]  (sin login).
 *
 * Server component: resuelve la vista por token (dispara SENT → VIEWED),
 * fuerza noindex y maneja los enlaces inválidos / vencidos con una página
 * amable. Los estados interactivos viven en CobroClient.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPublicCobroView } from "@/modules/finance/billing/cobro-confirmation.service";
import CobroClient from "./CobroClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmación de documento",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

function AmablePage({ title, body, email }: { title: string; body: string; email?: string }) {
  return (
    <main className="min-h-[100svh] bg-ds-surface-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-ds-lg border border-ds-border-default bg-ds-surface-2 p-6 sm:p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-ds-text-1">{title}</h1>
        <p className="mt-2 text-sm text-ds-text-2 leading-relaxed">{body}</p>
        {email ? (
          <p className="mt-4 text-sm text-ds-text-2">
            Escríbenos a{" "}
            <a href={`mailto:${email}`} className="font-medium underline text-ds-text-1">
              {email}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default async function CobroPage({ params }: PageProps) {
  const { token } = await params;
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent") || null;

  const view = await getPublicCobroView(token, { ip, ua });

  if (!view) {
    return (
      <AmablePage
        title="Enlace no válido"
        body="Este enlace no corresponde a ningún documento. Puede que se haya copiado incompleto."
      />
    );
  }
  if (view.expired) {
    return (
      <AmablePage
        title="Enlace vencido"
        body="Este enlace de confirmación ya no está disponible (válido por 90 días)."
        email={view.branding.emailContact || undefined}
      />
    );
  }

  return <CobroClient token={token} initialView={view} />;
}
