"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MailX } from "lucide-react";
import { Skeleton, Surface, Tag } from "@/components/opai-ds";
import { canEdit } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { EntityThreadReader } from "./EntityThreadReader";
import {
  EntityConversationActions,
  type ComposeAction,
} from "./entity-conversations/EntityConversationActions";
import { EntityConversationComposer } from "./entity-conversations/EntityConversationComposer";
import type { ConversationEntityType } from "@/modules/crm/email/entity-conversations";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";

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
 * Conversaciones accionables de una ficha CRM.
 * Un componente, tres variantes (tab | rail | card), un endpoint genérico.
 */
export function EntityConversations({
  entityType,
  entityId,
  variant = "tab",
  accountId = null,
  dealId = null,
  contactId = null,
}: Props) {
  const perms = useEffectivePermissions();
  const canWriteCorreos = canEdit(perms, "productividad", "correos");

  const [rows, setRows] = useState<ThreadRow[] | null>(null);
  const [error, setError] = useState<"load" | "forbidden" | null>(null);
  const [cascade, setCascade] = useState(true);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [mailboxEmail, setMailboxEmail] = useState<string | null>(null);
  const [compose, setCompose] = useState<{
    threadId: string;
    action: ComposeAction;
    subject: string;
    messages: CorreoMessageDTO[];
  } | null>(null);
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

  useEffect(() => {
    fetch("/api/crm/gmail/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.accounts) ? d.accounts : [];
        const active = list.find(
          (a: { status?: string; email?: string }) => a.status === "active" && a.email,
        ) as { email?: string } | undefined;
        setMailboxEmail(active?.email ?? null);
      })
      .catch(() => setMailboxEmail(null));
  }, []);

  useEffect(() => {
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

  const canCompose = Boolean(mailboxEmail) && canWriteCorreos;
  const visibleRows = useMemo(() => {
    if (!rows) return null;
    if (variant === "rail" && !panelOpen) return rows.slice(0, 3);
    return rows;
  }, [rows, variant, panelOpen]);

  function toggleCascade() {
    setCascade((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(cascadeStorageKey(entityType, entityId), next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function startAction(threadId: string, action: ComposeAction, subject: string) {
    const res = await fetch(
      `/api/crm/conversaciones/${threadId}?entityType=${entityType}&entityId=${entityId}`,
    );
    if (!res.ok) return;
    const detail = await res.json();
    setCompose({
      threadId,
      action,
      subject: detail.thread?.subject ?? subject,
      messages: Array.isArray(detail.messages) ? detail.messages : [],
    });
  }

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
        <button
          type="button"
          onClick={toggleCascade}
          className="ml-auto inline-flex h-8 items-center rounded-full border border-ds-border-default px-2.5 text-[12px] text-ds-text-2 ds-tap"
          title="Alcance de conversaciones"
        >
          {cascade ? "Todo el árbol" : "Solo de esta ficha"}
        </button>
      </div>

      {error === "forbidden" ? (
        <p className="text-[13px] text-status-warn-fg">Sin permiso para ver estas conversaciones.</p>
      ) : error === "load" ? (
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
          {visibleRows!.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => setOpenThreadId(t.id)}
                className="flex w-full flex-col gap-0.5 text-left ds-tap"
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1">
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
              <div className="mt-1.5 sm:hidden">
                <EntityConversationActions
                  canCompose={canCompose}
                  threadId={t.id}
                  compact
                  onAction={(a) => void startAction(t.id, a, t.subject)}
                />
              </div>
              <div className="mt-1.5 hidden sm:block">
                <EntityConversationActions
                  canCompose={canCompose}
                  threadId={t.id}
                  onAction={(a) => void startAction(t.id, a, t.subject)}
                />
              </div>
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
        canCompose={canCompose}
        onAction={(a) => {
          if (!openThreadId) return;
          const row = rows?.find((r) => r.id === openThreadId);
          void startAction(openThreadId, a, row?.subject ?? "");
        }}
        onClose={() => setOpenThreadId(null)}
      />

      <EntityConversationComposer
        open={Boolean(compose)}
        action={compose?.action ?? null}
        threadId={compose?.threadId ?? ""}
        subject={compose?.subject ?? ""}
        messages={compose?.messages ?? []}
        entityType={entityType}
        entityId={entityId}
        accountId={accountId}
        dealId={dealId}
        contactId={contactId}
        mailboxEmail={mailboxEmail}
        onClose={() => setCompose(null)}
        onSent={() => {
          setCompose(null);
          setOpenThreadId(null);
          // refresh list
          setCascade((c) => c);
          const qs = new URLSearchParams({
            entityType,
            entityId,
            cascade: cascade ? "1" : "0",
          });
          fetch(`/api/crm/conversaciones?${qs}`)
            .then((r) => r.json())
            .then((d) => setRows(Array.isArray(d.threads) ? d.threads : []))
            .catch(() => undefined);
        }}
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
