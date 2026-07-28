"use client";

/**
 * Panel operacional del hilo: vínculos agrupados por origen, picker con
 * alcance por cuenta y sugerencias IA. Lee del CorreoWorkContext.
 */

import { useMemo, useState } from "react";
import { Link2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Spinner, Tag } from "@/components/opai-ds";
import { confirmDialog } from "@/components/ui/confirm-service";
import { canEdit } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import {
  ACCOUNT_SCOPED_LINK_TYPES,
  THREAD_LINK_TYPE_LABELS,
  type ResolvedThreadLink,
  type ThreadLinkEntityType,
} from "@/modules/crm/email/email-thread-links";
import { useCorreoWork } from "./CorreoWorkContext";
import { CorreoLinkRow } from "./CorreoLinkRow";
import { CorreoLinkPicker } from "./CorreoLinkPicker";

type Suggestion = { entityType: string; entityId: string; label: string; motivo: string };

const CREATED_TYPES = new Set(["quote", "installation", "contract"]);
const WORK_TYPES = new Set(["ops_ticket", "incidente", "calendar_event"]);
const GROUP_LIMIT = 10;

function typeLabel(entityType: string): string {
  if (entityType in THREAD_LINK_TYPE_LABELS) {
    return THREAD_LINK_TYPE_LABELS[entityType as ThreadLinkEntityType];
  }
  return entityType;
}

