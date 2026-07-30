"use client";

/**
 * RecentEmailCard — inbox real del usuario en el Hub (≠ Radar Comercial).
 * Lee /api/hub/emails vía contexto; nunca consulta Gmail ni marca leído.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  Clock,
  Mail,
  Paperclip,
  RefreshCw,
  Reply,
} from "lucide-react";
import { EmptyState, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatGmailDateChile } from "@/modules/crm/email/gmail-date-format";
import { useHubEmails } from "./hub-email-context";
import type {
  HubEmailItem,
  HubScheduledItem,
} from "@/modules/crm/email/hub-recent-emails";

const MOBILE_VISIBLE = 3;

/** "Nombre <mail@x>" → "Nombre"; si no, la parte local del email. */
function senderLabel(fromEmail: string | null): string {
  if (!fromEmail) return "Remitente desconocido";
  const match = fromEmail.match(/^\s*"?([^"<]+?)"?\s*</);
  if (match?.[1]) return match[1].trim();
  return fromEmail.split("@")[0] || fromEmail;
}

function HeaderRow({
  unreadCount,
  dense,
}: {
  unreadCount?: number;
  dense?: boolean;
}) {
  const badge = typeof unreadCount === "number" && unreadCount > 0 && (
    <Tag variant="brand" size="sm" className="shrink-0">
      {unreadCount} sin leer
    </Tag>
  );
  return (
    <>
      <Link
        href="/crm/correos"
        aria-label="Ver todos los correos"
        className="flex min-h-11 min-w-0 items-center gap-2 lg:hidden"
      >
        <Mail className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 truncate font-display text-sm font-semibold text-ds-text-1">
          Correos
        </p>
        {badge}
        <span className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-2 text-ds-text-3">
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
      <Link
        href="/crm/correos"
        aria-label="Ver todos los correos"
        className="hidden min-h-11 min-w-0 items-center gap-2 rounded-lg transition-colors hover:bg-ds-surface-2 ds-tap lg:flex"
      >
        <Mail className="h-4 w-4 shrink-0 text-primary" />
        <p className="truncate font-display text-sm font-semibold text-ds-text-1">
          {dense ? "Correos" : "Correos recientes"}
        </p>
        {badge}
      </Link>
    </>
  );
}

/** Sin señal IA reutilizable: no leídos → requieren respuesta; leídos → recientes. */
function groupEmails(items: HubEmailItem[]) {
  return {
    needReply: items.filter((i) => i.isUnread),
    recent: items.filter((i) => !i.isUnread),
  };
}

function fmtUntil(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailRow({
  item,
  multipleAccounts,
  dense,
  untilLabel,
}: {
  item: HubEmailItem;
  multipleAccounts: boolean;
  dense?: boolean;
  untilLabel?: string | null;
}) {
  return (
    <Link
      href={`/crm/correos?thread=${item.id}`}
      className={cn(
        "group relative flex min-h-11 min-w-0 items-start gap-2.5 rounded-ds-md px-2 py-2 transition-colors hover:bg-ds-surface-2 ds-tap",
      )}
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
              "min-w-0 truncate text-ds-body",
              item.isUnread ? "font-semibold text-ds-text-1" : "font-medium text-ds-text-2",
            )}
          >
            {senderLabel(item.fromEmail)}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-ds-text-4">
            {untilLabel || formatGmailDateChile(item.lastMessageAt)}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {item.hasAttachment && (
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
          )}
          <span
            className={cn(
              "min-w-0 truncate text-ds-body",
              item.isUnread ? "text-ds-text-1" : "text-ds-text-3",
            )}
          >
            {item.subject || "(sin asunto)"}
          </span>
          {item.isUnread && !untilLabel && (
            <Tag variant="brand" size="sm" className="ml-auto shrink-0">
              Sin leer
            </Tag>
          )}
        </span>
        {!dense && item.snippet && (
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
      {dense && (
        <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md bg-ds-surface-1 px-1.5 py-1 opacity-0 shadow-sm ring-1 ring-ds-border-subtle transition-opacity group-hover:flex group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-primary">
            <Reply className="h-3.5 w-3.5" />
            Abrir
          </span>
        </span>
      )}
    </Link>
  );
}

function ScheduledRow({ item }: { item: HubScheduledItem }) {
  const href = item.threadId
    ? `/crm/correos?thread=${item.threadId}`
    : "/crm/correos?folder=scheduled";
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 items-start gap-2.5 rounded-ds-md px-2 py-2 transition-colors hover:bg-ds-surface-2 ds-tap"
    >
      <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-status-info-fg" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-ds-body font-medium text-ds-text-1">
            {item.subject || "(Sin asunto)"}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-ds-text-4">
            {fmtUntil(item.scheduledAt)}
          </span>
        </span>
        <span className="block min-w-0 truncate text-[12px] text-ds-text-3">
          Para {item.to.join(", ") || "—"}
        </span>
      </span>
    </Link>
  );
}

