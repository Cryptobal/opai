"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, BookOpen, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ChecklistItem, ChecklistResult, Finding, VisitData } from "./types";
import { FindingModal } from "./FindingModal";

type Props = {
  visit: VisitData;
  checklistItems: ChecklistItem[];
  checklistResults: ChecklistResult[];
  openFindings: Finding[];
  bookUpToDate: boolean | null;
  bookLastEntryDate: string;
  bookNotes: string;
  onChecklistChange: (results: ChecklistResult[]) => void;
  onBookChange: (data: { bookUpToDate: boolean | null; bookLastEntryDate: string; bookNotes: string }) => void;
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
  onChecklistChange,
  onBookChange,
  onFindingCreated,
  onFindingStatusChange,
  onNext,
  onPrev,
  saving,
}: Props) {
  const [showFindingModal, setShowFindingModal] = useState(false);

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

  const bookRequiredFilled = bookUpToDate !== null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Verificación
            <Badge variant="outline" className="ml-auto text-xs">
              Paso 3/5
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dynamic checklist */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              Checklist de instalación
            </Label>
            {checklistItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay items de checklist configurados.
              </p>
            ) : (
              <div className="space-y-2">
                {checklistItems.map((item) => {
                  const isChecked = getItemChecked(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                        isChecked
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
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
                      {!isChecked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setShowFindingModal(true);
                          }}
                          className="rounded p-1 text-amber-400 hover:bg-amber-500/10"
                          title="Registrar hallazgo"
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Logbook section */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4" />
              Libro de novedades
            </p>

            <div className="space-y-2">
              <Label className="text-xs">¿Libro al día?</Label>
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
                  Sí
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
              <Label className="text-xs">Fecha última entrada</Label>
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
          </div>

          {/* Open findings from previous visits */}
          {openFindings.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Hallazgos abiertos ({openFindings.length})
              </Label>
              <div className="space-y-2">
                {openFindings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{finding.description}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(finding.createdAt).toLocaleDateString("es-CL")}
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
                            ? "Crítico"
                            : finding.severity === "major"
                              ? "Mayor"
                              : "Menor"}
                        </Badge>
                      </div>
                    </div>
                    <div className="ml-2 flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-emerald-400 hover:text-emerald-300"
                        onClick={() => onFindingStatusChange(finding.id, "verified")}
                      >
                        Resuelto
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => onFindingStatusChange(finding.id, "in_progress")}
                      >
                        Sigue
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onPrev} className="flex-1" size="lg">
              ← Anterior
            </Button>
            <Button
              onClick={onNext}
              disabled={saving || !bookRequiredFilled}
              className="flex-1"
              size="lg"
            >
              {saving ? "Guardando..." : "Siguiente →"}
            </Button>
          </div>

          {!bookRequiredFilled && (
            <p className="text-center text-xs text-amber-400">
              Debes indicar si el libro de novedades está al día
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
