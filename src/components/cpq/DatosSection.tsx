"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import type { CpqQuoteStatus } from "@/types/cpq";
import { Plus, MapPin, ExternalLink, Loader2 } from "lucide-react";

type CrmInstallationOption = {
  id: string;
  name: string;
  address?: string | null;
  commune?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export interface DatosSectionProps {
  /** CRM entity lists */
  crmAccounts: { id: string; name: string; type?: string }[];
  crmInstallations: CrmInstallationOption[];
  crmContacts: { id: string; firstName: string; lastName: string; email?: string | null }[];
  crmDeals: { id: string; title: string }[];

  /** CRM context (selected IDs + currency) */
  crmContext: {
    accountId: string;
    installationId: string;
    contactId: string;
    dealId: string;
    currency: string;
  };

  /** Quote form state */
  quoteForm: {
    name: string;
    clientName: string;
    validUntil: string;
    notes: string;
    status: CpqQuoteStatus;
    paymentTerms: string;
    serviceStartDays: number;
    contractDuration: number;
    includedItems: string[];
    [key: string]: any;
  };
  quoteDirty: boolean;
  savingQuote: boolean;
  quoteError: string | null;
  isLocked: boolean;

  /** Callbacks */
  saveCrmContext: (patch: Partial<{ accountId: string; installationId: string; contactId: string; dealId: string; currency: string }>) => void;
  setQuoteForm: React.Dispatch<React.SetStateAction<any>>;
  setQuoteDirty: (dirty: boolean) => void;
  saveQuoteBasics: () => void;

  /** Setters for CRM lists (used after inline creation) */
  setCrmAccounts: React.Dispatch<React.SetStateAction<{ id: string; name: string; type?: string }[]>>;
  setCrmInstallations: React.Dispatch<React.SetStateAction<CrmInstallationOption[]>>;
  setCrmContacts: React.Dispatch<React.SetStateAction<{ id: string; firstName: string; lastName: string; email?: string | null }[]>>;
  setCrmDeals: React.Dispatch<React.SetStateAction<{ id: string; title: string }[]>>;
}

export function DatosSection({
  crmAccounts,
  crmInstallations,
  crmContacts,
  crmDeals,
  crmContext,
  quoteForm,
  quoteDirty,
  savingQuote,
  quoteError,
  isLocked,
  saveCrmContext,
  setQuoteForm,
  setQuoteDirty,
  saveQuoteBasics,
  setCrmAccounts,
  setCrmInstallations,
  setCrmContacts,
  setCrmDeals,
}: DatosSectionProps) {
  // ── Inline creation state (only used by this section) ──
  const [inlineCreateType, setInlineCreateType] = useState<"account" | "installation" | "contact" | "deal" | null>(null);
  const [inlineForm, setInlineForm] = useState({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    title: "",
    address: "",
    city: "",
    commune: "",
    lat: null as number | null,
    lng: null as number | null,
  });
  const [inlineCreating, setInlineCreating] = useState(false);
  const labelClassName = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
  const inputClassName = "bg-card text-sm border-border/60";
  const searchableTriggerClassName = "h-8 rounded-md bg-card border-border/60";

  const resetInlineForm = () =>
    setInlineForm({ name: "", firstName: "", lastName: "", email: "", title: "", address: "", city: "", commune: "", lat: null, lng: null });

  const createInline = async () => {
    if (!inlineCreateType) return;
    setInlineCreating(true);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};

      switch (inlineCreateType) {
        case "account":
          endpoint = "/api/crm/accounts";
          body = { name: inlineForm.name, type: "client" };
          break;
        case "installation":
          endpoint = "/api/crm/installations";
          body = {
            accountId: crmContext.accountId,
            name: inlineForm.name,
            address: inlineForm.address || null,
            city: inlineForm.city || null,
            commune: inlineForm.commune || null,
            lat: inlineForm.lat ?? null,
            lng: inlineForm.lng ?? null,
          };
          break;
        case "contact":
          endpoint = "/api/crm/contacts";
          body = { accountId: crmContext.accountId, firstName: inlineForm.firstName, lastName: inlineForm.lastName, email: inlineForm.email };
          break;
        case "deal":
          endpoint = "/api/crm/deals";
          body = { accountId: crmContext.accountId, title: inlineForm.title || `Oportunidad ${quoteForm.clientName}` };
          break;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || "Error") as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const created = data.data;

      // Auto-select and refresh lists
      switch (inlineCreateType) {
        case "account":
          setCrmAccounts((prev) => [...prev, { id: created.id, name: created.name, type: created.type }]);
          saveCrmContext({ accountId: created.id, installationId: "", contactId: "", dealId: "" });
          setQuoteForm((prev: any) => ({ ...prev, clientName: created.name }));
          setQuoteDirty(true);
          break;
        case "installation":
          setCrmInstallations((prev) => [
            ...prev,
            {
              id: created.id,
              name: created.name,
              address: created.address ?? null,
              commune: created.commune ?? null,
              city: created.city ?? null,
              lat: created.lat ?? null,
              lng: created.lng ?? null,
            },
          ]);
          saveCrmContext({ installationId: created.id });
          break;
        case "contact":
          setCrmContacts((prev) => [...prev, { id: created.id, firstName: created.firstName, lastName: created.lastName, email: created.email }]);
          saveCrmContext({ contactId: created.id });
          break;
        case "deal":
          setCrmDeals((prev) => [...prev, { id: created.id, title: created.title }]);
          saveCrmContext({ dealId: created.id });
          break;
      }

      setInlineCreateType(null);
      resetInlineForm();
      toast.success("Creado exitosamente");
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "No se pudo crear";
      toast.error(msg);
    } finally {
      setInlineCreating(false);
    }
  };

  // ── Installation preview memos ──
  const selectedInstallation = useMemo(
    () =>
      crmContext.installationId
        ? crmInstallations.find((installation) => installation.id === crmContext.installationId) ?? null
        : null,
    [crmContext.installationId, crmInstallations]
  );

  const selectedInstallationAddress = useMemo(() => {
    if (!selectedInstallation) return "";
    return [selectedInstallation.address, selectedInstallation.commune, selectedInstallation.city]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(", ");
  }, [selectedInstallation]);

  const selectedInstallationMapsUrl = useMemo(() => {
    if (!selectedInstallation) return "";
    if (selectedInstallation.lat != null && selectedInstallation.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${selectedInstallation.lat},${selectedInstallation.lng}`;
    }
    if (selectedInstallationAddress) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedInstallationAddress)}`;
    }
    return "";
  }, [selectedInstallation, selectedInstallationAddress]);

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {/* ── CRM Context: 1 columna en móvil (evita que el nombre se trunque a "S." "C." ...),
             2 columnas en desktop. ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 w-full">
          <div className="min-w-0">
            <Label className={labelClassName}>Cuenta</Label>
            <div className="flex gap-0.5">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                value={crmContext.accountId || ""}
                options={crmAccounts.map((a) => ({
                  id: a.id,
                  label: a.name,
                  description: a.type ? (a.type === "client" ? "Cliente" : "Prospecto") : undefined,
                }))}
                placeholder="Seleccionar..."
                disabled={isLocked}
                triggerClassName={searchableTriggerClassName}
                onChange={(val) => {
                  const account = crmAccounts.find((a) => a.id === val);
                  saveCrmContext({ accountId: val, installationId: "", contactId: "", dealId: "" });
                  if (account) {
                    setQuoteForm((prev: any) => ({ ...prev, clientName: account.name }));
                    setQuoteDirty(true);
                  }
                }}
              />
              </div>
              {crmContext.accountId && (
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" title="Ver cuenta" asChild>
                  <Link href={`/crm/accounts/${crmContext.accountId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={isLocked} onClick={() => { resetInlineForm(); setInlineCreateType("account"); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="min-w-0">
            <Label className={labelClassName}>Instalación</Label>
            <div className="flex gap-0.5">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                value={crmContext.installationId || ""}
                options={crmInstallations.map((i) => ({ id: i.id, label: i.name, description: i.city || undefined }))}
                placeholder="Seleccionar..."
                disabled={!crmContext.accountId || isLocked}
                triggerClassName={searchableTriggerClassName}
                onChange={(val) => saveCrmContext({ installationId: val })}
              />
              </div>
              {crmContext.installationId && (
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" title="Ver instalación" asChild>
                  <Link href={`/crm/installations/${crmContext.installationId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!crmContext.accountId || isLocked} onClick={() => { resetInlineForm(); setInlineCreateType("installation"); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="min-w-0">
            <Label className={labelClassName}>Contacto</Label>
            <div className="flex gap-0.5">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                value={crmContext.contactId || ""}
                options={crmContacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim(), description: c.email || undefined }))}
                placeholder="Seleccionar..."
                disabled={!crmContext.accountId || isLocked}
                triggerClassName={searchableTriggerClassName}
                onChange={(val) => saveCrmContext({ contactId: val })}
              />
              </div>
              {crmContext.contactId && (
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" title="Ver contacto" asChild>
                  <Link href={`/crm/contacts/${crmContext.contactId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!crmContext.accountId || isLocked} onClick={() => { resetInlineForm(); setInlineCreateType("contact"); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="min-w-0">
            <Label className={labelClassName}>Negocio</Label>
            <div className="flex gap-0.5">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                value={crmContext.dealId || ""}
                options={crmDeals.map((d) => ({ id: d.id, label: d.title }))}
                placeholder="Seleccionar..."
                disabled={!crmContext.accountId || isLocked}
                triggerClassName={searchableTriggerClassName}
                onChange={(val) => saveCrmContext({ dealId: val })}
              />
              </div>
              {crmContext.dealId && (
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" title="Ver negocio" asChild>
                  <Link href={`/crm/deals/${crmContext.dealId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={!crmContext.accountId || isLocked} onClick={() => { resetInlineForm(); setInlineCreateType("deal"); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* ── Inline Create Modal ── */}
        <Dialog open={!!inlineCreateType} onOpenChange={(v) => !v && setInlineCreateType(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {inlineCreateType === "account" && "Nueva cuenta"}
                {inlineCreateType === "installation" && "Nueva instalación"}
                {inlineCreateType === "contact" && "Nuevo contacto"}
                {inlineCreateType === "deal" && "Nuevo negocio"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {(inlineCreateType === "account" || inlineCreateType === "installation") && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Nombre *</Label>
                    <Input
                      value={inlineForm.name}
                      onChange={(e) => setInlineForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder={inlineCreateType === "account" ? "Nombre de empresa" : "Nombre de instalación"}
                      className="bg-card"
                      autoFocus
                    />
                  </div>
                  {inlineCreateType === "installation" && (
                    <div className="space-y-1.5">
                      <Label className="text-sm">Dirección * (Google Maps)</Label>
                      <AddressAutocomplete
                        value={inlineForm.address}
                        onChange={(result: AddressResult) =>
                          setInlineForm((p) => ({
                            ...p,
                            address: result.address,
                            city: result.city ?? p.city,
                            commune: result.commune ?? p.commune,
                            lat: result.lat,
                            lng: result.lng,
                          }))
                        }
                        placeholder="Buscar dirección en Google Maps..."
                        className="bg-card"
                        showMap={false}
                      />
                      <MapsUrlPasteInput
                        onResolve={(result) =>
                          setInlineForm((p) => ({
                            ...p,
                            address: result.address,
                            city: result.city ?? p.city,
                            commune: result.commune ?? p.commune,
                            lat: result.lat,
                            lng: result.lng,
                          }))
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {inlineCreateType === "contact" && (
                <>
                  <p className="text-sm text-status-warn-fg dark:text-status-warn-fg bg-status-warn-soft border border-status-warn-border rounded-md px-3 py-2">
                    El email identifica al contacto. Es obligatorio y evita duplicados.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Nombre *</Label>
                      <Input value={inlineForm.firstName} onChange={(e) => setInlineForm((p) => ({ ...p, firstName: e.target.value }))} className="bg-card" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Apellido *</Label>
                      <Input value={inlineForm.lastName} onChange={(e) => setInlineForm((p) => ({ ...p, lastName: e.target.value }))} className="bg-card" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Email *</Label>
                    <Input value={inlineForm.email} onChange={(e) => setInlineForm((p) => ({ ...p, email: e.target.value }))} placeholder="correo@empresa.com" className="bg-card" />
                  </div>
                </>
              )}
              {inlineCreateType === "deal" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Título del negocio</Label>
                  <Input
                    value={inlineForm.title}
                    onChange={(e) => setInlineForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder={`Oportunidad ${quoteForm.clientName}`}
                    className="bg-card"
                    autoFocus
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInlineCreateType(null)}>Cancelar</Button>
              <Button
                onClick={createInline}
                disabled={
                  inlineCreating ||
                  (inlineCreateType === "account" && !inlineForm.name.trim()) ||
                  (inlineCreateType === "installation" && (!inlineForm.name.trim() || !inlineForm.address.trim())) ||
                  (inlineCreateType === "contact" && (!inlineForm.firstName.trim() || !inlineForm.lastName.trim() || !inlineForm.email.trim()))
                }
              >
                {inlineCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Quote name + Date + Currency + save indicator — compact row ── */}
        <div className="grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <div className="min-w-0">
            <Label className={labelClassName}>Nombre cotización</Label>
            <Input
              value={quoteForm.name}
              onChange={(e) => {
                setQuoteForm((prev: any) => ({ ...prev, name: e.target.value }));
                setQuoteDirty(true);
              }}
              placeholder="Ej: Propuesta guardias planta norte"
              className={cn("h-8", inputClassName)}
              disabled={isLocked}
            />
          </div>
          <div className="min-w-0">
            <Label className={labelClassName}>Válida hasta</Label>
            <Input
              type="date"
              value={quoteForm.validUntil}
              onChange={(e) => {
                setQuoteForm((prev: any) => ({ ...prev, validUntil: e.target.value }));
                setQuoteDirty(true);
              }}
              className={cn("h-8 text-foreground [color-scheme:dark]", inputClassName)}
              disabled={isLocked}
            />
          </div>
          <div className="shrink-0">
            <Label className={labelClassName}>Moneda</Label>
            <div className="flex gap-0.5">
              {["CLP", "UF"].map((cur) => (
                <button
                  key={cur}
                  type="button"
                  disabled={isLocked}
                  onClick={() => saveCrmContext({ currency: cur })}
                  className={cn(
                    "rounded-md px-3 h-8 text-sm font-medium border transition-colors",
                    crmContext.currency === cur
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-card text-muted-foreground border-input hover:bg-accent/50"
                  )}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
          <span className="text-sm text-muted-foreground shrink-0 pb-1 sm:self-end lg:pb-2">
            {savingQuote ? "Guardando..." : quoteDirty ? "" : "Guardado ✓"}
          </span>
        </div>

        {quoteError && (
          <div className="text-sm text-status-danger-fg">{quoteError}</div>
        )}
      </div>

      {crmContext.installationId && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{selectedInstallationAddress || "Sin dirección registrada"}</span>
          {selectedInstallationMapsUrl && (
            <button
              type="button"
              onClick={() => window.open(selectedInstallationMapsUrl, "_blank", "noopener,noreferrer")}
              className="shrink-0 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
