"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardCheck,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Camera,
  X,
  FileText,
  XCircle,
  ChevronDown,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type {
  ChecklistItem,
  ChecklistResult,
  Finding,
  VisitData,
  InstalacionDocumentType,
  DocumentCheckResult,
  GuardDocCheckResult,
  DotacionGuard,
  PendingFinding,
} from "./types";
import { FindingModal } from "./FindingModal";
import { ResolveFindingModal } from "./ResolveFindingModal";

type Props = {
  visit: VisitData;
  checklistItems: ChecklistItem[];
  checklistResults: ChecklistResult[];
  openFindings: Finding[];
  findingsCount: number;
  bookUpToDate: boolean | null;
  bookLastEntryDate: string;
  bookNotes: string;
  bookPhotoFile: File | null;
  bookPhotoPreview: string | null;
  puestoPhotoFile: File | null;
  puestoPhotoPreview: string | null;
  documentTypes: InstalacionDocumentType[];
  documentResults: DocumentCheckResult[];
  onChecklistChange: (results: ChecklistResult[]) => void;
  onBookChange: (data: {
    bookUpToDate: boolean | null;
    bookLastEntryDate: string;
    bookNotes: string;
  }) => void;
  onBookPhotoChange: (file: File | null, preview: string | null) => void;
  onPuestoPhotoChange: (file: File | null, preview: string | null) => void;
  onDocumentResultsChange: (results: DocumentCheckResult[]) => void;
  globalDocumentTypes?: InstalacionDocumentType[];
  globalDocumentResults?: DocumentCheckResult[];
  onGlobalDocumentResultsChange?: (results: DocumentCheckResult[]) => void;
  guardDocTypes?: InstalacionDocumentType[];
  guardDocResults?: GuardDocCheckResult[];
  onGuardDocResultsChange?: (results: GuardDocCheckResult[]) => void;
  dotacionGuards?: DotacionGuard[];
  onFindingCreated: (finding: Finding) => void;
  onFindingStatusChange: (findingId: string, status: string) => void;
  onAddPendingFinding: (pf: PendingFinding) => void;
  onRemovePendingFinding: (source: string) => void;
  onFindingResolvedLocally?: (findingId: string) => void;
  onNext: () => void;
  onPrev: () => void;
  saving: boolean;
  mode?: "regular" | "vra";
};

