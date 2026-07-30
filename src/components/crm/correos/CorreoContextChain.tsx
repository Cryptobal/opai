"use client";

import Link from "next/link";
import {
  Building2,
  Briefcase,
  FileText,
  MapPin,
  Paperclip,
  Search,
} from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { CorreoAccountSuggestionChips } from "./CorreoAccountSuggestionChips";
import { useCorreoSuggestedAccounts } from "./useCorreoSuggestedAccounts";
import { useCorreoWorkOptional } from "./CorreoWorkContext";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  canEdit: boolean;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
  }) => void | Promise<void>;
  onSearchAccount: () => void;
  /** breadcrumb: variante compacta móvil (solo Cuenta › Negocio › Cotización). */
  variant?: "full" | "breadcrumb";
};

/**
 * Cadena navegable bajo el asunto del lector.
 * Cuenta › Negocio › Cotización + Instalación + Adjuntos pendientes.
 */
export function CorreoContextChain({
  detail,
  canEdit,
  onAssociate,
  onSearchAccount,
  variant = "full",
}: Props) {
  const t = detail.thread;
  const breadcrumb = variant === "breadcrumb";
  const work = useCorreoWorkOptional();
  const links = work?.links.data ?? [];
  const quote = links.find((l) => l.entityType === "quote" && !l.orphan);
  const installation = links.find(
    (l) => l.entityType === "installation" && !l.orphan,
  );
  const pendingAttachments = detail.attachments.filter((a) => !a.savedFileId).length;

  // Petición compartida con el banner de Copiloto (una sola por hilo).
  const suggestions = useCorreoSuggestedAccounts(t.id, t.accountId == null);

  if (!t.accountId) {
    return (
      <div className="space-y-1.5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
          <Tag variant="warn" size="sm">
            Sin cuenta
          </Tag>
          {canEdit && (
            <CorreoAccountSuggestionChips
              suggestions={suggestions}
              onAssociate={(accountId) =>
                void onAssociate({ accountId, dealId: null })
              }
            />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onSearchAccount}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] text-ds-text-2 ds-tap sm:min-h-8"
            >
              <Search className="h-3.5 w-3.5" /> Asociar
            </button>
          )}
        </div>
      </div>
    );
  }

  const nodes: Array<{
    key: string;
    icon: typeof Building2;
    label: string;
    href: string;
    sep?: boolean;
  }> = [];

  nodes.push({
    key: "account",
    icon: Building2,
    label: t.accountName || "Cuenta",
    href: `/crm/accounts/${t.accountId}`,
  });
  if (t.dealId) {
    nodes.push({
      key: "deal",
      icon: Briefcase,
      label: [t.dealTitle || "Negocio", t.dealStageName].filter(Boolean).join(" · "),
      href: `/crm/deals/${t.dealId}`,
      sep: true,
    });
  }
  if (quote?.href) {
    nodes.push({
      key: "quote",
      icon: FileText,
      label: [quote.label, quote.status].filter(Boolean).join(" · "),
      href: quote.href,
      sep: true,
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
      {nodes.map((n, i) => {
        const Icon = n.icon;
        return (
          <span key={n.key} className="inline-flex min-w-0 shrink-0 items-center gap-1">
            {(n.sep || i > 0) && (
              <span className="text-ds-text-4" aria-hidden>
                ›
              </span>
            )}
            <Link
              href={n.href}
              className="inline-flex min-h-11 max-w-[160px] items-center gap-1 rounded-full px-1.5 text-[12px] text-ds-text-2 ds-tap hover:bg-ds-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-8"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
              <span className="truncate">{n.label}</span>
            </Link>
          </span>
        );
      })}
      {!breadcrumb && installation?.href && (
        <Link
          href={installation.href}
          className="inline-flex min-h-11 max-w-[140px] shrink-0 items-center gap-1 rounded-full border border-ds-border-subtle px-2 text-[12px] text-ds-text-2 ds-tap sm:min-h-8"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{installation.label}</span>
        </Link>
      )}
      {!breadcrumb && pendingAttachments > 0 && (
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] text-status-warn-fg sm:min-h-8">
          <Paperclip className="h-3.5 w-3.5" />
          {pendingAttachments} sin guardar
        </span>
      )}
    </div>
  );
}
