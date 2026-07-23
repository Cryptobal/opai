"use client";

/**
 * RecentEmailCard — inbox real del usuario en el Hub (≠ Radar Comercial,
 * que muestra señales comerciales derivadas). Lee la base local vía
 * /api/hub/emails (contexto compartido); nunca consulta Gmail ni marca
 * mensajes como leídos. Tap en una fila abre el hilo en el lector
 * existente (/crm/correos?thread=<id>).
 */

import { useState } from "react";
import Link from "next/link";
import { Mail, Paperclip, RefreshCw } from "lucide-react";
import { EmptyState, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import { useHubEmails } from "./hub-email-context";

const MOBILE_VISIBLE = 3;

/** "Nombre <mail@x>" → "Nombre"; si no, la parte local del email. */
function senderLabel(fromEmail: string | null): string {
  if (!fromEmail) return "Remitente desconocido";
  const match = fromEmail.match(/^\s*"?([^"<]+?)"?\s*</);
  if (match?.[1]) return match[1].trim();
  return fromEmail.split("@")[0] || fromEmail;
}

function HeaderRow({ unreadCount }: { unreadCount?: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Mail className="h-4 w-4 shrink-0 text-primary" />
        <p className="truncate font-display text-sm font-semibold text-ds-text-1">
          Correos recientes
        </p>
        {typeof unreadCount === "number" && unreadCount > 0 && (
          <Tag variant="brand" size="sm">{unreadCount} sin leer</Tag>
        )}
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href="/crm/correos">Ver todos</Link>
      </Button>
    </div>
  );
}

export function RecentEmailCard() {
  const state = useHubEmails();
  const [showAll, setShowAll] = useState(false);

  // Sin provider (sin acceso CRM) la tarjeta no se renderiza.
  if (!state) return null;

  const { status, data, reload } = state;

  if (status === "loading") {
    return (
      <Surface elevation={1} padding="md" className="space-y-3">
        <HeaderRow />
        {/* Skeleton con altura estable (3 filas ≈ lista real) — sin layout shift */}
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: MOBILE_VISIBLE }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-ds-md bg-ds-surface-2" />
          ))}
        </div>
      </Surface>
    );
  }

  if (status === "disconnected") {
    return (
      <Surface elevation={1} padding="md" className="space-y-3">
        <HeaderRow />
        <EmptyState
          icon={Mail}
          title="Sin casilla conectada"
          description="Conecta tu Gmail para ver tus correos recientes aquí."
          compact
        />
        <div className="flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link href="/opai/configuracion/integraciones">Conectar Gmail</Link>
          </Button>
        </div>
      </Surface>
    );
  }

  if (status === "error" || !data) {
    return (
      <Surface elevation={1} padding="md" className="space-y-3">
        <HeaderRow />
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-ds-md bg-ds-surface-2 px-3 py-2.5">
          <p className="min-w-0 text-[13px] text-ds-text-3">
            No pudimos cargar tus correos.
          </p>
          <Button variant="outline" size="sm" onClick={reload} className="shrink-0">
            <RefreshCw className="h-4 w-4" />
            <span className="ml-1.5">Reintentar</span>
          </Button>
        </div>
      </Surface>
    );
  }

  const multipleAccounts = data.accountEmails.length > 1;

  return (
    <Surface elevation={1} padding="md" className="min-w-0 space-y-3">
      <HeaderRow unreadCount={data.unreadCount} />

      {data.items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Tu bandeja está al día"
          description="No hay correos recientes en tu casilla."
          compact
        />
      ) : (
        <>
          <ul className="space-y-0.5">
            {data.items.map((item, idx) => (
              <li
                key={item.id}
                className={cn(
                  "min-w-0",
                  idx >= MOBILE_VISIBLE && !showAll && "hidden lg:block",
                )}
              >
                <Link
                  href={`/crm/correos?thread=${item.id}`}
                  className="flex min-h-11 min-w-0 items-start gap-2.5 rounded-ds-md px-2 py-2 transition-colors hover:bg-ds-surface-2 ds-tap"
                >
                  <span
                    aria-label={item.isUnread ? "No leído" : undefined}
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      item.isUnread ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "min-w-0 truncate text-[13px]",
                          item.isUnread
                            ? "font-semibold text-ds-text-1"
                            : "font-medium text-ds-text-2",
                        )}
                      >
                        {senderLabel(item.fromEmail)}
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-ds-text-4">
                        {item.lastMessageAt ? timeAgo(new Date(item.lastMessageAt)) : ""}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      {item.hasAttachment && (
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
                      )}
                      <span
                        className={cn(
                          "min-w-0 truncate text-[13px]",
                          item.isUnread ? "text-ds-text-1" : "text-ds-text-3",
                        )}
                      >
                        {item.subject || "(sin asunto)"}
                      </span>
                    </span>
                    {item.snippet && (
                      <span className="block min-w-0 truncate text-[12px] text-ds-text-4">
                        {item.snippet}
                      </span>
                    )}
                    {multipleAccounts && (
                      <span className="block min-w-0 truncate text-[12px] font-mono text-ds-text-4">
                        {item.accountEmail}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {data.items.length > MOBILE_VISIBLE && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="min-h-11 w-full rounded-ds-md text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2 lg:hidden"
            >
              Ver más correos
            </button>
          )}
        </>
      )}
    </Surface>
  );
}