export function CorreoLinksPanel({
  accountId = null,
}: {
  threadId: string;
  accountId?: string | null;
}) {
  const { threadId, links: linksRes, reload } = useCorreoWork();
  const perms = useEffectivePermissions();
  const canMutate = canEdit(perms, "crm", "correos");
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const links = linksRes.data;

  const groups = useMemo(() => {
    const all = links ?? [];
    const orphans = all.filter((l) => l.orphan);
    const rest = all.filter((l) => !l.orphan);
    const created = rest.filter(
      (l) => l.linkedVia !== "manual" && CREATED_TYPES.has(l.entityType),
    );
    const work = rest.filter((l) => WORK_TYPES.has(l.entityType));
    const claimed = new Set([...created, ...work].map((l) => l.id));
    const manual = rest.filter((l) => !claimed.has(l.id));
    return { orphans, created, work, manual };
  }, [links]);

  async function createLink(
    entityType: string,
    entityId: string,
    linkedVia?: string,
    scope?: "account" | "tenant",
  ) {
    const accountScopeApplies =
      Boolean(accountId) &&
      ACCOUNT_SCOPED_LINK_TYPES.has(entityType as ThreadLinkEntityType);
    if (accountScopeApplies && scope === "tenant") {
      const ok = await confirmDialog({
        title: "Vincular fuera de la cuenta",
        description:
          "Esta entidad no pertenece a la cuenta del hilo. ¿Confirmás el vínculo de todos modos?",
        confirmLabel: "Vincular igual",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/crm/correos/${threadId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, linkedVia }),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      toast.error(data.error || "No se pudo vincular");
      return;
    }
    toast.success("Vinculado");
    setAdding(false);
    setSuggestions((prev) => prev?.filter((s) => s.entityId !== entityId) ?? null);
    reload("links");
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/crm/correos/${threadId}/links?linkId=${linkId}`, {
      method: "DELETE",
    }).catch(() => {});
    reload("links");
  }

  async function toggleVisibility(linkId: string, visibleOnEntity: boolean) {
    const res = await fetch(`/api/crm/correos/${threadId}/links`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, visibleOnEntity }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar la visibilidad");
      return;
    }
    reload("links");
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/links/suggest`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        suggestions?: Suggestion[];
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error || "No se pudieron sugerir vínculos");
        return;
      }
      if (data.note) toast.message(data.note);
      setSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0 && !data.note) {
        toast.message("La IA no encontró entidades referidas en este correo");
      }
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <section
      aria-label="Entidades vinculadas"
      className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3"
    >
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Vinculado a</p>
        {accountId ? (
          <Tag variant="brand" size="sm">
            Alcance: cuenta
          </Tag>
        ) : (
          <Tag variant="neutral" size="sm">
            Sin cuenta — todo el tenant
          </Tag>
        )}
        {canMutate && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void suggest()}
              disabled={suggesting}
              className="inline-flex h-11 items-center gap-1 rounded-lg bg-tint-violet px-2 text-[12px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50 sm:h-8"
            >
              {suggesting ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              Sugerir
            </button>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              aria-label="Vincular entidad"
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-ds-border-default px-2 text-[12px] ds-tap sm:h-8"
            >
              <Plus className="h-3.5 w-3.5" /> Vincular
            </button>
          </div>
        )}
      </div>

      {links === null || linksRes.loading ? (
        <Spinner className="mx-auto" />
      ) : links.length === 0 ? (
        <p className="text-[12px] text-ds-text-4">
          Sin vínculos. Vinculá una instalación, cotización, contrato o factura.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.orphans.length > 0 && (
            <LinkGroup
              title="Entidades eliminadas"
              danger
              items={groups.orphans}
              expanded={expanded.orphans}
              onExpand={() => setExpanded((e) => ({ ...e, orphans: true }))}
              canEdit={canMutate}
              onToggleVisibility={toggleVisibility}
              onRemove={removeLink}
            />
          )}
          <LinkGroup
            title="Creado desde este correo"
            items={groups.created}
            expanded={expanded.created}
            onExpand={() => setExpanded((e) => ({ ...e, created: true }))}
            canEdit={canMutate}
            onToggleVisibility={toggleVisibility}
            onRemove={removeLink}
          />
          <LinkGroup
            title="Trabajo del hilo"
            items={groups.work}
            expanded={expanded.work}
            onExpand={() => setExpanded((e) => ({ ...e, work: true }))}
            canEdit={canMutate}
            onToggleVisibility={toggleVisibility}
            onRemove={removeLink}
          />
          <LinkGroup
            title="Vinculado a mano"
            items={groups.manual}
            expanded={expanded.manual}
            onExpand={() => setExpanded((e) => ({ ...e, manual: true }))}
            canEdit={canMutate}
            onToggleVisibility={toggleVisibility}
            onRemove={removeLink}
          />
        </div>
      )}

      {suggestions !== null && suggestions.length > 0 && canMutate && (
        <div className="space-y-1 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2">
          <p className="text-[12px] font-medium text-ds-text-3">
            Sugerencias de la IA (confirmá para vincular)
          </p>
          {suggestions.map((s) => (
            <div key={`${s.entityType}:${s.entityId}`} className="flex items-center gap-2">
              <Tag variant="neutral" size="sm">
                {typeLabel(s.entityType)}
              </Tag>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-2" title={s.motivo}>
                {s.label}
              </span>
              <button
                type="button"
                onClick={() => void createLink(s.entityType, s.entityId, "ai")}
                className="h-11 rounded-lg bg-primary px-2 text-[12px] font-medium text-primary-foreground ds-tap sm:h-8"
              >
                Vincular
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && canMutate && (
        <CorreoLinkPicker
          accountId={accountId}
          onPick={(entityType, entityId, scope) =>
            void createLink(entityType, entityId, undefined, scope)
          }
        />
      )}
    </section>
  );
}

function LinkGroup({
  title,
  items,
  expanded,
  onExpand,
  canEdit,
  onToggleVisibility,
  onRemove,
  danger = false,
}: {
  title: string;
  items: ResolvedThreadLink[];
  expanded?: boolean;
  onExpand: () => void;
  canEdit: boolean;
  onToggleVisibility: (linkId: string, visible: boolean) => void;
  onRemove: (linkId: string) => void;
  danger?: boolean;
}) {
  if (items.length === 0) return null;
  const showAll = expanded || items.length <= GROUP_LIMIT;
  const visible = showAll ? items : items.slice(0, GROUP_LIMIT);

  return (
    <div className="space-y-1">
      <p
        className={`text-[12px] font-medium uppercase tracking-wide ${
          danger ? "text-status-danger-fg" : "text-ds-text-3"
        }`}
      >
        {title}
      </p>
      <ul className="space-y-0.5">
        {visible.map((link) => (
          <CorreoLinkRow
            key={link.id}
            link={link}
            canEdit={canEdit}
            onToggleVisibility={(id, v) => void onToggleVisibility(id, v)}
            onRemove={(id) => void onRemove(id)}
          />
        ))}
      </ul>
      {!showAll && (
        <button
          type="button"
          onClick={onExpand}
          className="px-1.5 text-[12px] font-medium text-primary ds-tap"
        >
          Ver todos ({items.length})
        </button>
      )}
    </div>
  );
}
