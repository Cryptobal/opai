"use client";

import { useState } from "react";
import { Users, AlertTriangle, Star, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DotacionGuard, GuardEvaluation, Finding, VisitData } from "./types";
import { INSTALLATION_STATES } from "./types";
import { FindingModal } from "./FindingModal";

type Props = {
  visit: VisitData;
  guards: DotacionGuard[];
  evaluations: GuardEvaluation[];
  findings: Finding[];
  installationState: string;
  onEvaluationsChange: (evals: GuardEvaluation[]) => void;
  onInstallationStateChange: (state: string) => void;
  onFindingCreated: (finding: Finding) => void;
  onNext: () => void;
  onPrev: () => void;
  saving: boolean;
};

function RatingButtons({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 text-sm font-bold transition-all ${
              value === n
                ? n >= 4
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                  : n === 3
                    ? "border-amber-500 bg-amber-500/20 text-amber-400"
                    : "border-red-500 bg-red-500/20 text-red-400"
                : "border-border bg-background text-muted-foreground hover:border-muted-foreground/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Step2Evaluation({
  visit,
  guards,
  evaluations,
  findings,
  installationState,
  onEvaluationsChange,
  onInstallationStateChange,
  onFindingCreated,
  onNext,
  onPrev,
  saving,
}: Props) {
  const [showFindingModal, setShowFindingModal] = useState(false);
  const [findingGuardId, setFindingGuardId] = useState<string | null>(null);

  function updateEvaluation(index: number, field: keyof GuardEvaluation, value: unknown) {
    const updated = [...evaluations];
    updated[index] = { ...updated[index], [field]: value };
    onEvaluationsChange(updated);
  }

  const hasAtLeastOneRated = evaluations.some(
    (e) => e.presentationScore !== null || e.orderScore !== null || e.protocolScore !== null,
  );

  // Count guard-specific findings
  function getGuardFindings(guardId: string | null) {
    if (!guardId) return [];
    return findings.filter((f) => f.guardId === guardId);
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Evaluación
            <Badge variant="outline" className="ml-auto text-xs">
              Paso 2/5
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Installation state */}
          <div className="space-y-2">
            <Label>Estado general de la instalación</Label>
            <Select value={installationState} onValueChange={onInstallationStateChange}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTALLATION_STATES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Guard evaluations */}
          {evaluations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No hay guardias para evaluar. Puedes continuar al siguiente paso.
            </div>
          ) : (
            <div className="space-y-4">
              {evaluations.map((evaluation, index) => {
                const guardFindings = getGuardFindings(evaluation.guardId);
                return (
                  <div
                    key={evaluation.guardId ?? index}
                    className="rounded-lg border p-3 transition-colors"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{evaluation.guardName}</p>
                        <p className="text-xs text-muted-foreground">
                          Guardia {index + 1} de {evaluations.length}
                          {evaluation.isReinforcement && (
                            <Badge variant="warning" className="ml-2 text-[10px]">
                              Refuerzo
                            </Badge>
                          )}
                        </p>
                      </div>
                      {guardFindings.length > 0 && (
                        <Badge variant="warning" className="text-[10px]">
                          {guardFindings.length} hallazgo(s)
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <RatingButtons
                        label="Presentación"
                        value={evaluation.presentationScore}
                        onChange={(v) => updateEvaluation(index, "presentationScore", v)}
                      />
                      <RatingButtons
                        label="Orden"
                        value={evaluation.orderScore}
                        onChange={(v) => updateEvaluation(index, "orderScore", v)}
                      />
                      <RatingButtons
                        label="Protocolo"
                        value={evaluation.protocolScore}
                        onChange={(v) => updateEvaluation(index, "protocolScore", v)}
                      />
                    </div>

                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Observación (opcional)"
                        value={evaluation.observation}
                        onChange={(e) => updateEvaluation(index, "observation", e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-amber-400 hover:text-amber-300"
                        onClick={() => {
                          setFindingGuardId(evaluation.guardId);
                          setShowFindingModal(true);
                        }}
                      >
                        <AlertTriangle className="mr-2 h-3 w-3" />
                        Registrar hallazgo
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Average summary */}
          {hasAtLeastOneRated && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Promedio instalación</p>
              <div className="flex items-center gap-3 text-sm">
                {(() => {
                  const rated = evaluations.filter(
                    (e) =>
                      e.presentationScore !== null &&
                      e.orderScore !== null &&
                      e.protocolScore !== null,
                  );
                  if (rated.length === 0) return <span className="text-muted-foreground">—</span>;
                  const avg =
                    rated.reduce(
                      (s, e) =>
                        s +
                        ((e.presentationScore ?? 0) + (e.orderScore ?? 0) + (e.protocolScore ?? 0)) /
                          3,
                      0,
                    ) / rated.length;
                  return (
                    <span className="flex items-center gap-1 font-medium">
                      <Star className="h-4 w-4 text-amber-400" />
                      {avg.toFixed(1)} / 5.0
                    </span>
                  );
                })()}
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
              disabled={saving}
              className="flex-1"
              size="lg"
            >
              {saving ? "Guardando..." : "Siguiente →"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showFindingModal && (
        <FindingModal
          visitId={visit.id}
          guardId={findingGuardId}
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
