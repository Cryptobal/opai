"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MailX } from "lucide-react";
import { Skeleton, Surface, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { EntityThreadReader } from "./EntityThreadReader";
import type { ConversationEntityType } from "@/modules/crm/email/entity-conversations";

type ThreadRow = {
  id: string;
  subject: string;
  fromEmail: string | null;
  lastMessageAt: string | null;
  origin: "direct" | "inherited";
  originLabel: string;
};

export type EntityConversationsVariant = "tab" | "rail" | "card";

type Props = {
  entityType: ConversationEntityType;
  entityId: string;
  variant?: EntityConversationsVariant;
  /** Associations to pass to the composer after send. */
  accountId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cascadeStorageKey(entityType: string, entityId: string) {
  return `opai-conv-cascade:${entityType}:${entityId}`;
}

/**
 * Conversaciones de una ficha CRM: lista + control de alcance.
 * Las acciones (responder / reenviar) viven dentro del lector.
 */
export function EntityConversations({
  entityType,
  entityId,
  variant = "tab",
  accountId = null,
  dealId = null,
  contactId = null,
}: Props) {
  const [rows, setRows] = useState<ThreadRow[] | null>(null);
  const [error, setError] = useState<"load" | "forbidden" | null>(null);
  const [cascade, setCascade] = useState(true);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cascadeStorageKey(entityType, entityId));
      if (raw === "0") setCascade(false);
      if (raw === "1") setCascade(true);
    } catch {
      /* ignore */
    }
  }, [entityType, entityId]);

  const reloadRows = useCallback(() => {
    setRows(null);
    setError(null);
    const qs = new URLSearchParams({
      entityType,
      entityId,
      cascade: cascade ? "1" : "0",
    });
    fetch(`/api/crm/conversaciones?${qs}`)
      .then(async (r) => {
        if (r.status === 403) {
          setError("forbidden");
          setRows([]);
          return;
        }
        if (!r.ok) throw new Error("fail");
        const d = await r.json();
        setRows(Array.isArray(d.threads) ? d.threads : []);
      })
      .catch(() => {
        setError("load");
        setRows([]);
      });
  }, [entityType, entityId, cascade]);

  useEffect(() => {
    reloadRows();
  }, [reloadRows]);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    if (variant === "rail" && !panelOpen) return rows.slice(0, 3);
    return rows;
  }, [rows, variant, panelOpen]);

  function setCascadeValue(next: boolean) {
    setCascade(next);
    try {
      localStorage.setItem(cascadeStorageKey(entityType, entityId), next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const openRow = rows?.find((r) => r.id === openThreadId) ?? null;

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="h-4 w-4 text-tint-violet-fg" />
        <h3 className="font-display text-[15px] font-semibold text-ds-text-1">Conversaciones</h3>
        {rows && rows.length > 0 && (
          <span className="rounded-full bg-ds-surface-3 px-1.5 py-0.5 text-[12px] text-ds-text-3">
            {rows.length}
          </span>
        )}
        <div
          className="ml-auto inline-flex h-9 items-center rounded-full border border-ds-border-default p-0.5"
          role="group"
          aria-label="Alcance de conversaciones"
        >
          <button
            type="button"
            aria-pressed={!cascade}
            onClick={() => setCascadeValue(false)}
            className={cn(
              "h-8 rounded-full px-2.5 text-[12px] ds-tap",
              !cascade
                ? "bg-ds-surface-3 font-medium text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-2",
            )}
          >
            Esta ficha
          </button>
          <button
            type="button"
            aria-pressed={cascade}
            onClick={() => setCascadeValue(true)}
            className={cn(
              "h-8 rounded-full px-2.5 text-[12px] ds-tap",
              cascade
                ? "bg-ds-surface-3 font-medium text-ds-text-1"
                : "text-ds-text-3 hover:text-ds-text-2",
            )}
          >
            Todo el árbol
          </button>
        </div>
      </div>

      {error === "forbidden" ? (
        <p className="text-ds-body text-status-warn-fg">Sin permiso para ver estas conversaciones.</p>
      ) : error === "load" ? (
        <p className="text-ds-body text-status-danger-fg">No se pudieron cargar las conversaciones.</p>
      ) : rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-4 text-ds-body text-ds-text-4">
          <div className="flex items-center gap-2">
            <MailX className="h-4 w-4 shrink-0" />
            {cascade
              ? "Sin correos asociados y visibles todavía."
              : "Sin correos propios de esta ficha."}
          </div>
          {!cascade && (
            <button
              type="button"
              onClick={() => setCascadeValue(true)}
              className="h-10 self-start rounded-lg border border-ds-border-default px-3 text-[12px] font-medium text-ds-text-2 ds-tap"
            >
              Ver todo el árbol
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visibleRows!.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenThreadId(t.id)}
                className="flex w-full flex-col gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2 text-left ds-tap"
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ds-body font-medium text-ds-text-1">
                    {t.subject || "(sin asunto)"}
                  </span>
                  {t.origin === "inherited" && (
                    <Tag variant="neutral" size="sm">
                      {t.originLabel}
                    </Tag>
                  )}
                </span>
                <span className="flex items-center gap-2 text-[12px] text-ds-text-4">
                  <span className="min-w-0 truncate">{t.fromEmail || "—"}</span>
                  {t.lastMessageAt && (
                    <span className="ml-auto shrink-0">{fmt(t.lastMessageAt)}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {variant === "rail" && rows && rows.length > 3 && !panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="w-full rounded-lg border border-ds-border-default py-2 text-[12px] font-medium text-ds-text-2 ds-tap"
        >
          Ver {rows.length}
        </button>
      )}
    </>
  );

  return (
    <>
      {variant === "rail" ? (
        <Surface elevation={1} padding="sm" className="space-y-2">
          {body}
        </Surface>
      ) : (
        <Surface elevation={1} padding="md" className="space-y-3">
          {body}
        </Surface>
      )}

      <EntityThreadReader
        threadId={openThreadId}
        entityType={entityType}
        entityId={entityId}
        preview={
          openRow
            ? { subject: openRow.subject, fromEmail: openRow.fromEmail }
            : undefined
        }
        accountId={accountId}
        dealId={dealId}
        contactId={contactId}
        onChanged={reloadRows}
        onClose={() => setOpenThreadId(null)}
      />
    </>
  );
}

/** @deprecated Usar EntityConversations. Compatibilidad temporal. */
export function EntityConversationsPanel(props: {
  accountId?: string;
  dealId?: string;
  installationId?: string;
}) {
  if (props.accountId) {
    return (
      <EntityConversations
        entityType="account"
        entityId={props.accountId}
        accountId={props.accountId}
        variant="tab"
      />
    );
  }
  if (props.dealId) {
    return (
      <EntityConversations
        entityType="deal"
        entityId={props.dealId}
        dealId={props.dealId}
        variant="tab"
      />
    );
  }
  if (props.installationId) {
    return (
      <EntityConversations
        entityType="installation"
        entityId={props.installationId}
        variant="tab"
      />
    );
  }
  return null;
}
