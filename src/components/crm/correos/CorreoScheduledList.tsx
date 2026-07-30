"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Spinner, Surface, Tag } from "@/components/opai-ds";

type OutboxItem = {
  id: string;
  status: string;
  to: string[];
  subject: string;
  scheduledAt: string | null;
  undoUntil: string | null;
  lastError: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: "info" | "warn" | "danger" | "neutral" }> = {
  held: { label: "Programado", variant: "info" },
  queued: { label: "En cola", variant: "neutral" },
  sending: { label: "Enviando…", variant: "info" },
  failed: { label: "Falló", variant: "danger" },
};

function fmtWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Vista "Programados" (PR-12): items pendientes del outbox (programados, en
 * cola, reintentando) y fallidos recientes — los errores de envío quedan
 * VISIBLES, nunca en silencio. Permite cancelar lo aún no despachado.
 */
export function CorreoScheduledList({ refreshToken }: { refreshToken?: number }) {
  const [items, setItems] = useState<OutboxItem[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/crm/gmail/outbox")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  async function cancel(id: string) {
    const res = await fetch(`/api/crm/gmail/outbox/${id}/cancel`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (res.ok && data.success) {
      toast.success("Envío cancelado");
      load();
    } else {
      toast.error(data.error || "No se pudo cancelar");
    }
  }

  if (items === null) return <Spinner className="mx-auto" />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Sin envíos pendientes"
        description="Los correos programados y los envíos en cola aparecen acá."
      />
    );
  }

  return (
    <Surface elevation={1} padding="none" className="overflow-hidden">
      {items.map((item) => {
        const status = STATUS_LABEL[item.status] ?? {
          label: item.status,
          variant: "neutral" as const,
        };
        const when = fmtWhen(item.scheduledAt);
        const cancellable = item.status === "held" || item.status === "queued";
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 border-b border-ds-border-subtle px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag variant={status.variant} size="sm">{status.label}</Tag>
                <p className="truncate text-ds-body font-medium text-ds-text-1">
                  {item.subject || "(Sin asunto)"}
                </p>
              </div>
              <p className="truncate text-[12px] text-ds-text-3">
                Para {item.to.join(", ")}
                {when ? ` · sale ${when}` : ""}
              </p>
              {item.status === "failed" && item.lastError && (
                <p className="truncate text-[12px] text-status-danger-fg">{item.lastError}</p>
              )}
            </div>
            {cancellable && (
              <button
                type="button"
                onClick={() => void cancel(item.id)}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-ds-border-default px-2.5 text-[12px] ds-tap"
              >
                <XCircle className="h-4 w-4" /> Cancelar
              </button>
            )}
          </div>
        );
      })}
    </Surface>
  );
}
