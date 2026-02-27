"use client";

import { useState } from "react";
import {
  FileText,
  CheckCircle2,
  Clock,
  Users,
  ClipboardCheck,
  Star,
  AlertTriangle,
  Camera,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { GuardEvaluation, ChecklistItem, ChecklistResult, Finding, CapturedPhoto, VisitData } from "./types";

type Props = {
  visit: VisitData;
  evaluations: GuardEvaluation[];
  checklistItems: ChecklistItem[];
  checklistResults: ChecklistResult[];
  findings: Finding[];
  capturedPhotos: CapturedPhoto[];
  generalComments: string;
  clientContacted: boolean;
  clientContactName: string;
  clientSatisfaction: number | null;
  clientComment: string;
  onGeneralCommentsChange: (v: string) => void;
  onClientDataChange: (data: {
    clientContacted: boolean;
    clientContactName: string;
    clientSatisfaction: number | null;
    clientComment: string;
  }) => void;
  onFinalize: () => void;
  onPrev: () => void;
  saving: boolean;
};

export function Step5Closure({
  visit,
  evaluations,
  checklistItems,
  checklistResults,
  findings,
  capturedPhotos,
  generalComments,
  clientContacted,
  clientContactName,
  clientSatisfaction,
  clientComment,
  onGeneralCommentsChange,
  onClientDataChange,
  onFinalize,
  onPrev,
  saving,
}: Props) {
  // Compute summary
  const checkInAt = new Date(visit.checkInAt);
  const now = new Date();
  const durationMinutes = Math.round((now.getTime() - checkInAt.getTime()) / 60000);

  const ratedEvals = evaluations.filter(
    (e) => e.presentationScore !== null && e.orderScore !== null && e.protocolScore !== null,
  );
  const avgRating =
    ratedEvals.length > 0
      ? ratedEvals.reduce(
          (s, e) =>
            s + ((e.presentationScore ?? 0) + (e.orderScore ?? 0) + (e.protocolScore ?? 0)) / 3,
          0,
        ) / ratedEvals.length
      : null;

  const totalChecklist = checklistItems.length;
  const checkedCount = checklistResults.filter((r) => r.isChecked).length;
  const mandatoryPhotos = capturedPhotos.filter((p) =>
    p.categoryId ? true : false, // All captured photos count
  ).length;
  const newFindings = findings.filter((f) => f.status === "open");

  const guardsOk =
    visit.guardsExpected === null ||
    visit.guardsFound === null ||
    visit.guardsExpected === visit.guardsFound;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Cierre
          <Badge variant="outline" className="ml-auto text-xs">
            Paso 5/5
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* General comments */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comentarios generales de la visita
          </Label>
          <Textarea
            value={generalComments}
            onChange={(e) => onGeneralCommentsChange(e.target.value)}
            placeholder="Observaciones generales, hallazgos, acciones tomadas..."
            rows={4}
            className="text-sm"
          />
        </div>

        {/* Client survey section */}
        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">Encuesta cliente (opcional)</p>

          <div className="space-y-2">
            <Label className="text-xs">¿Contactó al cliente?</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  onClientDataChange({ clientContacted: true, clientContactName, clientSatisfaction, clientComment })
                }
                className={`flex-1 rounded-lg border-2 p-2 text-center text-sm font-medium transition ${
                  clientContacted
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : "border-border text-muted-foreground"
                }`}
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() =>
                  onClientDataChange({
                    clientContacted: false,
                    clientContactName: "",
                    clientSatisfaction: null,
                    clientComment: "",
                  })
                }
                className={`flex-1 rounded-lg border-2 p-2 text-center text-sm font-medium transition ${
                  !clientContacted
                    ? "border-muted-foreground/50 bg-muted/50 text-muted-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                No
              </button>
            </div>
          </div>

          {clientContacted && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Nombre del contacto</Label>
                <Input
                  value={clientContactName}
                  onChange={(e) =>
                    onClientDataChange({
                      clientContacted,
                      clientContactName: e.target.value,
                      clientSatisfaction,
                      clientComment,
                    })
                  }
                  placeholder="Nombre del contacto en la instalación"
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Satisfacción del cliente</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        onClientDataChange({
                          clientContacted,
                          clientContactName,
                          clientSatisfaction: n,
                          clientComment,
                        })
                      }
                      className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 transition ${
                        clientSatisfaction === n
                          ? "border-amber-500 bg-amber-500/20 text-amber-400"
                          : "border-border text-muted-foreground hover:border-muted-foreground/50"
                      }`}
                    >
                      <Star className={`h-5 w-5 ${clientSatisfaction !== null && n <= clientSatisfaction ? "fill-current" : ""}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Comentario del cliente</Label>
                <Textarea
                  value={clientComment}
                  onChange={(e) =>
                    onClientDataChange({
                      clientContacted,
                      clientContactName,
                      clientSatisfaction,
                      clientComment: e.target.value,
                    })
                  }
                  placeholder="Comentarios del cliente..."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </>
          )}
        </div>

        {/* Visit summary */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
          <p className="text-sm font-medium">Resumen de la visita</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span>Duración: {durationMinutes} min</span>
              {durationMinutes < 15 && (
                <Badge variant="warning" className="text-[10px]">
                  Express
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span>
                Guardias: {visit.guardsFound ?? "—"}/{visit.guardsExpected ?? "—"}
              </span>
              {guardsOk ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-amber-400" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-3 w-3 text-muted-foreground" />
              <span>
                Checklist: {checkedCount}/{totalChecklist}
              </span>
              {checkedCount < totalChecklist && (
                <AlertTriangle className="h-3 w-3 text-amber-400" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Star className="h-3 w-3 text-muted-foreground" />
              <span>Calificación: {avgRating !== null ? avgRating.toFixed(1) : "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
              <span>Hallazgos nuevos: {newFindings.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="h-3 w-3 text-muted-foreground" />
              <span>Fotos: {capturedPhotos.length}</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev} className="flex-1" size="lg">
            ← Anterior
          </Button>
          <Button
            onClick={onFinalize}
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {saving ? "Finalizando..." : "✓ Finalizar visita"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
