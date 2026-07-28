"use client";

import Link from "next/link";
import { CalendarDays, ExternalLink } from "lucide-react";
import type { CreateCrmStructureResult } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  result: CreateCrmStructureResult;
};

export function CorreoAiResultList({ result }: Props) {
  return (
    <div className="ds-page-enter space-y-3">
      <p className="text-[13px] text-status-ok-fg">{result.note ?? "Creado correctamente."}</p>
      <ul className="space-y-2">
        {result.accountUrl && <ResultLink href={result.accountUrl} label="Cuenta" />}
        {result.contactUrl && <ResultLink href={result.contactUrl} label="Contacto" />}
        {result.dealUrl && <ResultLink href={result.dealUrl} label="Negocio" />}
        {result.installations?.map((i) => (
          <ResultLink key={i.id} href={i.url} label={i.name} />
        ))}
        {result.agendaSync && (
          <li className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5">
            <div className="flex items-start gap-2 text-[13px] text-ds-text-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-tint-violet-fg" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-ds-text-1">Plazo en agenda</p>
                <p className="text-[12px] text-ds-text-3">
                  {result.agendaSync.ok
                    ? "Sincronizado automáticamente con el calendario (banda hasta la entrega)."
                    : result.agendaSync.skippedReason === "fecha_pasada"
                      ? "No se sincronizó: la fecha límite ya pasó."
                      : result.agendaSync.skippedReason === "sin_fecha"
                        ? "No se sincronizó: falta fecha límite."
                        : "El sync a agenda no completó; revisá el negocio."}
                </p>
                {result.dealUrl && result.agendaSync.ok && (
                  <Link
                    href="/agenda"
                    className="inline-flex min-h-10 items-center gap-1 text-[13px] text-primary ds-tap"
                  >
                    Abrir agenda <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </li>
        )}
      </ul>
    </div>
  );
}

function ResultLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-primary ds-tap"
      >
        {label} <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}
