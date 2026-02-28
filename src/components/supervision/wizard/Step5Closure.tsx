"use client";

import { useRef } from "react";
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
  BookOpen,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SignatureCanvas } from "./SignatureCanvas";
import type {
  GuardEvaluation,
  ChecklistItem,
  ChecklistResult,
  Finding,
  CapturedPhoto,
  PhotoCategory,
  VisitData,
  SurveyData,
} from "./types";

type Props = {
  visit: VisitData;
  evaluations: GuardEvaluation[];
  checklistItems: ChecklistItem[];
  checklistResults: ChecklistResult[];
  findings: Finding[];
  openFindings: Finding[];
  capturedPhotos: CapturedPhoto[];
  photoCategories: PhotoCategory[];
  generalComments: string;
  clientContacted: boolean;
  clientContactName: string;
  clientContactRole: string;
  surveyData: SurveyData;
  signatureDataUrl: string | null;
  validationPhotoPreview: string | null;
  validationType: "signature" | "photo" | null;
  bookUpToDate: boolean | null;
  onGeneralCommentsChange: (v: string) => void;
  onClientContactedChange: (v: boolean) => void;
  onClientContactNameChange: (v: string) => void;
  onClientContactRoleChange: (v: string) => void;
  onSurveyDataChange: (data: SurveyData) => void;
  onSignatureChange: (dataUrl: string | null) => void;
  onValidationPhotoChange: (file: File | null, preview: string | null) => void;
  onValidationTypeChange: (type: "signature" | "photo" | null) => void;
  onFinalize: () => void;
  onPrev: () => void;
  saving: boolean;
};

// GARD Client Survey — 9 questions
const SURVEY_QUESTIONS: {
  key: "serviceQuality" | "scheduleCompliance" | "personalPresentation" | "professionalism" | "supervisionPresence" | "incidentResponse";
  question: string;
  labels: string[];
}[] = [
  {
    key: "serviceQuality",
    question: "Como califica el servicio de guardias en general?",
    labels: ["Muy deficiente", "Deficiente", "Regular", "Bueno", "Excelente"],
  },
  {
    key: "scheduleCompliance",
    question: "Los guardias cumplen con los horarios establecidos?",
    labels: ["Nunca", "Rara vez", "A veces", "Casi siempre", "Siempre"],
  },
  {
    key: "personalPresentation",
    question: "Como califica la presentacion personal de los guardias?",
    labels: ["Muy mala", "Mala", "Regular", "Buena", "Excelente"],
  },
  {
    key: "professionalism",
    question: "Los guardias atienden con profesionalismo y cortesia?",
    labels: ["Nunca", "Rara vez", "A veces", "Casi siempre", "Siempre"],
  },
  {
    key: "supervisionPresence",
    question: "Percibe presencia y supervision adecuada por parte de GARD?",
    labels: ["Muy insuficiente", "Insuficiente", "Aceptable", "Buena", "Excelente"],
  },
  {
    key: "incidentResponse",
    question: "Cuando ocurre un problema o incidente, la respuesta de GARD es oportuna y eficaz?",
    labels: ["Muy deficiente", "Deficiente", "Regular", "Buena", "Excelente"],
  },
];

function SurveyRating({
  value,
  onChange,
  labels,
}: {
  value: number | null;
  onChange: (v: number) => void;
  labels: string[];
}) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex h-11 flex-1 items-center justify-center rounded-lg border-2 text-sm font-bold transition-all ${
              value === n
                ? n >= 4
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                  : n === 3
                    ? "border-amber-500 bg-amber-500/20 text-amber-400"
                    : "border-red-500 bg-red-500/20 text-red-400"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[4]}</span>
      </div>
    </div>
  );
}

function NpsRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex h-10 flex-1 items-center justify-center rounded border text-xs font-bold transition-all ${
              value === n
                ? n >= 9
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                  : n >= 7
                    ? "border-amber-500 bg-amber-500/20 text-amber-400"
                    : "border-red-500 bg-red-500/20 text-red-400"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Nada probable</span>
        <span>Totalmente probable</span>
      </div>
    </div>
  );
}

