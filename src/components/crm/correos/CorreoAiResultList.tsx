"use client";

import Link from "next/link";
import { CalendarDays, ExternalLink } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type {
  CreateCrmStructureResult,
  SkipReason,
} from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  result: CreateCrmStructureResult;
};

const MILESTONE_LABEL: Record<string, string> = {
  consultas: "Plazo consultas",
  visita_tecnica: "Visita técnica",
  entrega: "Entrega de oferta",
};

const SKIP_ID_LABEL: Record<string, string> = {
  contact: "Contacto",
  deal: "Negocio",
  installations: "Instalaciones",
  attachments: "Adjuntos",
  followUpTask: "Tarea de seguimiento",
  quote: "Cotización",
  milestones: "Hitos",
  agendaDeadline: "Plazo en agenda",
};

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  no_seleccionado: "no seleccionado",
  requiere_negocio: "requiere negocio",
  sin_permiso: "sin permiso",
  sin_datos: "sin datos",
  error: "error al crear",
};

function formatSkippedLine(id: string, reason?: SkipReason): string {
  const label = SKIP_ID_LABEL[id] ?? id;
  if (!reason) return label;
  return `${label} — ${SKIP_REASON_LABEL[reason]}`;
}

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
        {result.quotes && result.quotes.length > 0 ? (
          <>
            {result.bundleUrl && (
              <ResultLink
                href={result.bundleUrl}
                label="Propuesta"
                badge={result.bundleCode ? `PROP ${result.bundleCode}` : "PROP"}
              />
            )}
            {result.quotes.map((q) => (
              <ResultLink
                key={q.id}
                href={q.url}
                label={q.installationName}
                badge="CPQ"
              />
            ))}
          </>
        ) : (
          result.quoteUrl && (
            <ResultLink href={result.quoteUrl} label="Cotización" badge="CPQ" />
          )
        )}
        {result.milestones && result.milestones.length > 0 && (
          <li className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5">
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Hitos de agenda
            </p>
            <ul className="space-y-1">
              {result.milestones.map((m) => (
                <li key={m.eventId} className="flex items-center gap-2 text-[13px] text-ds-text-2">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-tint-violet-fg" />
                  {MILESTONE_LABEL[m.kind] ?? m.kind}
                  {m.syncStatus && (
                    <Tag
                      variant={
                        m.syncStatus === "SYNCED"
                          ? "ok"
                          : m.syncStatus === "ERROR"
                            ? "danger"
                            : "warn"
                      }
                      size="sm"
                    >
                      {m.syncStatus === "SYNCED"
                        ? "sincronizado"
                        : m.syncStatus === "PENDING"
                          ? "pendiente"
                          : m.syncStatus === "ERROR"
                            ? "no sincronizado"
                            : m.syncStatus}
                    </Tag>
                  )}
                </li>
              ))}
            </ul>
            <Link
              href="/agenda"
              className="mt-2 inline-flex min-h-10 items-center gap-1 text-[13px] text-primary ds-tap"
            >
              Abrir agenda <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </li>
        )}
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
                        : result.agendaSync.skippedReason === "pendiente" ||
                            result.agendaSync.syncStatus === "PENDING"
                          ? "Creado en OPAI, pendiente de sincronizar con Google Calendar."
                          : result.agendaSync.skippedReason === "error" ||
                              result.agendaSync.syncStatus === "ERROR"
                            ? "No sincronizado con Google Calendar: revisá el dueño de la cuenta y la conexión de Calendar."
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
      {(result.skippedDetail?.length || result.skipped?.length) ? (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-ds-text-3">Omitido</p>
          <ul className="space-y-0.5">
            {result.skippedDetail?.length
              ? result.skippedDetail.map((s) => (
                  <li key={`${s.id}-${s.reason}`} className="text-[12px] text-ds-text-4">
                    {formatSkippedLine(s.id, s.reason)}
                  </li>
                ))
              : (result.skipped ?? []).map((id) => (
                  <li key={id} className="text-[12px] text-ds-text-4">
                    {formatSkippedLine(id)}
                  </li>
                ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ResultLink({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-primary ds-tap"
      >
        {label}
        {badge && <Tag variant="neutral" size="sm">{badge}</Tag>}
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}
