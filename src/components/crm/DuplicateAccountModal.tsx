/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, GitMerge, Crown, Trash2, Users, Briefcase,
  MapPin, AlertTriangle, ChevronLeft, ChevronRight, Check, FileText,
} from "lucide-react";
import { toast } from "sonner";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
type AccountResult = {
  id: string; name: string; rut: string | null; legalName: string | null;
  type: string; status: string; isActive: boolean; createdAt: string; score: number;
  _count: { contacts: number; deals: number; installations: number };
};

type ContactRow = { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleTitle?: string | null; isPrimary?: boolean };
type DealRow = { id: string; title: string; status: string; amount: number; stage?: { name: string } | null };
type InstallationRow = { id: string; name: string; address?: string | null; commune?: string | null; status?: "prospect" | "active" | "inactive" };
type QuoteRow = { id: string; code: string; status: string; clientName?: string | null; monthlyCost: number; createdAt: string };

type PreviewAccount = AccountResult & {
  rut: string | null; legalName: string | null; legalRepresentativeName?: string | null;
  legalRepresentativeRut?: string | null; notaryName?: string | null; notaryDate?: string | null;
  industry?: string | null; segment?: string | null; website?: string | null;
  address?: string | null; commune?: string | null; notes?: string | null;
  startDate?: string | null; endDate?: string | null;
  contacts: ContactRow[]; deals: DealRow[]; installations: InstallationRow[]; quotes: QuoteRow[];
};

type SimilarityAlert = { masterRecordId: string; duplicateRecordId: string; reason: string };
type Similarities = { contacts: SimilarityAlert[]; installations: SimilarityAlert[]; deals: SimilarityAlert[] };

type PreviewData = { master: PreviewAccount; duplicate: PreviewAccount; similarities: Similarities };

type FieldOverrides = Record<string, string | null>;

type WizardStep = "search" | "fields" | "records" | "confirm";

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void;
  initialQuery?: string; onMerged?: () => void;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const COMPARABLE_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "rut", label: "RUT" },
  { key: "legalName", label: "Razón social" },
  { key: "legalRepresentativeName", label: "Representante legal" },
  { key: "legalRepresentativeRut", label: "RUT representante" },
  { key: "notaryName", label: "Notaría" },
  { key: "notaryDate", label: "Fecha escritura" },
  { key: "industry", label: "Industria" },
  { key: "segment", label: "Segmento" },
  { key: "website", label: "Página web" },
  { key: "address", label: "Dirección" },
  { key: "commune", label: "Comuna" },
];

function lifecycleLabel(a: AccountResult) {
  if (a.status === "prospect" || a.type === "prospect") return { label: "Prospecto", cls: "border-amber-500/30 text-amber-400" };
  if (a.isActive) return { label: "Cliente activo", cls: "border-emerald-500/30 text-emerald-400" };
  return { label: "Ex cliente", cls: "border-rose-500/30 text-rose-400" };
}

function val(obj: Record<string, any>, key: string): string {
  const v = obj[key];
  return v != null && v !== "" ? String(v) : "";
}

