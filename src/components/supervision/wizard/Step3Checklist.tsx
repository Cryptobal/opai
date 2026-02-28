"use client";

import { useRef, useState } from "react";
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
} from "./types";
import { FindingModal } from "./FindingModal";

type Props = {
  visit: VisitData;
  checklistItems: ChecklistItem[];
  checklistResults: ChecklistResult[];
  openFindings: Finding[];
  bookUpToDate: boolean | null;
  bookLastEntryDate: string;
  bookNotes: string;
  bookPhotoFile: File | null;
  bookPhotoPreview: string | null;
  documentTypes: InstalacionDocumentType[];
  documentResults: DocumentCheckResult[];
  onChecklistChange: (results: ChecklistResult[]) => void;
  onBookChange: (data: {
    bookUpToDate: boolean | null;
    bookLastEntryDate: string;
    bookNotes: string;
  }) => void;
  onBookPhotoChange: (file: File | null, preview: string | null) => void;
  onDocumentResultsChange: (results: DocumentCheckResult[]) => void;
  onFindingCreated: (finding: Finding) => void;
  onFindingStatusChange: (findingId: string, status: string) => void;
  onNext: () => void;
  onPrev: () => void;
  saving: boolean;
};

export function Step3Checklist({
  visit,
  checklistItems,
  checklistResults,
  openFindings,
  bookUpToDate,
  bookLastEntryDate,
  bookNotes,
  bookPhotoPreview,
  documentTypes,
  documentResults,
  onChecklistChange,
  onBookChange,
  onBookPhotoChange,
  onDocumentResultsChange,
  onFindingCreated,
  onFindingStatusChange,
  onNext,
  onPrev,
  saving,
}: Props) {
  const [showFindingModal, setShowFindingModal] = useState(false);
  const bookPhotoInputRef = useRef<HTMLInputElement>(null);
  const docPhotoInputRef = useRef<HTMLInputElement>(null);
  const [activeDocCode, setActiveDocCode] = useState<string | null>(null);

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

  // Document type handlers — Sí/No toggle
  function setDocumentChecked(code: string, checked: boolean) {
    onDocumentResultsChange(
      documentResults.map((dr) =>
        dr.code === code ? { ...dr, isChecked: checked } : dr,
      ),
    );
  }

  function handleDocPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeDocCode) return;
    onDocumentResultsChange(
      documentResults.map((dr) => {
        if (dr.code !== activeDocCode) return dr;
        if (dr.photoPreview) URL.revokeObjectURL(dr.photoPreview);
        return { ...dr, photoFile: file, photoPreview: URL.createObjectURL(file) };
      }),
    );
    if (docPhotoInputRef.current) docPhotoInputRef.current.value = "";
    setActiveDocCode(null);
  }

  function removeDocPhoto(code: string) {
    onDocumentResultsChange(
      documentResults.map((dr) => {
        if (dr.code !== code) return dr;
        if (dr.photoPreview) URL.revokeObjectURL(dr.photoPreview);
        return { ...dr, photoFile: null, photoPreview: null };
      }),
    );
  }

  // Compliance calculation (documents + custom checklist)
  const totalDocItems = documentTypes.length;
  const checkedDocCount = documentResults.filter((dr) => dr.isChecked).length;
  const totalChecklistItems = checklistItems.length;
  const checkedChecklistCount = checklistItems.filter((item) => getItemChecked(item.id)).length;
  const totalItems = totalDocItems + totalChecklistItems;
  const checkedCount = checkedDocCount + checkedChecklistCount;
  const compliancePct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
  const complianceColor =
    compliancePct >= 80 ? "text-emerald-400" : compliancePct >= 50 ? "text-amber-400" : "text-red-400";
  const complianceBg =
    compliancePct >= 80
      ? "bg-emerald-500/10 border-emerald-500/30"
      : compliancePct >= 50
        ? "bg-amber-500/10 border-amber-500/30"
        : "bg-red-500/10 border-red-500/30";

  const bookRequiredFilled = bookUpToDate !== null;
  const bookNotesRequired = bookUpToDate === false;

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
          {/* Document types from configuration — Sí/No buttons */}
          {documentTypes.length > 0 && (
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
                {documentTypes.map((doc) => {
                  const result = documentResults.find((dr) => dr.code === doc.code);
                  const isChecked = result?.isChecked ?? false;
                  const isNo = result !== undefined && !isChecked && result.isChecked === false;
                  const isAnswered = isChecked || isNo;
                  return (
                    <div
                      key={doc.code}
                      className={`rounded-lg border p-3 transition ${
                        isChecked
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : isNo
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium">{doc.label}</span>
                          {doc.required && (
                            <span className="ml-2 text-[10px] text-amber-400">(obligatorio)</span>
                          )}
                        </div>
                        {!isAnswered && (
                          <button
                            type="button"
                            onClick={() => setShowFindingModal(true)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10"
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
                          onClick={() => setDocumentChecked(doc.code, true)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition ${
                            isChecked
                              ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                              : "border-border text-muted-foreground hover:border-emerald-500/50"
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Si
                        </button>
                        <button
                          type="button"
                          onClick={() => setDocumentChecked(doc.code, false)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition ${
                            isNo
                              ? "border-red-500 bg-red-500/20 text-red-400"
                              : "border-border text-muted-foreground hover:border-red-500/50"
                          }`}
                        >
                          <XCircle className="h-4 w-4" />
                          No
                        </button>
                      </div>

                      {/* Photo for this document */}
                      <div className="mt-2 flex items-center gap-2">
                        {result?.photoPreview ? (
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
                          {result?.photoPreview ? "Retomar foto" : "Tomar foto"}
                        </button>
                      </div>
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
                          ? "border-emerald-500/30 bg-emerald-500/5"
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
                            <span className="ml-2 text-[10px] text-amber-400">(obligatorio)</span>
                          )}
                        </div>
                      </label>
                      {isChecked ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowFindingModal(true)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10"
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

          {/* Logbook section */}
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
                  onClick={() => onBookChange({ bookUpToDate: true, bookLastEntryDate, bookNotes })}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition ${
                    bookUpToDate === true
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 className="mx-auto mb-1 h-5 w-5" />
                  Si
                </button>
                <button
                  type="button"
                  onClick={() => onBookChange({ bookUpToDate: false, bookLastEntryDate, bookNotes })}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition ${
                    bookUpToDate === false
                      ? "border-red-500 bg-red-500/20 text-red-400"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <AlertTriangle className="mx-auto mb-1 h-5 w-5" />
                  No
                </button>
              </div>
            </div>

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
              <Label className="text-xs">
                Novedades relevantes
                {bookNotesRequired && <span className="ml-1 text-amber-400">(obligatorio)</span>}
              </Label>
              <Textarea
                value={bookNotes}
                onChange={(e) =>
                  onBookChange({ bookUpToDate, bookLastEntryDate, bookNotes: e.target.value })
                }
                placeholder={bookNotesRequired ? "Indica por que el libro no esta al dia..." : "Novedades relevantes del libro..."}
                rows={2}
                className="text-sm"
              />
              {bookNotesRequired && !bookNotes.trim() && (
                <p className="text-xs text-amber-400">
                  Debes indicar por que el libro no esta al dia
                </p>
              )}
            </div>

            {/* Book photo */}
            <div className="space-y-2">
              <Label className="text-xs">Foto del libro de novedades</Label>
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
                  Fotografiar libro de novedades
                </Button>
              )}
            </div>
          </div>

          {/* Open findings from previous visits */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
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
                        className="flex-1 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                        onClick={() => onFindingStatusChange(finding.id, "verified")}
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
              disabled={saving || !bookRequiredFilled || (bookNotesRequired && !bookNotes.trim())}
              className="flex-1"
              size="lg"
            >
              {saving ? "Guardando..." : "Siguiente →"}
            </Button>
          </div>

          {!bookRequiredFilled && (
            <p className="text-center text-xs text-amber-400">
              Debes indicar si el libro de novedades esta al dia
            </p>
          )}
        </CardContent>
      </Card>

      {showFindingModal && (
        <FindingModal
          visitId={visit.id}
          guardId={null}
          onClose={() => setShowFindingModal(false)}
          onCreated={(finding) => {
            onFindingCreated(finding);
            setShowFindingModal(false);
          }}
        />
      )}
    </>
  );
}