export function Step3Checklist({
  visit,
  checklistItems,
  checklistResults,
  openFindings,
  findingsCount,
  bookUpToDate,
  bookLastEntryDate,
  bookNotes,
  bookPhotoPreview,
  puestoPhotoFile,
  puestoPhotoPreview,
  documentTypes,
  documentResults,
  onChecklistChange,
  onBookChange,
  onBookPhotoChange,
  onPuestoPhotoChange,
  onDocumentResultsChange,
  globalDocumentTypes = [],
  globalDocumentResults = [],
  onGlobalDocumentResultsChange,
  guardDocTypes = [],
  guardDocResults = [],
  onGuardDocResultsChange,
  dotacionGuards = [],
  onFindingCreated,
  onFindingStatusChange,
  onAddPendingFinding,
  onRemovePendingFinding,
  onFindingResolvedLocally,
  onNext,
  onPrev,
  saving,
  mode = "regular",
}: Props) {
  const [showFindingModal, setShowFindingModal] = useState(false);
  const [resolvingFinding, setResolvingFinding] = useState<Finding | null>(null);
  const bookPhotoInputRef = useRef<HTMLInputElement>(null);
  const puestoPhotoInputRef = useRef<HTMLInputElement>(null);
  const docPhotoInputRef = useRef<HTMLInputElement>(null);
  const [activeDocCode, setActiveDocCode] = useState<string | null>(null);
  const [expandedGuardId, setExpandedGuardId] = useState<string | null>(null);
  const [activeGuardDoc, setActiveGuardDoc] = useState<{ guardId: string; code: string } | null>(null);
  const guardDocPhotoInputRef = useRef<HTMLInputElement>(null);

  // Merge global documents into installation documents list
  const allInstDocs: InstalacionDocumentType[] = [
    ...globalDocumentTypes.map((d) => ({ ...d, label: `${d.label} (Global)` })),
    ...documentTypes,
  ];
  const allInstResults: DocumentCheckResult[] = [
    ...globalDocumentResults,
    ...documentResults,
  ];

  // Map de open findings (visitas previas) por doc-key, para dedup visual con
  // pendingFindings del Step 3. Si hay match, el supervisor ya ve el hallazgo
  // en la sección "Hallazgos pendientes" — no mostramos otro mensaje en el doc card.
  // Backend dedupea por tipoDocId/guardiaDocCode al persistir en checkout.
  const docKeyForType = (t: InstalacionDocumentType): string =>
    t.tipoDocId ? `tipo:${t.tipoDocId}` : `code:${t.code}`;
  const openFindingDocKeys = new Set<string>();
  for (const f of openFindings) {
    if (f.tipoDocId) openFindingDocKeys.add(`tipo:${f.tipoDocId}`);
    if (f.guardiaDocCode && !f.guardId) openFindingDocKeys.add(`code:${f.guardiaDocCode}`);
  }
  const guardDocKey = (code: string, guardId: string) => `gd:${code}:${guardId}`;
  const openGuardFindingKeys = new Set<string>();
  for (const f of openFindings) {
    if (f.guardiaDocCode && f.guardId) {
      openGuardFindingKeys.add(guardDocKey(f.guardiaDocCode, f.guardId));
    }
  }

  // Guard document handlers — pending findings, persisted at checkout
  function handleGuardDocToggle(guardId: string, code: string, present: boolean) {
    const sourceKey = `guardia:${code}:${guardId}`;
    const guardResult = guardDocResults.find((g) => g.guardiaId === guardId);
    const existingDoc = guardResult?.docs.find((d) => d.code === code);
    const localId = existingDoc?.pendingLocalId ?? crypto.randomUUID();

    const updated = guardDocResults.map((g) => {
      if (g.guardiaId !== guardId) return g;
      return {
        ...g,
        docs: g.docs.map((d) =>
          d.code === code
            ? {
                ...d,
                isChecked: present,
                pendingLocalId: present ? null : localId,
              }
            : d,
        ),
      };
    });
    onGuardDocResultsChange?.(updated);

    if (!present) {
      const docType = guardDocTypes.find((d) => d.code === code);
      const guard = dotacionGuards.find((g) => g.guardId === guardId);
      const docLabel = docType?.label ?? code;
      const guardLabel = guard?.guardName ?? guardId;
      onAddPendingFinding({
        localId,
        category: "documentation",
        severity: "critical",
        description: `${docLabel} no presente — Guardia: ${guardLabel}`,
        guardId,
        tipoDocId: null,
        guardiaDocCode: code,
        source: sourceKey,
      });
    } else {
      onRemovePendingFinding(sourceKey);
    }
  }

  function handleGuardDocPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeGuardDoc) return;
    const { guardId, code } = activeGuardDoc;
    const updated = guardDocResults.map((g) => {
      if (g.guardiaId !== guardId) return g;
      return {
        ...g,
        docs: g.docs.map((d) => {
          if (d.code !== code) return d;
          if (d.photoPreview) URL.revokeObjectURL(d.photoPreview);
          return { ...d, photoFile: file, photoPreview: URL.createObjectURL(file) };
        }),
      };
    });
    onGuardDocResultsChange?.(updated);
    if (guardDocPhotoInputRef.current) guardDocPhotoInputRef.current.value = "";
    setActiveGuardDoc(null);
  }

  function removeGuardDocPhoto(guardId: string, code: string) {
    const updated = guardDocResults.map((g) => {
      if (g.guardiaId !== guardId) return g;
      return {
        ...g,
        docs: g.docs.map((d) => {
          if (d.code !== code) return d;
          if (d.photoPreview) URL.revokeObjectURL(d.photoPreview);
          return { ...d, photoFile: null, photoPreview: null };
        }),
      };
    });
    onGuardDocResultsChange?.(updated);
  }

  function toggleChecklistItem(itemId: string) {
    const existing = checklistResults.find((r) => r.checklistItemId === itemId);
    if (existing) {
      onChecklistChange(
        checklistResults.map((r) =>
          r.checklistItemId === itemId ? { ...r, isChecked: !r.isChecked } : r,
        ),
      );
    } else {
      onChecklistChange([
        ...checklistResults,
        { checklistItemId: itemId, isChecked: true, findingId: null },
      ]);
    }
  }

  function getItemChecked(itemId: string): boolean {
    return checklistResults.find((r) => r.checklistItemId === itemId)?.isChecked ?? false;
  }

  // Determine if a doc code belongs to global layer
  const globalDocCodes = new Set(globalDocumentTypes.map((d) => d.code));

  function isGlobalDoc(code: string): boolean {
    return globalDocCodes.has(code);
  }

  // Document type handlers — unified Sí/No + auto-finding
  function updateDocResult(code: string, updates: Partial<DocumentCheckResult>) {
    if (isGlobalDoc(code)) {
      onGlobalDocumentResultsChange?.(
        globalDocumentResults.map((dr) =>
          dr.code === code ? { ...dr, ...updates } : dr,
        ),
      );
    } else {
      onDocumentResultsChange(
        documentResults.map((dr) =>
          dr.code === code ? { ...dr, ...updates } : dr,
        ),
      );
    }
  }

  function handleDocCheck(code: string, present: boolean) {
    const isGlobal = isGlobalDoc(code);
    const targetResults = isGlobal ? globalDocumentResults : documentResults;
    const sourceKey = `${isGlobal ? "global" : "instalacion"}:${code}`;

    const existingResult = targetResults.find((dr) => dr.code === code);
    const localId =
      existingResult?.pendingLocalId ?? (present ? null : crypto.randomUUID());

    // Update checked status + pendingLocalId in one shot
    const updatedResults = targetResults.map((dr) =>
      dr.code === code
        ? {
            ...dr,
            isChecked: present,
            pendingLocalId: present ? null : localId,
          }
        : dr,
    );
    if (isGlobal) {
      onGlobalDocumentResultsChange?.(updatedResults);
    } else {
      onDocumentResultsChange(updatedResults);
    }

    // Sync libro_novedades with bookUpToDate prop
    if (code === "libro_novedades") {
      onBookChange({
        bookUpToDate: present,
        bookLastEntryDate,
        bookNotes,
      });
    }

    if (!present && localId) {
      const docType = allInstDocs.find((d) => d.code === code);
      const docLabel = docType?.label ?? code;
      const tipoDocId = docType?.tipoDocId ?? null;
      onAddPendingFinding({
        localId,
        category: "documentation",
        severity: "critical",
        description: `${docLabel} no presente`,
        guardId: null,
        tipoDocId,
        guardiaDocCode: tipoDocId ? null : code,
        source: sourceKey,
      });
    } else {
      onRemovePendingFinding(sourceKey);
    }
  }

  // Libro de novedades Sí/No handler (when not part of documentTypes)
  function handleBookCheck(present: boolean) {
    onBookChange({ bookUpToDate: present, bookLastEntryDate, bookNotes });

    const sourceKey = "instalacion:libro_novedades";
    if (present) {
      onRemovePendingFinding(sourceKey);
      return;
    }

    onAddPendingFinding({
      localId: crypto.randomUUID(),
      category: "documentation",
      severity: "critical",
      description: "Libro de novedades no presente",
      guardId: null,
      tipoDocId: null,
      guardiaDocCode: "libro_novedades",
      source: sourceKey,
    });
  }

  function handleDocPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeDocCode) return;
    const isGlobal = isGlobalDoc(activeDocCode);
    const targetResults = isGlobal ? globalDocumentResults : documentResults;
    const updated = targetResults.map((dr) => {
      if (dr.code !== activeDocCode) return dr;
      if (dr.photoPreview) URL.revokeObjectURL(dr.photoPreview);
      return { ...dr, photoFile: file, photoPreview: URL.createObjectURL(file) };
    });
    if (isGlobal) {
      onGlobalDocumentResultsChange?.(updated);
    } else {
      onDocumentResultsChange(updated);
    }
    if (docPhotoInputRef.current) docPhotoInputRef.current.value = "";
    setActiveDocCode(null);
  }

  function removeDocPhoto(code: string) {
    const isGlobal = isGlobalDoc(code);
    const targetResults = isGlobal ? globalDocumentResults : documentResults;
    const updated = targetResults.map((dr) => {
      if (dr.code !== code) return dr;
      if (dr.photoPreview) URL.revokeObjectURL(dr.photoPreview);
      return { ...dr, photoFile: null, photoPreview: null };
    });
    if (isGlobal) {
      onGlobalDocumentResultsChange?.(updated);
    } else {
      onDocumentResultsChange(updated);
    }
  }

  // Compliance calculation (documents + custom checklist)
  const totalDocItems = allInstDocs.length;
  const checkedDocCount = allInstResults.filter((dr) => dr.isChecked).length;
  const totalChecklistItems = checklistItems.length;
  const checkedChecklistCount = checklistItems.filter((item) => getItemChecked(item.id)).length;
  const totalItems = totalDocItems + totalChecklistItems;
  const checkedCount = checkedDocCount + checkedChecklistCount;
  const compliancePct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
  const complianceColor =
    compliancePct >= 80 ? "text-status-ok-fg" : compliancePct >= 50 ? "text-status-warn-fg" : "text-status-danger-fg";
  const complianceBg =
    compliancePct >= 80
      ? "bg-status-ok-soft border-status-ok-border"
      : compliancePct >= 50
        ? "bg-status-warn-soft border-status-warn-border"
        : "bg-status-danger-soft border-status-danger-border";

  // If libro_novedades is in documentTypes (or global), book validation is handled by doc results
  const libroInDocTypes = allInstDocs.some((d) => d.code === "libro_novedades");
  const bookRequiredFilled = libroInDocTypes || bookUpToDate !== null;
  const bookNotesRequired = !libroInDocTypes && bookUpToDate === false;
  // Foto del libro ahora es opcional cuando el libro está al día (Sí). El hallazgo
  // por libro ausente se persiste recién al cerrar la visita (ver pendingFindings).
  const bookPhotoFulfilled = true;
  const puestoPhotoFulfilled = !!puestoPhotoPreview;

  // Document results validation: solo basta haber respondido Sí o No.
  // Foto opcional en Sí, hallazgo se generará al cerrar visita en No.
  const allRequiredDocsAnswered = allInstDocs
    .filter((d) => d.required)
    .every((d) => {
      const result = allInstResults.find((dr) => dr.code === d.code);
      if (!result) return false;
      return result.isChecked === true || result.isChecked === false;
    });
  function handlePuestoPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (puestoPhotoPreview) URL.revokeObjectURL(puestoPhotoPreview);
    const preview = URL.createObjectURL(file);
    onPuestoPhotoChange(file, preview);
    if (puestoPhotoInputRef.current) puestoPhotoInputRef.current.value = "";
  }

  function handleRemovePuestoPhoto() {
    if (puestoPhotoPreview) URL.revokeObjectURL(puestoPhotoPreview);
    onPuestoPhotoChange(null, null);
  }

  function handleBookPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (bookPhotoPreview) URL.revokeObjectURL(bookPhotoPreview);
    const preview = URL.createObjectURL(file);
    onBookPhotoChange(file, preview);
    if (bookPhotoInputRef.current) bookPhotoInputRef.current.value = "";
  }

  function handleRemoveBookPhoto() {
    if (bookPhotoPreview) URL.revokeObjectURL(bookPhotoPreview);
    onBookPhotoChange(null, null);
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Verificacion
            <Badge variant="outline" className="ml-auto text-xs">
              Paso 3/5
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Puesto de guardia y presentación personal — foto obligatoria */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Camera className="h-4 w-4" />
              Puesto de guardia y presentación personal
              <span className="text-[10px] text-status-warn-fg">(obligatorio)</span>
            </p>
            <input
              ref={puestoPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePuestoPhotoCapture}
            />
            {puestoPhotoPreview ? (
              <div className="relative inline-block">
                <img
                  src={puestoPhotoPreview}
                  alt="Puesto de guardia"
                  className="h-24 w-auto rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemovePuestoPhoto}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                >
                  <X className="h-3 w-3" />
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full text-xs"
                  onClick={() => puestoPhotoInputRef.current?.click()}
                >
                  Retomar foto
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => puestoPhotoInputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" />
                Tomar foto
              </Button>
            )}
          </div>

          {/* Document types from configuration — unified Sí/No + date/photo or auto-finding */}
          {allInstDocs.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Documentos de la instalacion
              </Label>
              <input
                ref={docPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleDocPhotoCapture}
              />
              <div className="space-y-3">
                {allInstDocs.map((doc) => {
                  const result = allInstResults.find((dr) => dr.code === doc.code);
                  const isChecked = result?.isChecked ?? false;
                  const isNo = result !== undefined && !isChecked && result.isChecked === false;
                  const isAnswered = isChecked || isNo;
                  return (
                    <div
                      key={doc.code}
                      className={`rounded-lg border p-3 transition ${
                        isChecked
                          ? "border-status-ok-border bg-status-ok-soft"
                          : isNo
                            ? "border-status-danger-border bg-status-danger-soft"
                            : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">{doc.label}</span>
                          {doc.required && (
                            <span className="ml-2 text-[10px] text-status-warn-fg">(obligatorio)</span>
                          )}
                        </div>
                        {!isAnswered && (
                          <button
                            type="button"
                            onClick={() => setShowFindingModal(true)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-status-warn-fg hover:bg-status-warn-soft"
                            title="Registrar hallazgo"
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Sí / No buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleDocCheck(doc.code, true)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition ${
                            isChecked
                              ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                              : "border-border text-muted-foreground hover:border-status-ok-border"
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Si
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDocCheck(doc.code, false)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition ${
                            isNo
                              ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                              : "border-border text-muted-foreground hover:border-status-danger-border"
                          }`}
                        >
                          <XCircle className="h-4 w-4" />
                          No
                        </button>
                      </div>

                      {/* Sí: date + mandatory photo */}
                      {result?.isChecked === true && (
                        <div className="space-y-2 pl-2 border-l-2 border-status-ok-border mt-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Fecha ultima entrada</label>
                            <Input
                              type="date"
                              value={result.lastEntryDate ?? ""}
                              onChange={(e) => updateDocResult(doc.code, { lastEntryDate: e.target.value })}
                              className="h-11 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Foto ultima pagina (opcional)</label>
                            <div className="mt-1 flex items-center gap-2">
                              {result.photoPreview ? (
                                <div className="relative">
                                  <img
                                    src={result.photoPreview}
                                    alt={doc.label}
                                    className="h-14 w-14 rounded-md object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeDocPhoto(doc.code)}
                                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDocCode(doc.code);
                                  docPhotoInputRef.current?.click();
                                }}
                                className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
                              >
                                <Camera className="h-3 w-3" />
                                {result.photoPreview ? "Retomar foto" : "Tomar foto"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* No: pending finding (se persiste al cierre) */}
                      {result?.isChecked === false && (
                        openFindingDocKeys.has(docKeyForType(doc)) ? (
                          <div className="mt-2 rounded-lg bg-status-info-soft p-2 text-xs">
                            <p className="text-status-info-fg">
                              🔗 Ya existe un hallazgo abierto para este documento — gestiónalo en &quot;Hallazgos pendientes&quot; abajo.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg bg-status-warn-soft p-2 text-xs">
                            <p className="text-status-warn-fg">
                              ⏳ Se creará hallazgo al cerrar la visita: &quot;{doc.label} no presente&quot;
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Guard document checks — accordion per guard */}
          {guardDocTypes.length > 0 && guardDocResults.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Shield className="h-4 w-4" />
                Documentos por guardia
              </Label>
              <input
                ref={guardDocPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleGuardDocPhotoCapture}
              />
              <div className="space-y-2">
                {guardDocResults.map((guard) => {
                  const checkedGuardDocs = guard.docs.filter((d) => d.isChecked).length;
                  const totalGuardDocs = guard.docs.length;
                  const isExpanded = expandedGuardId === guard.guardiaId;

                  return (
                    <div key={guard.guardiaId} className="rounded-lg border">
                      {/* Guard header — tap to expand/collapse */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGuardId(isExpanded ? null : guard.guardiaId)
                        }
                        className="flex w-full items-center justify-between gap-2 p-3 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{guard.guardiaName}</p>
                          {guard.guardiaRut && (
                            <p className="text-xs text-muted-foreground">{guard.guardiaRut}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`text-xs font-medium ${
                              checkedGuardDocs === totalGuardDocs
                                ? "text-status-ok-fg"
                                : "text-muted-foreground"
                            }`}
                          >
                            {checkedGuardDocs}/{totalGuardDocs} &#10003;
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {/* Expanded: list of documents */}
                      {isExpanded && (
                        <div className="space-y-3 border-t px-3 pb-3 pt-2">
                          {guardDocTypes.map((docType) => {
                            const docResult = guard.docs.find((d) => d.code === docType.code);
                            const isDocChecked = docResult?.isChecked ?? false;
                            const isDocNo =
                              docResult !== undefined &&
                              !isDocChecked &&
                              docResult.isChecked === false;

                            return (
                              <div
                                key={docType.code}
                                className={`rounded-lg border p-3 transition ${
                                  isDocChecked
                                    ? "border-status-ok-border bg-status-ok-soft"
                                    : isDocNo
                                      ? "border-status-danger-border bg-status-danger-soft"
                                      : "border-border"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-sm font-medium">{docType.label}</span>
                                  {isDocChecked && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveGuardDoc({
                                          guardId: guard.guardiaId,
                                          code: docType.code,
                                        });
                                        guardDocPhotoInputRef.current?.click();
                                      }}
                                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40"
                                    >
                                      <Camera className="h-3 w-3" />
                                      Foto
                                    </button>
                                  )}
                                </div>

                                {/* Toggle Sí/No */}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleGuardDocToggle(guard.guardiaId, docType.code, true)
                                    }
                                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition ${
                                      isDocChecked
                                        ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                                        : "border-border text-muted-foreground hover:border-status-ok-border"
                                    }`}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Si
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleGuardDocToggle(guard.guardiaId, docType.code, false)
                                    }
                                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition ${
                                      isDocNo
                                        ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                                        : "border-border text-muted-foreground hover:border-status-danger-border"
                                    }`}
                                  >
                                    <XCircle className="h-4 w-4" />
                                    No
                                  </button>
                                </div>

                                {/* Photo preview when Sí */}
                                {isDocChecked && docResult?.photoPreview && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="relative">
                                      <img
                                        src={docResult.photoPreview}
                                        alt={docType.label}
                                        className="h-14 w-14 rounded-md object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeGuardDocPhoto(guard.guardiaId, docType.code)
                                        }
                                        className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* No: pending finding (se persiste al cierre) */}
                                {isDocNo && (
                                  openGuardFindingKeys.has(guardDocKey(docType.code, guard.guardiaId)) ? (
                                    <div className="mt-2 rounded-lg bg-status-info-soft p-2 text-xs">
                                      <p className="text-status-info-fg">
                                        🔗 Ya existe un hallazgo abierto para este guardia y documento — gestiónalo abajo.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="mt-2 rounded-lg bg-status-warn-soft p-2 text-xs">
                                      <p className="text-status-warn-fg">
                                        ⏳ Se creará hallazgo al cerrar la visita: &quot;{docType.label} no presente&quot;
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Additional checklist items (only shown if custom items exist from DB) */}
          {checklistItems.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                Checklist adicional
                <span className="text-xs text-muted-foreground">({checklistItems.length} items)</span>
              </Label>
              <div className="space-y-2">
                {checklistItems.map((item) => {
                  const isChecked = getItemChecked(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                        isChecked
                          ? "border-status-ok-border bg-status-ok-soft"
                          : "border-border"
                      }`}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="h-5 w-5 rounded border-border accent-emerald-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm">{item.name}</span>
                          {item.isMandatory && (
                            <span className="ml-2 text-[10px] text-status-warn-fg">(obligatorio)</span>
                          )}
                        </div>
                      </label>
                      {isChecked ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-status-ok-fg" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowFindingModal(true)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-status-warn-fg hover:bg-status-warn-soft"
                          title="Registrar hallazgo"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          <span className="hidden sm:inline">Hallazgo</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Compliance indicator */}
          {totalItems > 0 && (
            <div className={`rounded-lg border p-3 text-center ${complianceBg}`}>
              <p className={`text-sm font-medium ${complianceColor}`}>
                Cumplimiento: {checkedCount}/{totalItems} ({compliancePct}%)
              </p>
            </div>
          )}

          {/* Logbook section — only if libro_novedades is NOT in documentTypes (handled above) */}
          {!allInstDocs.some((d) => d.code === "libro_novedades") && (
          <div className="rounded-lg border p-3 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4" />
              Libro de novedades
            </p>

            <div className="space-y-2">
              <Label className="text-xs">Libro al dia?</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleBookCheck(true)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition ${
                    bookUpToDate === true
                      ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 className="mx-auto mb-1 h-5 w-5" />
                  Si
                </button>
                <button
                  type="button"
                  onClick={() => handleBookCheck(false)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition ${
                    bookUpToDate === false
                      ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <AlertTriangle className="mx-auto mb-1 h-5 w-5" />
                  No
                </button>
              </div>
            </div>

            {/* Sí: date + notes + photo */}
            {bookUpToDate === true && (
              <div className="space-y-2 pl-2 border-l-2 border-status-ok-border">
                <div className="space-y-2">
                  <Label className="text-xs">Fecha ultima entrada</Label>
                  <Input
                    type="date"
                    value={bookLastEntryDate}
                    onChange={(e) =>
                      onBookChange({ bookUpToDate, bookLastEntryDate: e.target.value, bookNotes })
                    }
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Novedades relevantes</Label>
                  <Textarea
                    value={bookNotes}
                    onChange={(e) =>
                      onBookChange({ bookUpToDate, bookLastEntryDate, bookNotes: e.target.value })
                    }
                    placeholder="Novedades relevantes del libro..."
                    rows={2}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Foto ultima pagina del libro (opcional)</Label>
                  <input
                    ref={bookPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleBookPhotoCapture}
                  />

                  {bookPhotoPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={bookPhotoPreview}
                        alt="Libro de novedades"
                        className="h-24 w-auto rounded-lg border object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveBookPhoto}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full text-xs"
                        onClick={() => bookPhotoInputRef.current?.click()}
                      >
                        Retomar foto
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => bookPhotoInputRef.current?.click()}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Fotografiar ultima pagina del libro
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* No: auto-finding */}
            {bookUpToDate === false && (
              <div className="space-y-2">
                <div className="space-y-2">
                  <Label className="text-xs">
                    Novedades relevantes
                    <span className="ml-1 text-status-warn-fg">(obligatorio)</span>
                  </Label>
                  <Textarea
                    value={bookNotes}
                    onChange={(e) =>
                      onBookChange({ bookUpToDate, bookLastEntryDate, bookNotes: e.target.value })
                    }
                    placeholder="Indica por que el libro no esta al dia..."
                    rows={2}
                    className="text-sm"
                  />
                  {!bookNotes.trim() && (
                    <p className="text-xs text-status-warn-fg">
                      Debes indicar por que el libro no esta al dia
                    </p>
                  )}
                </div>
                {openFindingDocKeys.has("code:libro_novedades") ? (
                  <div className="mt-2 rounded-lg bg-status-info-soft p-2 text-xs">
                    <p className="text-status-info-fg">
                      🔗 Ya existe un hallazgo abierto para el libro — gestiónalo en &quot;Hallazgos pendientes&quot; abajo.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg bg-status-warn-soft p-2 text-xs">
                    <p className="text-status-warn-fg">
                      ⏳ Se creará hallazgo al cerrar la visita: &quot;Libro de novedades no presente&quot;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Open findings from previous visits */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-status-warn-fg" />
              Hallazgos pendientes ({openFindings.length})
            </Label>
            {openFindings.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                No hay hallazgos pendientes de visitas anteriores
              </div>
            ) : (
              <div className="space-y-2">
                {openFindings.map((finding) => (
                  <div key={finding.id} className="rounded-lg border p-3">
                    <div className="mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            finding.severity === "critical"
                              ? "destructive"
                              : finding.severity === "major"
                                ? "warning"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {finding.severity === "critical"
                            ? "Critico"
                            : finding.severity === "major"
                              ? "Mayor"
                              : "Menor"}
                        </Badge>
                        <span className="text-sm font-medium">{finding.description}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Detectado: {new Date(finding.createdAt).toLocaleDateString("es-CL")}
                        <span className="capitalize">— {finding.status === "open" ? "Abierto" : "En resolucion"}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-status-ok-fg hover:bg-status-ok-soft hover:text-status-ok-fg"
                        onClick={() => setResolvingFinding(finding)}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Resuelto
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-muted-foreground"
                        onClick={() => onFindingStatusChange(finding.id, "in_progress")}
                      >
                        No resuelto
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onPrev} className="flex-1" size="lg">
              ← Anterior
            </Button>
            <Button
              onClick={onNext}
              disabled={
                saving ||
                !bookRequiredFilled ||
                (bookNotesRequired && !bookNotes.trim()) ||
                !puestoPhotoFulfilled ||
                !allRequiredDocsAnswered
              }
              className="flex-1"
              size="lg"
            >
              {saving ? "Guardando..." : "Siguiente →"}
            </Button>
          </div>

          {(!bookRequiredFilled || !puestoPhotoFulfilled || !allRequiredDocsAnswered) && (
            <p className="text-center text-xs text-status-warn-fg">
              {!bookRequiredFilled && "Debes indicar si el libro de novedades esta al dia. "}
              {!puestoPhotoFulfilled && "Debes tomar la foto del puesto de guardia. "}
              {!allRequiredDocsAnswered && "Documentos obligatorios requieren una respuesta (Si o No). "}
            </p>
          )}
        </CardContent>
      </Card>

      {showFindingModal && (
        <FindingModal
          visitId={visit.id}
          guardId={null}
          mode={mode}
          onClose={() => setShowFindingModal(false)}
          onCreated={(finding) => {
            onFindingCreated(finding);
            setShowFindingModal(false);
          }}
        />
      )}

      {resolvingFinding && (
        <ResolveFindingModal
          visitId={visit.id}
          finding={{
            id: resolvingFinding.id,
            description: resolvingFinding.description,
            severity: resolvingFinding.severity,
          }}
          onClose={() => setResolvingFinding(null)}
          onResolved={(id) => {
            onFindingResolvedLocally?.(id);
            setResolvingFinding(null);
          }}
        />
      )}
    </>
  );
}