// ──────────────────────────────────────────────
// Step 0 — Search with role assignment
// ──────────────────────────────────────────────
function SearchStep({
  query, setQuery, results, loading, masterAccount, duplicateAccount, onSelect,
}: {
  query: string; setQuery: (v: string) => void; results: AccountResult[]; loading: boolean;
  masterAccount: AccountResult | null; duplicateAccount: AccountResult | null;
  onSelect: (acc: AccountResult, role: "master" | "duplicate") => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre de cuenta..." className="pl-9" autoFocus />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {results.length === 0 && query.length >= 2 && !loading && (
        <p className="text-center py-6 text-sm text-muted-foreground">
          No se encontraron cuentas similares para <strong>&quot;{query}&quot;</strong>
        </p>
      )}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{results.length} cuenta{results.length !== 1 ? "s" : ""} encontrada{results.length !== 1 ? "s" : ""}. Asigna un rol a cada cuenta.</p>
          {results.map((acc) => {
            const isMaster = masterAccount?.id === acc.id;
            const isDuplicate = duplicateAccount?.id === acc.id;
            const lc = lifecycleLabel(acc);
            return (
              <div key={acc.id} className={`rounded-lg border p-3 transition-all ${isMaster ? "border-emerald-500/50 bg-emerald-500/5" : isDuplicate ? "border-rose-500/50 bg-rose-500/5" : "border-border"}`}>
                {(isMaster || isDuplicate) && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mb-1.5 inline-flex items-center gap-1 ${isMaster ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                    {isMaster ? <><Crown className="h-2.5 w-2.5" /> MASTER (se conserva)</> : <><Trash2 className="h-2.5 w-2.5" /> DUPLICADO (se elimina)</>}
                  </span>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{acc.name}</p>
                    {acc.legalName && <p className="text-xs text-muted-foreground">{acc.legalName}</p>}
                    {acc.rut && <p className="text-xs text-muted-foreground font-mono">{acc.rut}</p>}
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{acc._count.contacts}</span>
                      <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{acc._count.deals}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{acc._count.installations}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${lc.cls}`}>{lc.label}</Badge>
                </div>
                {!isMaster && !isDuplicate ? (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" onClick={() => onSelect(acc, "master")}>
                      <Crown className="h-3 w-3 mr-1" /> Conservar
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/10" onClick={() => onSelect(acc, "duplicate")}>
                      <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="mt-1 h-6 text-xs text-muted-foreground px-2"
                    onClick={() => onSelect(acc, isMaster ? "duplicate" : "master")}>Cambiar rol</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Step 1 — Field Comparison
// ──────────────────────────────────────────────
function FieldsStep({ preview, fieldOverrides, setFieldOverrides }: {
  preview: PreviewData;
  fieldOverrides: FieldOverrides;
  setFieldOverrides: (f: FieldOverrides) => void;
}) {
  const { master, duplicate } = preview;
  const toggle = (key: string, source: "master" | "duplicate") => {
    const dupVal = val(duplicate as any, key);
    if (source === "duplicate" && dupVal) {
      setFieldOverrides({ ...fieldOverrides, [key]: dupVal });
    } else {
      const next = { ...fieldOverrides };
      delete next[key];
      setFieldOverrides(next);
    }
  };

  const autoSelected: Record<string, "master" | "duplicate"> = {};
  for (const f of COMPARABLE_FIELDS) {
    const mv = val(master as any, f.key);
    const dv = val(duplicate as any, f.key);
    if (!mv && dv) { autoSelected[f.key] = "duplicate"; }
    else { autoSelected[f.key] = "master"; }
  }

  const getSelected = (key: string): "master" | "duplicate" => {
    if (fieldOverrides[key] !== undefined) return "duplicate";
    return autoSelected[key] ?? "master";
  };

  const fieldsWithDiff = COMPARABLE_FIELDS.filter(f => {
    const mv = val(master as any, f.key);
    const dv = val(duplicate as any, f.key);
    return mv !== dv; // only show fields that differ
  });

  if (fieldsWithDiff.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
        Ambas cuentas tienen los mismos valores en todos los campos. No hay nada que comparar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Selecciona qué valor usar para cada campo. Haz clic en la columna que prefieras.
        Los campos iguales en ambas cuentas no se muestran.
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[140px_1fr_1fr] bg-muted/50 text-xs font-medium text-muted-foreground">
          <div className="px-3 py-2">Campo</div>
          <div className="px-3 py-2 border-l border-border flex items-center gap-1.5">
            <Crown className="h-3 w-3 text-emerald-400" /> {master.name}
          </div>
          <div className="px-3 py-2 border-l border-border flex items-center gap-1.5">
            <Trash2 className="h-3 w-3 text-rose-400" /> {duplicate.name}
          </div>
        </div>
        {/* Rows */}
        {fieldsWithDiff.map((f, i) => {
          const mv = val(master as any, f.key);
          const dv = val(duplicate as any, f.key);
          const selected = getSelected(f.key);
          return (
            <div key={f.key} className={`grid grid-cols-[140px_1fr_1fr] text-sm ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
              <div className="px-3 py-2.5 text-xs font-medium text-muted-foreground flex items-center">{f.label}</div>
              {/* Master value */}
              <button
                onClick={() => toggle(f.key, "master")}
                className={`px-3 py-2.5 border-l border-border text-left hover:bg-emerald-500/5 transition-colors text-xs ${selected === "master" ? "bg-emerald-500/10 text-emerald-300 font-medium" : "text-muted-foreground"}`}
              >
                {selected === "master" && <Check className="inline h-3 w-3 mr-1 text-emerald-400" />}
                {mv || <span className="italic opacity-40">vacío</span>}
              </button>
              {/* Duplicate value */}
              <button
                onClick={() => toggle(f.key, "duplicate")}
                className={`px-3 py-2.5 border-l border-border text-left hover:bg-rose-500/5 transition-colors text-xs ${selected === "duplicate" ? "bg-rose-500/10 text-rose-300 font-medium" : "text-muted-foreground"}`}
              >
                {selected === "duplicate" && <Check className="inline h-3 w-3 mr-1 text-rose-400" />}
                {dv || <span className="italic opacity-40">vacío</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Step 2 — Child Records Review
// ──────────────────────────────────────────────
function RecordsStep({ preview, excludeContactIds, setExcludeContactIds, excludeDealIds, setExcludeDealIds, excludeInstallationIds, setExcludeInstallationIds }: {
  preview: PreviewData;
  excludeContactIds: string[]; setExcludeContactIds: (v: string[]) => void;
  excludeDealIds: string[]; setExcludeDealIds: (v: string[]) => void;
  excludeInstallationIds: string[]; setExcludeInstallationIds: (v: string[]) => void;
}) {
  const { duplicate, similarities } = preview;
  const toggle = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const dupContactAlerts = new Map(similarities.contacts.map(a => [a.duplicateRecordId, a.reason]));
  const dupInstallationAlerts = new Map(similarities.installations.map(a => [a.duplicateRecordId, a.reason]));
  const dupDealAlerts = new Map(similarities.deals.map(a => [a.duplicateRecordId, a.reason]));

  const hasRecords = duplicate.contacts.length + duplicate.deals.length + duplicate.installations.length + duplicate.quotes.length > 0;

  if (!hasRecords) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
        La cuenta duplicada no tiene registros asociados. Solo se eliminará la cuenta.
      </div>
    );
  }

  const Section = ({ title, icon: Icon, items, excludeIds, setExcludeIds, renderItem, alertMap }: {
    title: string; icon: any; items: any[]; excludeIds: string[]; setExcludeIds: (v: string[]) => void;
    renderItem: (item: any) => React.ReactNode; alertMap: Map<string, string>;
  }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" /> {title} del duplicado → se moverán al master
          </p>
          <span className="text-xs text-muted-foreground">{items.length - excludeIds.filter(id => items.find((i: any) => i.id === id)).length}/{items.length} seleccionados</span>
        </div>
        <div className="space-y-1.5">
          {items.map((item: any) => {
            const excluded = excludeIds.includes(item.id);
            const alert = alertMap.get(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id, excludeIds, setExcludeIds)}
                className={`w-full text-left rounded-lg border p-2.5 transition-all text-xs ${excluded ? "border-border bg-muted/20 opacity-50" : alert ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card hover:border-primary/30"}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${excluded ? "border-border bg-muted" : "border-primary bg-primary/10"}`}>
                    {!excluded && <Check className="h-2.5 w-2.5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {renderItem(item)}
                    {alert && !excluded && (
                      <p className="text-amber-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {alert}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Revisa los registros del duplicado. Los marcados (✓) se moverán al master. Desmarca los que quieras eliminar.
        <span className="text-amber-400"> ⚠️ = posible duplicado detectado en el master.</span>
      </p>

      <Section title="Contactos" icon={Users} items={duplicate.contacts}
        excludeIds={excludeContactIds} setExcludeIds={setExcludeContactIds}
        alertMap={dupContactAlerts}
        renderItem={(c: ContactRow) => (
          <>
            <p className="font-medium">{c.firstName} {c.lastName} {c.isPrimary && <span className="text-primary">(Principal)</span>}</p>
            <p className="text-muted-foreground">{[c.email, c.phone, c.roleTitle].filter(Boolean).join(" · ")}</p>
          </>
        )}
      />

      <Section title="Negocios" icon={Briefcase} items={duplicate.deals}
        excludeIds={excludeDealIds} setExcludeIds={setExcludeDealIds}
        alertMap={dupDealAlerts}
        renderItem={(d: DealRow) => (
          <>
            <p className="font-medium">{d.title}</p>
            <p className="text-muted-foreground">{d.stage?.name} · ${Number(d.amount).toLocaleString("es-CL")}</p>
          </>
        )}
      />

      <Section title="Instalaciones" icon={MapPin} items={duplicate.installations}
        excludeIds={excludeInstallationIds} setExcludeIds={setExcludeInstallationIds}
        alertMap={dupInstallationAlerts}
        renderItem={(i: InstallationRow) => (
          <>
            <p className="font-medium">{i.name} {i.status === "active" ? <span className="text-emerald-400">(Activa)</span> : i.status === "inactive" ? <span className="text-muted-foreground">(Inactiva)</span> : <span className="text-amber-400">(Prospecto)</span>}</p>
            {i.address && <p className="text-muted-foreground">{i.address}{i.commune ? `, ${i.commune}` : ""}</p>}
          </>
        )}
      />

      {duplicate.quotes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <FileText className="h-3.5 w-3.5" /> Cotizaciones — se reasignarán automáticamente al master
          </p>
          <div className="space-y-1">
            {duplicate.quotes.map((q: QuoteRow) => (
              <div key={q.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <span className="font-medium">{q.code}</span>
                <span className="text-muted-foreground ml-1.5">· {q.status} · ${Number(q.monthlyCost).toLocaleString("es-CL")}/mes</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Modal
// ──────────────────────────────────────────────
const STEPS: { id: WizardStep; label: string }[] = [
  { id: "search", label: "Buscar" },
  { id: "fields", label: "Campos" },
  { id: "records", label: "Registros" },
  { id: "confirm", label: "Confirmar" },
];

export function DuplicateAccountModal({ open, onOpenChange, initialQuery = "", onMerged }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AccountResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<WizardStep>("search");
  const [masterAccount, setMasterAccount] = useState<AccountResult | null>(null);
  const [duplicateAccount, setDuplicateAccount] = useState<AccountResult | null>(null);

  // Preview state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Wizard selections
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const [excludeContactIds, setExcludeContactIds] = useState<string[]>([]);
  const [excludeDealIds, setExcludeDealIds] = useState<string[]>([]);
  const [excludeInstallationIds, setExcludeInstallationIds] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/accounts/duplicates?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) setResults(data.data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open && initialQuery) { setQuery(initialQuery); void search(initialQuery); }
  }, [open, initialQuery, search]);

  useEffect(() => {
    const timer = setTimeout(() => { if (query.length >= 2) void search(query); else setResults([]); }, 350);
    return () => clearTimeout(timer);
  }, [query, search]);

  const loadPreview = useCallback(async (masterId: string, duplicateId: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/crm/accounts/merge-preview?masterId=${masterId}&duplicateId=${duplicateId}`);
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
        // Auto-init field overrides for empty master fields
        const overrides: FieldOverrides = {};
        const dup = data.data.duplicate;
        const master = data.data.master;
        for (const f of COMPARABLE_FIELDS) {
          const mv = val(master, f.key);
          const dv = val(dup, f.key);
          if (!mv && dv) overrides[f.key] = dv;
        }
        setFieldOverrides(overrides);
      }
    } catch { toast.error("Error al cargar la vista previa"); }
    finally { setPreviewLoading(false); }
  }, []);

  const handleSelect = (account: AccountResult, role: "master" | "duplicate") => {
    if (role === "master") {
      setMasterAccount(account);
      if (duplicateAccount?.id === account.id) setDuplicateAccount(null);
    } else {
      setDuplicateAccount(account);
      if (masterAccount?.id === account.id) setMasterAccount(null);
    }
  };

  const canAdvance = masterAccount && duplicateAccount && masterAccount.id !== duplicateAccount.id;

  const goToFields = async () => {
    if (!canAdvance) return;
    await loadPreview(masterAccount!.id, duplicateAccount!.id);
    setStep("fields");
  };

  const handleMerge = async () => {
    if (!masterAccount || !duplicateAccount) return;
    setMerging(true);
    try {
      const res = await fetch("/api/crm/accounts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterId: masterAccount.id,
          duplicateId: duplicateAccount.id,
          fieldOverrides,
          excludeContactIds,
          excludeDealIds,
          excludeInstallationIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al fusionar");
      toast.success(data.message || "Cuentas fusionadas exitosamente");
      onMerged?.();
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo fusionar");
    } finally { setMerging(false); }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetAll, 300);
  };

  const resetAll = () => {
    setQuery(initialQuery || ""); setResults([]); setStep("search");
    setMasterAccount(null); setDuplicateAccount(null); setPreview(null);
    setFieldOverrides({}); setExcludeContactIds([]); setExcludeDealIds([]); setExcludeInstallationIds([]);
  };

  const stepIndex = STEPS.findIndex(s => s.id === step);

  // Confirm summary
  const totalMovingContacts = preview ? preview.duplicate.contacts.length - excludeContactIds.filter(id => preview.duplicate.contacts.find(c => c.id === id)).length : 0;
  const totalMovingDeals = preview ? preview.duplicate.deals.length - excludeDealIds.filter(id => preview.duplicate.deals.find(d => d.id === id)).length : 0;
  const totalMovingInstallations = preview ? preview.duplicate.installations.length - excludeInstallationIds.filter(id => preview.duplicate.installations.find(i => i.id === id)).length : 0;
  const fieldOverrideCount = Object.keys(fieldOverrides).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            Fusionar cuentas duplicadas
          </DialogTitle>
          {/* Progress bar */}
          <div className="flex items-center gap-1 pt-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 flex-1">
                <div className={`flex-1 h-1 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} />
                <span className={`text-[10px] whitespace-nowrap ${i === stepIndex ? "text-primary font-semibold" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1">
          {step === "search" && (
            <SearchStep query={query} setQuery={setQuery} results={results} loading={loading}
              masterAccount={masterAccount} duplicateAccount={duplicateAccount} onSelect={handleSelect} />
          )}

          {step === "fields" && (previewLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando comparación...
            </div>
          ) : preview ? (
            <FieldsStep preview={preview} fieldOverrides={fieldOverrides} setFieldOverrides={setFieldOverrides} />
          ) : null)}

          {step === "records" && preview && (
            <RecordsStep preview={preview}
              excludeContactIds={excludeContactIds} setExcludeContactIds={setExcludeContactIds}
              excludeDealIds={excludeDealIds} setExcludeDealIds={setExcludeDealIds}
              excludeInstallationIds={excludeInstallationIds} setExcludeInstallationIds={setExcludeInstallationIds} />
          )}

          {step === "confirm" && preview && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Resumen de la fusión</p>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="text-muted-foreground font-medium">✅ Cuenta que se conserva (master)</p>
                    <p className="font-semibold">{preview.master.name}</p>
                    {preview.master.rut && <p className="text-muted-foreground">{preview.master.rut}</p>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground font-medium">🗑️ Cuenta que se elimina</p>
                    <p className="font-semibold">{preview.duplicate.name}</p>
                    {preview.duplicate.rut && <p className="text-muted-foreground">{preview.duplicate.rut}</p>}
                  </div>
                </div>
                {fieldOverrideCount > 0 && (
                  <div className="border-t border-border pt-3 space-y-1 text-xs">
                    <p className="text-muted-foreground font-medium">Campos a actualizar en el master ({fieldOverrideCount}):</p>
                    {Object.entries(fieldOverrides).map(([k, v]) => {
                      const label = COMPARABLE_FIELDS.find(f => f.key === k)?.label ?? k;
                      return <p key={k} className="text-foreground">• {label}: <span className="font-medium">{v}</span></p>;
                    })}
                  </div>
                )}
                <div className="border-t border-border pt-3 text-xs space-y-0.5 text-muted-foreground">
                  {totalMovingContacts > 0 && <p>• {totalMovingContacts} contacto{totalMovingContacts !== 1 ? "s" : ""} se moverán</p>}
                  {totalMovingDeals > 0 && <p>• {totalMovingDeals} negocio{totalMovingDeals !== 1 ? "s" : ""} se moverán</p>}
                  {totalMovingInstallations > 0 && <p>• {totalMovingInstallations} instalación{totalMovingInstallations !== 1 ? "es" : ""} se moverán</p>}
                  {preview.duplicate.quotes.length > 0 && <p>• {preview.duplicate.quotes.length} cotización{preview.duplicate.quotes.length !== 1 ? "es" : ""} se reasignarán</p>}
                  {excludeContactIds.length + excludeDealIds.length + excludeInstallationIds.length > 0 && (
                    <p className="text-rose-400">• {excludeContactIds.length + excludeDealIds.length + excludeInstallationIds.length} registros excluidos se eliminarán</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Esta acción es irreversible. La cuenta &quot;{preview.duplicate.name}&quot; será eliminada permanentemente.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-4 mt-0">
          {step !== "search" ? (
            <Button variant="outline" onClick={() => setStep(STEPS[stepIndex - 1].id)} disabled={merging}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          )}

          {step === "search" && (
            <Button onClick={goToFields} disabled={!canAdvance || previewLoading}>
              {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-1" />}
              Comparar campos
            </Button>
          )}
          {step === "fields" && (
            <Button onClick={() => setStep("records")} disabled={previewLoading}>
              <ChevronRight className="h-4 w-4 mr-1" /> Revisar registros
            </Button>
          )}
          {step === "records" && (
            <Button onClick={() => setStep("confirm")}>
              <ChevronRight className="h-4 w-4 mr-1" /> Confirmar
            </Button>
          )}
          {step === "confirm" && (
            <Button onClick={handleMerge} disabled={merging} className="bg-primary hover:bg-primary/90">
              {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4 mr-1.5" />}
              Fusionar cuentas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
