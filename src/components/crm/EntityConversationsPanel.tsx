"use client";

import { useEffect, useState } from "react";
import { Mail, MailX } from "lucide-react";
import { Skeleton, Surface } from "@/components/opai-ds";
import { EntityThreadReader } from "./EntityThreadReader";

type ThreadRow = { id: string; subject: string; fromEmail: string | null; lastMessageAt: string | null };
type EntityType = "account" | "deal" | "installation";

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Sección "Conversaciones" de la ficha (Bloque 5): lista los hilos de correo
 * asociados y VISIBLES en la entidad (cuenta, negocio o instalación) y los abre
 * en un lector de solo lectura EMBEBIDO (no redirige a /crm/correos). El acceso
 * lo deriva el endpoint de la propia entidad (tenant + flag de visibilidad); la
 * casilla del usuario sigue privada. Pasar exactamente uno de accountId /
 * dealId / installationId.
 */
export function EntityConversationsPanel({
  accountId,
  dealId,
  installationId,
}: {
  accountId?: string;
  dealId?: string;
  installationId?: string;
}) {
  const [rows, setRows] = useState<ThreadRow[] | null>(null);
  const [error, setError] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const entityType: EntityType | null = accountId ? "account" : dealId ? "deal" : installationId ? "installation" : null;
  const entityId = accountId ?? dealId ?? installationId ?? "";

  useEffect(() => {
    if (!entityType) return;
    const qs = `${entityType === "account" ? "accountId" : entityType === "deal" ? "dealId" : "installationId"}=${entityId}`;
    setRows(null);
    setError(false);
    fetch(`/api/crm/conversaciones?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRows(Array.isArray(d.threads) ? d.threads : []))
      .catch(() => setError(true));
  }, [entityType, entityId]);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-tint-violet-fg" />
        <h3 className="font-display text-[15px] font-semibold text-ds-text-1">Conversaciones</h3>
        {rows && rows.length > 0 && (
          <span className="rounded-full bg-ds-surface-3 px-1.5 py-0.5 text-[12px] text-ds-text-3">{rows.length}</span>
        )}
      </div>

      {error ? (
        <p className="text-[13px] text-status-danger-fg">No se pudieron cargar las conversaciones.</p>
      ) : rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-4 text-[13px] text-ds-text-4">
          <MailX className="h-4 w-4 shrink-0" />
          Sin correos asociados y visibles todavía.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenThreadId(t.id)}
                className="flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2 text-left ds-tap hover:border-primary"
              >
                <span className="truncate text-[13px] font-medium text-ds-text-1">{t.subject || "(sin asunto)"}</span>
                <span className="flex items-center gap-2 text-[12px] text-ds-text-4">
                  <span className="min-w-0 truncate">{t.fromEmail || "—"}</span>
                  {t.lastMessageAt && <span className="ml-auto shrink-0">{fmt(t.lastMessageAt)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {entityType && (
        <EntityThreadReader
          threadId={openThreadId}
          entityType={entityType}
          entityId={entityId}
          onClose={() => setOpenThreadId(null)}
        />
      )}
    </Surface>
  );
}