export function RecentEmailCard({
  variant = "default",
  className,
}: {
  variant?: "default" | "dense";
  className?: string;
} = {}) {
  const state = useHubEmails();
  const [showAll, setShowAll] = useState(false);
  const dense = variant === "dense";

  const groups = useMemo(
    () => (state?.data ? groupEmails(state.data.items) : { needReply: [], recent: [] }),
    [state?.data],
  );
  const snoozed = state?.data?.snoozed ?? [];
  const scheduled = state?.data?.scheduled ?? [];

  if (!state) return null;

  const { status, data, reload } = state;
  const shell = cn(
    dense ? "flex min-h-0 min-w-0 flex-col gap-3" : "space-y-3",
    className,
  );
  const hasAny =
    (data?.items.length ?? 0) > 0 || snoozed.length > 0 || scheduled.length > 0;

  if (status === "loading") {
    return (
      <Surface elevation={1} padding="md" className={shell}>
        <HeaderRow dense={dense} />
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
      <Surface elevation={1} padding="md" className={shell}>
        <HeaderRow dense={dense} />
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
      <Surface elevation={1} padding="md" className={shell}>
        <HeaderRow dense={dense} />
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-ds-md bg-ds-surface-2 px-3 py-2.5">
          <p className="min-w-0 text-ds-body text-ds-text-3">No pudimos cargar tus correos.</p>
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
    <Surface elevation={1} padding="md" className={cn(shell, "min-w-0")}>
      <HeaderRow unreadCount={data.unreadCount} dense={dense} />

      {!hasAny ? (
        <EmptyState
          icon={Mail}
          title="Tu bandeja está al día"
          description="No hay correos recientes, pospuestos ni programados."
          compact
        />
      ) : dense ? (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            {groups.needReply.length > 0 && (
              <div>
                <p className="mb-1 px-1 text-[12px] uppercase tracking-wide text-ds-text-4">
                  Requieren respuesta
                </p>
                <ul className="space-y-0.5">
                  {groups.needReply.map((item) => (
                    <li key={item.id}>
                      <EmailRow item={item} multipleAccounts={multipleAccounts} dense />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {groups.recent.length > 0 && (
              <div>
                <p className="mb-1 px-1 text-[12px] uppercase tracking-wide text-ds-text-4">
                  Recientes
                </p>
                <ul className="space-y-0.5">
                  {groups.recent.map((item) => (
                    <li key={item.id}>
                      <EmailRow item={item} multipleAccounts={multipleAccounts} dense />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {snoozed.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 px-1 text-[12px] uppercase tracking-wide text-ds-text-4">
                  <Clock className="h-3.5 w-3.5" />
                  Pospuestos
                </p>
                <ul className="space-y-0.5">
                  {snoozed.map((item) => (
                    <li key={item.id}>
                      <EmailRow
                        item={item}
                        multipleAccounts={multipleAccounts}
                        dense
                        untilLabel={
                          item.snoozedUntil
                            ? `hasta ${fmtUntil(item.snoozedUntil)}`
                            : null
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scheduled.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 px-1 text-[12px] uppercase tracking-wide text-ds-text-4">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Programados
                </p>
                <ul className="space-y-0.5">
                  {scheduled.map((item) => (
                    <li key={item.id}>
                      <ScheduledRow item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
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
                <EmailRow item={item} multipleAccounts={multipleAccounts} />
              </li>
            ))}
          </ul>
          {data.items.length > MOBILE_VISIBLE && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="min-h-11 w-full rounded-ds-md text-ds-body font-medium text-primary transition-colors hover:bg-ds-surface-2 lg:hidden"
            >
              Ver más correos
            </button>
          )}
        </>
      )}
    </Surface>
  );
}
