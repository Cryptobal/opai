"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Eye,
  EyeOff,
  FileText,
  MapPin,
  Paperclip,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import { canEdit, hasCapability } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import {
  ACCOUNT_SCOPED_LINK_TYPES,
  type ThreadLinkEntityType,
} from "@/modules/crm/email/email-thread-links";
import { useCorreoWork } from "./CorreoWorkContext";
import { CorreoCascadeRow } from "./CorreoCascadeRow";
import { CorreoLinkOmnibox, type OmniboxCandidate } from "./CorreoLinkOmnibox";
import { CorreoThreadContacts } from "./CorreoThreadContacts";
import { CorreoLinkRow } from "./CorreoLinkRow";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void | Promise<void>;
  onOpenAttachments?: () => void;
};

type OmniboxTarget =
  | "account"
  | "deal"
  | "quote"
  | "installation"
  | "contact"
  | "any"
  | null;

/**
 * Cascada editable in situ (tab Contexto). Absorbe asociación + vínculos.
 */
export function CorreoContextCascade({
  detail,
  onAssociate,
  onOpenAttachments,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const canMutate = canEdit(perms, "crm", "correos");
  const canUseCopiloto = hasCapability(perms, "copiloto_correos");
  const editable = canMutate && canUseCopiloto;
  const { links: linksRes, contactContext, reload, applyAccountOptimistic } =
    useCorreoWork();
  const [omnibox, setOmnibox] = useState<OmniboxTarget>(null);
  const [contactsOpen, setContactsOpen] = useState(false);

  const links = linksRes.data ?? [];
  const quotes = links.filter((l) => l.entityType === "quote" && !l.orphan);
  const installations = links.filter(
    (l) => l.entityType === "installation" && !l.orphan,
  );
  const orphans = links.filter((l) => l.orphan);
  const contactName = contactContext.data?.contact?.name ?? null;

  const attachmentsPending = detail.attachments.filter((a) => !a.savedFileId).length;
  const attachmentsSaved = detail.attachments.filter((a) => a.savedFileId).length;

  const omniboxTypes = useMemo(() => {
    if (omnibox === "account") return ["account"];
    if (omnibox === "deal") return ["deal"];
    if (omnibox === "quote") return ["quote"];
    if (omnibox === "installation") return ["installation"];
    if (omnibox === "contact") return ["contact"];
    return ["account", "contact", "deal", "quote", "installation", "contract"];
  }, [omnibox]);

  async function associateAndReload(p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) {
    if (p.accountId !== undefined) applyAccountOptimistic(p.accountId);
    await onAssociate(p);
    await reload("all");
    setOmnibox(null);
  }

  async function createLink(c: OmniboxCandidate) {
    if (c.entityType === "account") {
      await associateAndReload({ accountId: c.id, dealId: t.dealId });
      return;
    }
    if (c.entityType === "deal") {
      if (!t.accountId) {
        toast.message("Asociá primero una cuenta");
        setOmnibox("account");
        return;
      }
      await associateAndReload({
        accountId: t.accountId,
        dealId: c.id,
      });
      return;
    }
    if (c.entityType === "contact") {
      // Contactos del hilo se gestionan vía CorreoThreadContacts; aquí
      // asociamos la cuenta del contacto si el hilo no tiene.
      toast.message("Usá Contactos del hilo para vincular contactos");
      setContactsOpen(true);
      setOmnibox(null);
      return;
    }

    const accountScopeApplies =
      Boolean(t.accountId) &&
      ACCOUNT_SCOPED_LINK_TYPES.has(c.entityType as ThreadLinkEntityType);
    if (accountScopeApplies && c.scope === "tenant") {
      const ok = await confirmDialog({
        title: "Vincular fuera de la cuenta",
        description:
          "Esta entidad no pertenece a la cuenta del hilo. ¿Confirmás el vínculo de todos modos?",
        confirmLabel: "Vincular igual",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/crm/correos/${t.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: c.entityType,
        entityId: c.id,
        linkedVia: c.scope === "suggested" ? "ai" : "manual",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };
    if (!res.ok || !data.success) {
      toast.error(data.error || "No se pudo vincular");
      return;
    }
    toast.success("Vinculado");
    setOmnibox(null);
    await reload("links");
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/crm/correos/${t.id}/links?linkId=${linkId}`, {
      method: "DELETE",
    }).catch(() => {});
    await reload("links");
  }

  async function toggleVisibility(linkId: string, visibleOnEntity: boolean) {
    const res = await fetch(`/api/crm/correos/${t.id}/links`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, visibleOnEntity }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar la visibilidad");
      return;
    }
    await reload("links");
  }

  const quote = quotes[0] ?? null;
  const installation = installations[0] ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-2">
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="text-[12px] font-medium text-ds-text-3">Contexto en cascada</p>
        {t.accountId && (
          <button
            type="button"
            disabled={!canMutate}
            title={
              t.sharedWithAccount
                ? "Visible en la ficha de la cuenta"
                : "Privado — no se ve en la ficha"
            }
            onClick={() =>
              void associateAndReload({
                accountId: t.accountId,
                dealId: t.dealId,
                sharedWithAccount: !t.sharedWithAccount,
              })
            }
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[12px] text-ds-text-3 ds-tap disabled:opacity-50"
          >
            {t.sharedWithAccount ? (
              <Eye className="h-3.5 w-3.5 text-status-ok-fg" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {t.sharedWithAccount ? "Compartido" : "Privado"}
          </button>
        )}
      </div>

      <CorreoCascadeRow
        icon={Building2}
        label="Cuenta"
        value={t.accountId ? t.accountName?.trim() || "Cuenta" : null}
        depth={0}
        hasValue={Boolean(t.accountId)}
        editable={editable}
        href={t.accountId ? `/crm/accounts/${t.accountId}` : null}
        onAdd={() => setOmnibox("account")}
      />
      <CorreoCascadeRow
        icon={Users}
        label="Contactos"
        value={
          !t.accountId
            ? "Asocia una cuenta primero"
            : contactName || null
        }
        depth={1}
        hasValue={Boolean(contactName)}
        editable={editable && Boolean(t.accountId)}
        disabled={!t.accountId}
        onActivate={() => setContactsOpen((v) => !v)}
        onAdd={() => {
          setContactsOpen(true);
          setOmnibox("contact");
        }}
      />
      {t.accountId && contactsOpen && (
        <div className="border-b border-ds-border-subtle px-3 pb-2 pl-8">
          <CorreoThreadContacts threadId={t.id} accountId={t.accountId} />
        </div>
      )}
      <CorreoCascadeRow
        icon={Briefcase}
        label="Negocio"
        value={t.dealTitle?.trim() || null}
        depth={1}
        hasValue={Boolean(t.dealId)}
        editable={editable && Boolean(t.accountId)}
        disabled={!t.accountId}
        href={t.dealId ? `/crm/deals/${t.dealId}` : null}
        onAdd={() => setOmnibox("deal")}
      />
      <CorreoCascadeRow
        icon={FileText}
        label="Cotización"
        value={quote?.label ?? null}
        depth={2}
        hasValue={Boolean(quote)}
        editable={editable && Boolean(t.accountId)}
        disabled={!t.accountId}
        href={quote?.href ?? null}
        onAdd={() => setOmnibox("quote")}
      />
      <CorreoCascadeRow
        icon={MapPin}
        label="Instalación"
        value={installation?.label ?? null}
        depth={1}
        hasValue={Boolean(installation)}
        editable={editable && Boolean(t.accountId)}
        disabled={!t.accountId}
        href={installation?.href ?? null}
        onAdd={() => setOmnibox("installation")}
      />
      <CorreoCascadeRow
        icon={Paperclip}
        label="Adjuntos"
        value={
          detail.attachments.length > 0
            ? attachmentsSaved > 0
              ? `${detail.attachments.length} · ${attachmentsSaved} guardado${attachmentsSaved === 1 ? "" : "s"}`
              : `${detail.attachments.length}${attachmentsPending ? ` · ${attachmentsPending} sin guardar` : ""}`
            : null
        }
        depth={1}
        hasValue={detail.attachments.length > 0}
        editable={false}
        onActivate={
          detail.attachments.length > 0 || detail.degraded
            ? () => onOpenAttachments?.()
            : undefined
        }
      />

      {omnibox && editable && (
        <div className="border-t border-ds-border-subtle p-2">
          <CorreoLinkOmnibox
            accountId={t.accountId}
            types={omniboxTypes}
            onPick={(c) => void createLink(c)}
            onCancel={() => setOmnibox(null)}
          />
        </div>
      )}

      {(quotes.length > 1 || installations.length > 1 || orphans.length > 0) && (
        <div className="space-y-1 border-t border-ds-border-subtle px-2 py-2">
          <p className="px-1 text-[12px] font-medium text-ds-text-3">Vínculos</p>
          {[...quotes, ...installations, ...orphans].map((l) => (
            <CorreoLinkRow
              key={l.id}
              link={l}
              canEdit={canMutate}
              onRemove={(id) => void removeLink(id)}
              onToggleVisibility={(id, v) => void toggleVisibility(id, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