export function Step5Closure({
  visit,
  evaluations,
  checklistItems,
  checklistResults,
  findings,
  openFindings,
  capturedPhotos,
  photoCategories,
  generalComments,
  clientContacted,
  clientContactName,
  clientContactRole,
  surveyData,
  signatureDataUrl,
  validationPhotoPreview,
  validationType,
  bookUpToDate,
  onGeneralCommentsChange,
  onClientContactedChange,
  onClientContactNameChange,
  onClientContactRoleChange,
  onSurveyDataChange,
  onSignatureChange,
  onValidationPhotoChange,
  onValidationTypeChange,
  onFinalize,
  onPrev,
  saving,
}: Props) {
  const validationPhotoInputRef = useRef<HTMLInputElement>(null);

  // ── Summary calculations ──
  const checkInAt = new Date(visit.checkInAt);
  const now = new Date();
  const durationMinutes = Math.round((now.getTime() - checkInAt.getTime()) / 60000);
  const isExpress = durationMinutes < 15;

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
  const checklistPct = totalChecklist > 0 ? Math.round((checkedCount / totalChecklist) * 100) : 0;

  const mandatoryPhotos = photoCategories.filter((c) => c.isMandatory);
  const mandatoryPhotosFulfilled = mandatoryPhotos.filter(
    (c) => capturedPhotos.some((p) => p.categoryId === c.id),
  ).length;

  const newFindings = findings.filter((f) => f.status === "open");

  const guardsOk =
    visit.guardsExpected === null ||
    visit.guardsFound === null ||
    visit.guardsExpected === visit.guardsFound;

  // Survey average (Q1-Q6, scale 1-5)
  const surveyScores = [
    surveyData.serviceQuality,
    surveyData.scheduleCompliance,
    surveyData.personalPresentation,
    surveyData.professionalism,
    surveyData.supervisionPresence,
    surveyData.incidentResponse,
  ].filter((s): s is number => s !== null);
  const surveyAvg =
    surveyScores.length > 0
      ? surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length
      : null;

  // Validation: if contacted, needs all 6 rating questions + NPS + validation
  const surveyComplete =
    surveyData.serviceQuality !== null &&
    surveyData.scheduleCompliance !== null &&
    surveyData.personalPresentation !== null &&
    surveyData.professionalism !== null &&
    surveyData.supervisionPresence !== null &&
    surveyData.incidentResponse !== null &&
    surveyData.hasUrgentRisk !== null &&
    surveyData.npsScore !== null;
  const hasValidation = validationType === "signature" ? !!signatureDataUrl : validationType === "photo" ? !!validationPhotoPreview : false;
  const canFinalize = !clientContacted || (
    clientContactName.trim() !== "" &&
    surveyComplete &&
    hasValidation
  );

  // Tags
  const tags: { label: string; color: string }[] = [];
  if (isExpress) tags.push({ label: "Express (<15 min)", color: "text-amber-400 bg-amber-500/10" });
  if (!guardsOk) tags.push({ label: "Discrepancia dotacion", color: "text-amber-400 bg-amber-500/10" });
  if (newFindings.length > 0) tags.push({ label: `${newFindings.length} hallazgo(s) nuevo(s)`, color: "text-red-400 bg-red-500/10" });
  if (surveyData.hasUrgentRisk) tags.push({ label: "Riesgo urgente", color: "text-red-400 bg-red-500/10" });

  function updateSurveyField<K extends keyof SurveyData>(key: K, value: SurveyData[K]) {
    onSurveyDataChange({ ...surveyData, [key]: value });
  }

  function handleValidationPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (validationPhotoPreview) URL.revokeObjectURL(validationPhotoPreview);
    const preview = URL.createObjectURL(file);
    onValidationPhotoChange(file, preview);
    onValidationTypeChange("photo");
    if (validationPhotoInputRef.current) validationPhotoInputRef.current.value = "";
  }

  function resetSurvey() {
    onClientContactedChange(false);
    onClientContactNameChange("");
    onClientContactRoleChange("");
    onSurveyDataChange({
      serviceQuality: null,
      scheduleCompliance: null,
      personalPresentation: null,
      professionalism: null,
      supervisionPresence: null,
      incidentResponse: null,
      hasUrgentRisk: null,
      urgentRiskDetail: "",
      npsScore: null,
      additionalComments: "",
    });
    onSignatureChange(null);
    onValidationPhotoChange(null, null);
    onValidationTypeChange(null);
  }

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
            rows={3}
            className="text-sm"
          />
        </div>

        {/* Client survey section */}
        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">Encuesta cliente GARD</p>

          <div className="space-y-2">
            <Label className="text-xs">Contacto al cliente?</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onClientContactedChange(true)}
                className={`flex-1 rounded-lg border-2 p-2 text-center text-sm font-medium transition ${
                  clientContacted
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : "border-border text-muted-foreground"
                }`}
              >
                Si
              </button>
              <button
                type="button"
                onClick={resetSurvey}
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
              {/* Contact info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre del contacto</Label>
                  <Input
                    value={clientContactName}
                    onChange={(e) => onClientContactNameChange(e.target.value)}
                    placeholder="Nombre"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cargo</Label>
                  <Input
                    value={clientContactRole}
                    onChange={(e) => onClientContactRoleChange(e.target.value)}
                    placeholder="Cargo"
                    className="h-11"
                  />
                </div>
              </div>

              {/* Survey questions Q1-Q6 */}
              <div className="space-y-4 pt-2">
                {SURVEY_QUESTIONS.map((q, idx) => (
                  <div key={q.key} className="space-y-1">
                    <Label className="text-xs">
                      {idx + 1}. {q.question}
                    </Label>
                    <SurveyRating
                      value={surveyData[q.key]}
                      onChange={(v) => updateSurveyField(q.key, v)}
                      labels={q.labels}
                    />
                  </div>
                ))}

                {/* Q7: Urgent risk — Sí/No */}
                <div className="space-y-2">
                  <Label className="text-xs">
                    7. Existe actualmente algun riesgo o preocupacion relevante que debamos abordar de inmediato?
                  </Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateSurveyField("hasUrgentRisk", true)}
                      className={`flex-1 rounded-lg border-2 p-2.5 text-center text-sm font-medium transition ${
                        surveyData.hasUrgentRisk === true
                          ? "border-red-500 bg-red-500/20 text-red-400"
                          : "border-border text-muted-foreground hover:border-red-500/50"
                      }`}
                    >
                      Si
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateSurveyField("hasUrgentRisk", false);
                        updateSurveyField("urgentRiskDetail", "");
                      }}
                      className={`flex-1 rounded-lg border-2 p-2.5 text-center text-sm font-medium transition ${
                        surveyData.hasUrgentRisk === false
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-emerald-500/50"
                      }`}
                    >
                      No
                    </button>
                  </div>
                  {surveyData.hasUrgentRisk && (
                    <div className="space-y-1">
                      <Textarea
                        value={surveyData.urgentRiskDetail}
                        onChange={(e) => updateSurveyField("urgentRiskDetail", e.target.value)}
                        placeholder="Describe el riesgo o preocupacion..."
                        rows={2}
                        className="text-sm"
                      />
                      <p className="text-[10px] text-amber-400">
                        Se creara un hallazgo critico al finalizar la visita
                      </p>
                    </div>
                  )}
                </div>

                {/* Q8: NPS */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    8. Recomendaria nuestro servicio? (NPS)
                  </Label>
                  <NpsRating
                    value={surveyData.npsScore}
                    onChange={(v) => updateSurveyField("npsScore", v)}
                  />
                </div>

                {/* Q9: Additional comments */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    9. Comentarios adicionales del cliente
                  </Label>
                  <Textarea
                    value={surveyData.additionalComments}
                    onChange={(e) => updateSurveyField("additionalComments", e.target.value)}
                    placeholder="Comentarios adicionales..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Validation section */}
              <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-medium">
                  Validacion del cliente (obligatorio)
                </p>
                <p className="text-[10px] text-muted-foreground">
                  El cliente confirma que respondio esta encuesta
                </p>

                {/* Signature option */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      onValidationTypeChange("signature");
                      onValidationPhotoChange(null, null);
                    }}
                    className={`w-full rounded-lg border-2 p-2 text-left text-sm transition ${
                      validationType === "signature"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    Firma digital
                  </button>

                  {validationType === "signature" && (
                    <SignatureCanvas
                      existingDataUrl={signatureDataUrl}
                      onConfirm={(dataUrl) => onSignatureChange(dataUrl)}
                      onClear={() => onSignatureChange(null)}
                    />
                  )}
                </div>

                <p className="text-center text-[10px] text-muted-foreground">— o bien —</p>

                {/* Photo validation option */}
                <div className="space-y-2">
                  <input
                    ref={validationPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={handleValidationPhotoCapture}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onValidationTypeChange("photo");
                      onSignatureChange(null);
                      validationPhotoInputRef.current?.click();
                    }}
                    className={`w-full rounded-lg border-2 p-2 text-left text-sm transition ${
                      validationType === "photo"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Camera className="mr-2 inline h-4 w-4" />
                    Foto con el cliente
                  </button>

                  {validationType === "photo" && validationPhotoPreview && (
                    <div className="flex items-center gap-3">
                      <img
                        src={validationPhotoPreview}
                        alt="Foto con cliente"
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                      <div className="text-xs text-emerald-400">Foto capturada</div>
                    </div>
                  )}
                </div>

                {!hasValidation && (
                  <p className="text-xs text-amber-400">
                    Debes validar con firma o foto para guardar la encuesta
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Visit summary */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-3">
          <p className="text-sm font-medium">Resumen de la visita</p>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                Duracion
              </span>
              <span className="flex items-center gap-1">
                {durationMinutes} min
                {isExpress && (
                  <Badge variant="warning" className="text-[10px] ml-1">Express</Badge>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-3 w-3 text-muted-foreground" />
                Guardias
              </span>
              <span className="flex items-center gap-1">
                {visit.guardsFound ?? "—"}/{visit.guardsExpected ?? "—"}
                {guardsOk ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Star className="h-3 w-3 text-muted-foreground" />
                Calificacion
              </span>
              <span className={`font-medium ${
                avgRating !== null
                  ? avgRating >= 4
                    ? "text-emerald-400"
                    : avgRating >= 3
                      ? "text-amber-400"
                      : "text-red-400"
                  : "text-muted-foreground"
              }`}>
                {avgRating !== null ? `${avgRating.toFixed(1)}/5` : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ClipboardCheck className="h-3 w-3 text-muted-foreground" />
                Checklist
              </span>
              <span className={`flex items-center gap-1 ${
                checklistPct >= 80 ? "text-emerald-400" : checklistPct >= 50 ? "text-amber-400" : "text-red-400"
              }`}>
                {checkedCount}/{totalChecklist} ({checklistPct}%)
                {checklistPct >= 80 ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                Libro
              </span>
              <span className={bookUpToDate ? "text-emerald-400" : bookUpToDate === false ? "text-red-400" : "text-muted-foreground"}>
                {bookUpToDate === true ? "Al dia" : bookUpToDate === false ? "No al dia" : "—"}
                {bookUpToDate === true && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                {bookUpToDate === false && <AlertTriangle className="ml-1 inline h-3 w-3" />}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                Hallazgos nuevos
              </span>
              <span className={newFindings.length > 0 ? "text-amber-400" : "text-muted-foreground"}>
                {newFindings.length}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ImageIcon className="h-3 w-3 text-muted-foreground" />
                Fotos
              </span>
              <span>
                {capturedPhotos.length}
                {mandatoryPhotos.length > 0 && (
                  <span className={`ml-1 ${
                    mandatoryPhotosFulfilled === mandatoryPhotos.length
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}>
                    ({mandatoryPhotosFulfilled}/{mandatoryPhotos.length} oblig.)
                  </span>
                )}
              </span>
            </div>

            {clientContacted && surveyAvg !== null && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Star className="h-3 w-3 text-muted-foreground" />
                  Encuesta cliente
                </span>
                <span className={`flex items-center gap-1 ${
                  surveyAvg >= 4 ? "text-emerald-400" : surveyAvg >= 3 ? "text-amber-400" : "text-red-400"
                }`}>
                  {surveyAvg.toFixed(1)}/5
                  {hasValidation && <CheckCircle2 className="h-3 w-3" />}
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {tags.map((tag) => (
                <span key={tag.label} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tag.color}`}>
                  {tag.label}
                </span>
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
            onClick={onFinalize}
            disabled={saving || !canFinalize}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {saving ? "Finalizando..." : "Finalizar visita"}
          </Button>
        </div>

        {clientContacted && !canFinalize && (
          <p className="text-center text-xs text-amber-400">
            {!clientContactName.trim()
              ? "Falta nombre del contacto"
              : !surveyComplete
                ? "Faltan preguntas de la encuesta"
                : "Falta validacion (firma o foto)"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
