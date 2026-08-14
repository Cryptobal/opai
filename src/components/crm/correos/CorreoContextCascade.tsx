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
import type { CorreoCascadeAiTarget } from "@/modules/crm/email/correo-cascade-ai";

type Props = {
  detail: CorreoDetail;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void | Promise<void>;
  onOpenAttachments?: () => void;
  /** Abre el plan IA enfocado en crear solo esa entidad. */
  onCreateWithAi?: (target: CorreoCascadeAiTarget) => void;
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
  onCreateWithAi,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const canMutate = canEdit(perms, "crm", "correos");
  const canUseCopiloto = hasCapability(perms, "copiloto_correos");
  const editable = canMutate && canUseCopiloto;
  const aiFor = (target: CorreoCascadeAiTarget) =>
    editable && onCreateWithAi ? () => onCreateWithAi(target) : undefined;
  const { links: linksRes, contactContext, reload, applyAccountOptimistic } =
    useCorreoWork();
  const [omnibox, setOmnibox] = useState<OmniboxTarget>(null);

  const links = linksRes.data ?? [];
  const quotes = links.filter((l) => l.entityType === "quote" && !l.orphan);
  const installations = links.filter(
    (l) => l.entityType === "installation" && !l.orphan,
  );
  const orphans = links.filter((l) => l.orphan);
  const contactId = contactContext.data?.contact?.id ?? null;
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

  async function removeAccountFromThread() {
    const ok = await confirmDialog({
      title: "Quitar cuenta del hilo",
      description:
        "Se desvinculará la cuenta y el negocio asociado. Las cotizaciones e instalaciones vinculadas quedarán huérfanas (visibles para que decidas). Los adjuntos ya guardados no se eliminan.",
      confirmLabel: "Quitar cuenta",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (!ok) return;
    await associateAndReload({ accountId: null, dealId: null });
  }

  async function createLink(c: OmniboxCandidate) {
    if (c.entityType === "account") {
      if (t.accountId && c.id === t.accountId) {
        setOmnibox(null);
        return;
      }
      if (t.accountId && t.dealId && c.id !== t.accountId) {
        const ok = await confirmDialog({
          title: "Cambiar cuenta del hilo",
          description:
            "Al asociar otra cuenta se desvinculará el negocio actual. Las cotizaciones e instalaciones vinculadas a la cuenta anterior quedarán huérfanas.",
          confirmLabel: "Cambiar cuenta",
          cancelLabel: "Cancelar",
        });
        if (!ok) return;
        await associateAndReload({ accountId: c.id, dealId: null });
        return;
      }
      await associateAndReload({
        accountId: c.id,
        dealId: t.accountId ? null : t.dealId,
      });
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
      // Contactos del hilo se gestionan vía CorreoThreadContacts (chips abajo).
      toast.message("Usa Agregar en Contactos para vincular");
      setOmnibox(null);
      return;
    }

    // Cascada estricta: instalación/cotización/contrato solo de la cuenta
    // (y cotización del negocio si hay). Sin escape hatch cross-cuenta.
    const accountScopeApplies =
      Boolean(t.accountId) &&
      ACCOUNT_SCOPED_LINK_TYPES.has(c.entityType as ThreadLinkEntityType);
    if (accountScopeApplies && c.scope === "tenant") {
      toast.message("Solo podés vincular entidades de la cuenta del hilo");
      return;
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
    const res = await fetch(`/api/crm/correos/${t.id}/links?linkId=${linkId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("No se pudo quitar el vínculo");
      return;
    }
    toast.success("Vínculo quitado");
    setOmnibox(null);
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
        onEdit={() => setOmnibox("account")}
        onCreateWithAi={aiFor("account")}
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
        href={contactId ? `/crm/contacts/${contactId}` : null}
        onAdd={() => setOmnibox("contact")}
        onEdit={() => setOmnibox("contact")}
        onCreateWithAi={aiFor("contact")}
      />
      {t.accountId && (
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
        onEdit={() => setOmnibox("deal")}
        onCreateWithAi={aiFor("deal")}
      />
      <CorreoCascadeRow
        icon={FileText}
        label="Cotización"
        value={quote?.label ?? null}
        depth={2}
        hasValue={Boolean(quote)}
        editable={editable && Boolean(t.accountId)}
        disabled={!t.accountId}
        href={
          quote
            ? quote.href ?? `/crm/cotizaciones/${quote.entityId}`
            : null
        }
        // Sin cotización: + abre el plan IA (crear), no el omnibox de vincular.
        // Vincular existente queda en el lápiz cuando ya hay una, o vía omnibox
        // si no hay handler IA.
        onAdd={() => {
          if (onCreateWithAi) onCreateWithAi("quote");
          else setOmnibox("quote");
        }}
        onEdit={() => setOmnibox("quote")}
        onCreateWithAi={aiFor("quote")}
      />
      <CorreoCascadeRow
        icon={MapPin}
        label="Instalación"
        value={installation?.label ?? null}
        depth={1}
        hasValue={Boolean(installation)}
        editable={editable && Boolean(t.accountId)}
        disabled={!t.accountId}
        href={
          installation
            ? installation.href ?? `/crm/installations/${installation.entityId}`
            : null
        }
        onAdd={() => setOmnibox("installation")}
        onEdit={() => setOmnibox("installation")}
        onCreateWithAi={aiFor("installation")}
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
        editable={Boolean(onOpenAttachments) && (detail.attachments.length > 0 || detail.degraded)}
        onActivate={
          detail.attachments.length > 0 || detail.degraded
            ? () => onOpenAttachments?.()
            : undefined
        }
        onEdit={
          detail.attachments.length > 0 || detail.degraded
            ? () => onOpenAttachments?.()
            : undefined
        }
      />

      {omnibox && editable && (
        <div className="border-t border-ds-border-subtle p-2">
          <CorreoLinkOmnibox
            accountId={t.accountId}
            dealId={t.dealId}
            types={omniboxTypes}
            onPick={(c) => void createLink(c)}
            onCancel={() => setOmnibox(null)}
            removeLabel={
              omnibox === "account"
                ? "Quitar cuenta del hilo"
                : omnibox === "deal"
                  ? "Quitar negocio del hilo"
                  : omnibox === "quote"
                    ? "Quitar cotización del hilo"
                    : omnibox === "installation"
                      ? "Quitar instalación del hilo"
                      : "Quitar del hilo"
            }
            onRemove={
              omnibox === "account" && t.accountId
                ? () => void removeAccountFromThread()
                  : omnibox === "deal" && t.dealId && t.accountId
                  ? () =>
                      void associateAndReload({
                        accountId: t.accountId,
                        dealId: null,
                      }).then(() => toast.success("Negocio desvinculado"))
                  : omnibox === "quote" && quote
                    ? () => void removeLink(quote.id)
                    : omnibox === "installation" && installation
                      ? () => void removeLink(installation.id)
                      : undefined
            }
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
