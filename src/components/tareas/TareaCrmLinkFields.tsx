"use client";

import { TareaCrmLinkPicker, type CrmLinkOption } from "./TareaCrmLinkPicker";
import type { TareaCrmLinkDraft } from "./types";

/** Cascada editable Cuenta → Negocio → Cotización / Instalación. */
export function TareaCrmLinkFields({
  value,
  canEdit,
  fromEmail,
  onChange,
}: {
  value: TareaCrmLinkDraft;
  canEdit: boolean;
  /** true si la tarea nació de un correo (helper de precarga). */
  fromEmail?: boolean;
  onChange: (next: TareaCrmLinkDraft) => void;
}) {
  const setAccount = (opt: CrmLinkOption | null) => {
    if (!opt) {
      onChange({
        accountId: null,
        accountName: null,
        dealId: null,
        dealTitle: null,
        quoteId: null,
        quoteLabel: null,
        installationId: null,
        installationName: null,
      });
      return;
    }
    onChange({
      accountId: opt.id,
      accountName: opt.label,
      dealId: null,
      dealTitle: null,
      quoteId: null,
      quoteLabel: null,
      installationId: null,
      installationName: null,
    });
  };

  const setDeal = (opt: CrmLinkOption | null) => {
    if (!opt) {
      onChange({
        ...value,
        dealId: null,
        dealTitle: null,
        quoteId: null,
        quoteLabel: null,
      });
      return;
    }
    onChange({
      ...value,
      dealId: opt.id,
      dealTitle: opt.label,
      accountId: opt.accountId ?? value.accountId,
      quoteId: null,
      quoteLabel: null,
    });
  };

  const setQuote = (opt: CrmLinkOption | null) => {
    if (!opt) {
      onChange({ ...value, quoteId: null, quoteLabel: null });
      return;
    }
    const nextDealId = opt.dealId ?? value.dealId;
    const nextInstId = opt.installationId ?? value.installationId;
    onChange({
      ...value,
      quoteId: opt.id,
      quoteLabel: opt.label,
      dealId: nextDealId,
      dealTitle: nextDealId === value.dealId ? value.dealTitle : value.dealTitle,
      accountId: opt.accountId ?? value.accountId,
      installationId: nextInstId,
      installationName:
        nextInstId === value.installationId ? value.installationName : value.installationName,
    });
  };

  const setInstallation = (opt: CrmLinkOption | null) => {
    if (!opt) {
      onChange({ ...value, installationId: null, installationName: null });
      return;
    }
    onChange({
      ...value,
      installationId: opt.id,
      installationName: opt.label,
      accountId: opt.accountId ?? value.accountId,
    });
  };

  const hasAny =
    Boolean(value.accountId) ||
    Boolean(value.dealId) ||
    Boolean(value.quoteId) ||
    Boolean(value.installationId);

  // Solo lectura sin vínculos: no ocupar espacio.
  if (!canEdit && !hasAny) return null;

  const showDeal = canEdit || Boolean(value.dealId);
  const showQuote = canEdit || Boolean(value.quoteId);
  const showInst = canEdit || Boolean(value.installationId);

  return (
    <div className="space-y-3">
      <div className="space-y-0.5 px-1">
        <span className="text-[12px] font-medium text-ds-text-4">Vinculación CRM</span>
        {fromEmail && value.accountId && canEdit && (
          <p className="text-[12px] text-ds-text-4">
            Precargado desde el correo; puedes ajustar la cascada.
          </p>
        )}
      </div>

      {(canEdit || value.accountId) && (
        <TareaCrmLinkPicker
          type="accounts"
          label="Cuenta"
          placeholder="Buscar cuenta…"
          value={value.accountId}
          selectedLabel={value.accountName}
          disabled={!canEdit}
          onSelect={setAccount}
          onClear={() => setAccount(null)}
        />
      )}

      {showDeal && (
        <TareaCrmLinkPicker
          type="deals"
          label="Negocio"
          placeholder="Buscar negocio…"
          value={value.dealId}
          selectedLabel={value.dealTitle}
          disabled={!canEdit || !value.accountId}
          accountId={value.accountId}
          onSelect={setDeal}
          onClear={() => setDeal(null)}
        />
      )}

      {showQuote && (
        <TareaCrmLinkPicker
          type="quotes"
          label="Cotización"
          placeholder="Buscar cotización…"
          value={value.quoteId}
          selectedLabel={value.quoteLabel}
          disabled={!canEdit || !value.accountId}
          accountId={value.accountId}
          dealId={value.dealId}
          onSelect={setQuote}
          onClear={() => setQuote(null)}
        />
      )}

      {showInst && (
        <TareaCrmLinkPicker
          type="installations"
          label="Instalación"
          placeholder="Buscar instalación…"
          value={value.installationId}
          selectedLabel={value.installationName}
          disabled={!canEdit || !value.accountId}
          accountId={value.accountId}
          onSelect={setInstallation}
          onClear={() => setInstallation(null)}
        />
      )}
    </div>
  );
}
