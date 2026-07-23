"use client";

/**
 * VisitaTecnicaForm — Multi-step form for creating/editing a visita técnica.
 * Steps:
 *   1. Instalación + Check-in
 *   2. Situación de seguridad actual
 *   3. Servicios requeridos
 *   4. Informe general
 *   5. Encuesta cliente + firma
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Pen,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SupervisorInstallation } from "@/lib/portal-supervisor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SimpleSelect } from "@/components/ui/simple-select";

interface Props {
  installations: SupervisorInstallation[];
  visitaId?: string; // if editing an existing visita
  onBack: () => void;
  onComplete: () => void;
}

interface FormData {
  installationId: string;
  accountId: string;
  // Step 2
  hasSecurityCurrently: boolean | null;
  currentSecurityCompany: string;
  guardsNeeded: string;
  guardShiftType: string;
  guardSalaryRange: string;
  // Step 3
  requiresTransport: boolean;
  transportNotes: string;
  requiresMeals: boolean;
  mealNotes: string;
  requiresExams: boolean;
  examNotes: string;
  requiresEquipment: boolean;
  equipmentNotes: string;
  requiresUniform: boolean;
  uniformNotes: string;
  // Step 4
  generalReport: string;
  securityRisks: string;
  recommendations: string;
  // Step 5
  surveyContactName: string;
  surveyContactRole: string;
  surveyHowDidYouHear: string;
  surveyVisitOpinion: string;
  surveyExpectations: string;
  surveyCurrentPainPoints: string;
  surveySignatureUrl: string;
}

const STEPS = ["Instalación", "Seguridad actual", "Servicios", "Informe", "Encuesta"];

export function VisitaTecnicaForm({ installations, visitaId: initialVisitaId, onBack, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [visitaId, setVisitaId] = useState<string | undefined>(initialVisitaId);
  const [saving, setSaving] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [signatureUrl, setSignatureUrl] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null) as React.RefObject<HTMLCanvasElement | null>;
  const [drawing, setDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const photoRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>;

  const [form, setForm] = useState<FormData>({
    installationId: installations[0]?.id ?? "",
    accountId: installations[0]?.accountId ?? "",
    hasSecurityCurrently: null,
    currentSecurityCompany: "",
    guardsNeeded: "",
    guardShiftType: "",
    guardSalaryRange: "",
    requiresTransport: false,
    transportNotes: "",
    requiresMeals: false,
    mealNotes: "",
    requiresExams: false,
    examNotes: "",
    requiresEquipment: false,
    equipmentNotes: "",
    requiresUniform: false,
    uniformNotes: "",
    generalReport: "",
    securityRisks: "",
    recommendations: "",
    surveyContactName: "",
    surveyContactRole: "",
    surveyHowDidYouHear: "",
    surveyVisitOpinion: "",
    surveyExpectations: "",
    surveyCurrentPainPoints: "",
    surveySignatureUrl: "",
  });

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const [preselectedInstallation, setPreselectedInstallation] = useState<{
    id: string;
    name: string;
    address: string | null;
    accountId: string;
    accountName: string;
  } | null>(null);
  const [loadingVisita, setLoadingVisita] = useState(!!initialVisitaId);

  // Load existing visit when visitaId is provided
  useEffect(() => {
    if (!initialVisitaId) {
      setLoadingVisita(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/portal/supervisor/visitas-tecnicas/${initialVisitaId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.success || !json.data) return;
        const v = json.data;
        setForm((f) => ({
          ...f,
          installationId: v.installationId ?? f.installationId,
          accountId: v.accountId ?? f.accountId,
          hasSecurityCurrently: v.hasSecurityCurrently ?? f.hasSecurityCurrently,
          currentSecurityCompany: v.currentSecurityCompany ?? f.currentSecurityCompany,
          guardsNeeded: v.guardsNeeded != null ? String(v.guardsNeeded) : f.guardsNeeded,
          guardShiftType: v.guardShiftType ?? f.guardShiftType,
          guardSalaryRange: v.guardSalaryRange ?? f.guardSalaryRange,
          requiresTransport: v.requiresTransport ?? f.requiresTransport,
          transportNotes: v.transportNotes ?? f.transportNotes,
          requiresMeals: v.requiresMeals ?? f.requiresMeals,
          mealNotes: v.mealNotes ?? f.mealNotes,
          requiresExams: v.requiresExams ?? f.requiresExams,
          examNotes: v.examNotes ?? f.examNotes,
          requiresEquipment: v.requiresEquipment ?? f.requiresEquipment,
          equipmentNotes: v.equipmentNotes ?? f.equipmentNotes,
          requiresUniform: v.requiresUniform ?? f.requiresUniform,
          uniformNotes: v.uniformNotes ?? f.uniformNotes,
          generalReport: v.generalReport ?? f.generalReport,
          securityRisks: v.securityRisks ?? f.securityRisks,
          recommendations: v.recommendations ?? f.recommendations,
          surveyContactName: v.surveyContactName ?? f.surveyContactName,
          surveyContactRole: v.surveyContactRole ?? f.surveyContactRole,
          surveyHowDidYouHear: v.surveyHowDidYouHear ?? f.surveyHowDidYouHear,
          surveyVisitOpinion: v.surveyVisitOpinion ?? f.surveyVisitOpinion,
          surveyExpectations: v.surveyExpectations ?? f.surveyExpectations,
          surveyCurrentPainPoints: v.surveyCurrentPainPoints ?? f.surveyCurrentPainPoints,
        }));
        setCheckedIn(!!v.checkInAt);
        setPhotos(Array.isArray(v.photos) ? v.photos : []);
        setSignatureUrl(v.surveySignatureUrl ?? "");
        if (v.installation && v.account) {
          setPreselectedInstallation({
            id: v.installation.id,
            name: v.installation.name,
            address: v.installation.address ?? null,
            accountId: v.account.id,
            accountName: v.account.name,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingVisita(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialVisitaId]);

  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [deletingOnBack, setDeletingOnBack] = useState(false);

  async function createVisita(): Promise<string | null> {
    try {
      const res = await fetch("/api/portal/supervisor/visitas-tecnicas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: form.installationId,
          accountId: form.accountId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const id = json.data.id;
        setVisitaId(id);
        return id;
      }
      toast.error("Error al crear visita");
    } catch {
      toast.error("Error de conexión");
    }
    return null;
  }

  async function save(extraData?: Record<string, unknown>) {
    if (!visitaId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/supervisor/visitas-tecnicas/${visitaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasSecurityCurrently: form.hasSecurityCurrently,
          currentSecurityCompany: form.currentSecurityCompany || undefined,
          guardsNeeded: form.guardsNeeded ? Number(form.guardsNeeded) : undefined,
          guardShiftType: form.guardShiftType || undefined,
          guardSalaryRange: form.guardSalaryRange || undefined,
          requiresTransport: form.requiresTransport,
          transportNotes: form.transportNotes || undefined,
          requiresMeals: form.requiresMeals,
          mealNotes: form.mealNotes || undefined,
          requiresExams: form.requiresExams,
          examNotes: form.examNotes || undefined,
          requiresEquipment: form.requiresEquipment,
          equipmentNotes: form.equipmentNotes || undefined,
          requiresUniform: form.requiresUniform,
          uniformNotes: form.uniformNotes || undefined,
          generalReport: form.generalReport || undefined,
          securityRisks: form.securityRisks || undefined,
          recommendations: form.recommendations || undefined,
          photos: photos.length ? photos : undefined,
          surveyContactName: form.surveyContactName || undefined,
          surveyContactRole: form.surveyContactRole || undefined,
          surveyHowDidYouHear: form.surveyHowDidYouHear || undefined,
          surveyVisitOpinion: form.surveyVisitOpinion || undefined,
          surveyExpectations: form.surveyExpectations || undefined,
          surveyCurrentPainPoints: form.surveyCurrentPainPoints || undefined,
          surveySignatureUrl: signatureUrl || undefined,
          ...extraData,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Error al guardar los datos");
      }
    } catch {
      toast.error("Error de conexión al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckIn() {
    let id: string | null | undefined = visitaId;
    if (!id) {
      id = await createVisita();
      if (!id) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/supervisor/visitas-tecnicas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn: true }),
      });
      const json = await res.json();
      if (json.success) {
        setCheckedIn(true);
        toast.success("Check-in registrado");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/portal/rondas/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.success && json.data?.url) setPhotos((p) => [...p, json.data.url]);
      else toast.error("Error al subir foto");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUploadingPhoto(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  // Canvas signature
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastPos.current) return;
    e.preventDefault();
    const pos = getPos(e, canvas);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw() {
    setDrawing(false);
    lastPos.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureUrl("");
  }

  async function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    // Convert to blob and upload
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append("file", blob, "firma.png");
    const res = await fetch("/api/portal/rondas/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (json.success && json.data?.url) {
      setSignatureUrl(json.data.url);
      toast.success("Firma guardada");
    }
  }

  async function handleNext() {
    if (step === 0) {
      if (!visitaId) {
        const id = await createVisita();
        if (!id) return;
      }
    }
    await save();
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    }
  }

  async function handleComplete() {
    await save({ surveySignatureUrl: signatureUrl || undefined, complete: true });
    toast.success("Visita técnica completada");
    onComplete();
  }

  function handleBackClick() {
    if (visitaId && !initialVisitaId) {
      setBackConfirmOpen(true);
    } else {
      onBack();
    }
  }

  async function handleConfirmBack() {
    if (!visitaId) return;
    setDeletingOnBack(true);
    try {
      const res = await fetch(`/api/portal/supervisor/visitas-tecnicas/${visitaId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al eliminar");
      setBackConfirmOpen(false);
      onBack();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo eliminar la visita");
    } finally {
      setDeletingOnBack(false);
    }
  }

  if (loadingVisita) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
        <p className="text-sm text-muted-foreground">Cargando visita...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <button
          onClick={handleBackClick}
          className="p-2 rounded-lg bg-muted border border-border text-muted-foreground"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{visitaId ? "Visita técnica" : "Nueva Visita Técnica"}</p>
          <p className="text-[11px] text-muted-foreground">
            Paso {step + 1} de {STEPS.length}: {STEPS[step]}
          </p>
          {!initialVisitaId && (
            <p className="text-[10px] text-amber-400/90 mt-0.5">
              No puedes dejar visitas en borrador. Si inicias, debes completarla.
            </p>
          )}
        </div>
        {saving && <Loader2 size={16} className="animate-spin text-muted-foreground flex-shrink-0" />}
      </div>

      {/* Progress */}
      <div className="flex gap-1 px-4 py-2 flex-shrink-0">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full transition-colors ${
              i <= step ? "bg-blue-500" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 0 && (
          <Step1
            installations={installations}
            preselectedInstallation={preselectedInstallation}
            installationId={form.installationId}
            checkedIn={checkedIn}
            onInstallationChange={(id, accountId) => {
              set("installationId", id);
              set("accountId", accountId);
            }}
            onCheckIn={handleCheckIn}
            saving={saving}
          />
        )}
        {step === 1 && (
          <Step2
            form={form}
            set={set}
          />
        )}
        {step === 2 && (
          <Step3
            form={form}
            set={set}
          />
        )}
        {step === 3 && (
          <Step4
            form={form}
            set={set}
            photos={photos}
            uploadingPhoto={uploadingPhoto}
            photoRef={photoRef}
            onPhoto={handlePhoto}
            onRemovePhoto={(url) => setPhotos((p) => p.filter((x) => x !== url))}
          />
        )}
        {step === 4 && (
          <Step5
            form={form}
            set={set}
            canvasRef={canvasRef}
            drawing={drawing}
            signatureUrl={signatureUrl}
            onStartDraw={startDraw}
            onDraw={draw}
            onEndDraw={endDraw}
            onClearSignature={clearSignature}
            onSaveSignature={saveSignature}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t border-border flex-shrink-0">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeft size={16} />
            Anterior
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Siguiente
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Completar visita
          </button>
        )}
      </div>

      <ConfirmDialog
        open={backConfirmOpen}
        onOpenChange={setBackConfirmOpen}
        title="No puedes dejar visitas en borrador"
        description="Si sales sin completar, la visita se eliminará. Debes terminar la visita o eliminarla. ¿Salir de todos modos?"
        confirmLabel="Sí, eliminar y salir"
        onConfirm={handleConfirmBack}
        variant="destructive"
        loading={deletingOnBack}
        loadingLabel="Eliminando..."
      />
    </div>
  );
}

// ─── Step components ────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  name: string;
  address: string | null;
  accountId: string;
  accountName: string;
}

function Step1({
  installations,
  preselectedInstallation,
  installationId,
  checkedIn,
  onInstallationChange,
  onCheckIn,
  saving,
}: {
  installations: SupervisorInstallation[];
  preselectedInstallation?: { id: string; name: string; address: string | null; accountId: string; accountName: string } | null;
  installationId: string;
  checkedIn: boolean;
  onInstallationChange: (id: string, accountId: string) => void;
  onCheckIn: () => void;
  saving: boolean;
}) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const knownIds = new Set(installations.map((i) => i.id));
  const preselected = preselectedInstallation && !knownIds.has(preselectedInstallation.id)
    ? [preselectedInstallation]
    : [];
  const allOptions = [...preselected, ...installations];
  const inst =
    allOptions.find((i) => i.id === installationId) ??
    searchResults.find((r) => r.id === installationId);

  useEffect(() => {
    if (!searchMode || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/portal/supervisor/search-installations?q=${encodeURIComponent(searchQuery)}`
        );
        if (res.ok) {
          const json = await res.json();
          const known = new Set([...installations.map((i) => i.id), ...(preselectedInstallation ? [preselectedInstallation.id] : [])]);
          setSearchResults(
            (json.data ?? []).filter((r: SearchResult) => !known.has(r.id))
          );
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMode, installations, preselectedInstallation]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <Field label="Instalación *">
        {!searchMode ? (
          <div className="flex flex-col gap-2">
            <SimpleSelect
              value={installationId}
              onValueChange={(v) => {
                const i = allOptions.find((x) => x.id === v);
                onInstallationChange(v, i?.accountId ?? "");
              }}
              className="form-select"
              options={allOptions.map((i) => ({
                value: i.id,
                label: `${i.name} — ${i.accountName}`,
              }))}
            />
            <button
              type="button"
              onClick={() => setSearchMode(true)}
              className="text-xs text-blue-400 hover:text-blue-300 self-start"
            >
              Buscar instalación prospecto...
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar prospecto por nombre..."
                className="form-input pl-9"
              />
            </div>
            {searching && (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card opai-glass-soft-m p-1">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onInstallationChange(r.id, r.accountId);
                      setSearchMode(false);
                      setSearchQuery("");
                    }}
                    className="text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <p className="text-xs font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.accountName}</p>
                  </button>
                ))}
              </div>
            )}
            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchMode(false);
                setSearchQuery("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground self-start"
            >
              Volver a mis instalaciones
            </button>
          </div>
        )}
      </Field>

      {inst && "address" in inst && inst.address && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-card opai-glass-soft-m border border-border">
          <MapPin size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{inst.address}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-3 py-4">
        {checkedIn ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 size={40} className="text-emerald-400" />
            <p className="text-sm text-emerald-400 font-medium">Check-in registrado</p>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={onCheckIn}
              disabled={saving}
              className="w-24 h-24 rounded-full bg-blue-600 flex flex-col items-center justify-center gap-2 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={28} className="animate-spin text-white" />
              ) : (
                <MapPin size={28} className="text-white" />
              )}
            </button>
            <p className="text-sm text-muted-foreground">Toca para registrar check-in</p>
            <p className="text-xs text-muted-foreground">Opcional — puedes continuar sin check-in</p>
          </>
        )}
      </div>

      <style jsx>{`
        .form-select, .form-input {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
        }
        .form-input::placeholder { color: rgb(82 82 91); }
      `}</style>
    </div>
  );
}

function Step2({ form, set }: { form: FormData; set: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <Field label="¿Tiene seguridad actualmente?">
        <div className="flex gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => set("hasSecurityCurrently", v)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                form.hasSecurityCurrently === v
                  ? "bg-blue-600 text-white"
                  : "bg-muted border border-border text-muted-foreground"
              }`}
            >
              {v ? "Sí" : "No"}
            </button>
          ))}
        </div>
      </Field>

      {form.hasSecurityCurrently && (
        <Field label="Empresa de seguridad actual">
          <input
            value={form.currentSecurityCompany}
            onChange={(e) => set("currentSecurityCompany", e.target.value)}
            placeholder="Nombre empresa..."
            className="form-input"
          />
        </Field>
      )}

      <Field label="Guardias requeridos">
        <input
          type="number"
          min="0"
          value={form.guardsNeeded}
          onChange={(e) => set("guardsNeeded", e.target.value)}
          placeholder="0"
          className="form-input"
        />
      </Field>

      <Field label="Tipo de turno">
        <SimpleSelect
          value={form.guardShiftType}
          onValueChange={(v) => set("guardShiftType", v)}
          className="form-select"
          options={[
            { value: "", label: "Seleccionar..." },
            { value: "diurno", label: "Diurno" },
            { value: "nocturno", label: "Nocturno" },
            { value: "24h", label: "24 horas" },
            { value: "rotativo", label: "Rotativo" },
          ]}
        />
      </Field>

      <Field label="Rango salarial (referencial)">
        <input
          value={form.guardSalaryRange}
          onChange={(e) => set("guardSalaryRange", e.target.value)}
          placeholder="Ej: $600.000 - $700.000"
          className="form-input"
        />
      </Field>

      <style jsx>{`
        .form-input, .form-select {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
        }
        .form-input::placeholder { color: rgb(82 82 91); }
      `}</style>
    </div>
  );
}

function Step3({ form, set }: { form: FormData; set: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  const services: Array<{
    key: keyof FormData;
    notesKey: keyof FormData;
    label: string;
  }> = [
    { key: "requiresTransport", notesKey: "transportNotes", label: "Transporte" },
    { key: "requiresMeals", notesKey: "mealNotes", label: "Alimentación" },
    { key: "requiresExams", notesKey: "examNotes", label: "Exámenes médicos" },
    { key: "requiresEquipment", notesKey: "equipmentNotes", label: "Equipamiento" },
    { key: "requiresUniform", notesKey: "uniformNotes", label: "Uniforme" },
  ];

  return (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-xs text-muted-foreground">Indica qué servicios adicionales requiere la instalación.</p>
      {services.map(({ key, notesKey, label }) => (
        <div key={key} className="flex flex-col gap-2">
          <button
            onClick={() => set(key, !form[key] as FormData[typeof key])}
            className={`flex items-center justify-between w-full p-3.5 rounded-xl border transition-colors ${
              form[key]
                ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                : "bg-muted border-border text-muted-foreground"
            }`}
          >
            <span className="text-sm font-medium">{label}</span>
            <div
              className={`w-5 h-5 rounded flex items-center justify-center ${
                form[key] ? "bg-blue-500" : "bg-muted"
              }`}
            >
              {form[key] && <CheckCircle2 size={12} className="text-white" />}
            </div>
          </button>
          {form[key] && (
            <input
              value={form[notesKey] as string}
              onChange={(e) => set(notesKey, e.target.value as FormData[typeof notesKey])}
              placeholder={`Notas sobre ${label.toLowerCase()}...`}
              className="form-input ml-2"
            />
          )}
        </div>
      ))}
      <style jsx>{`
        .form-input {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
        }
        .form-input::placeholder { color: rgb(82 82 91); }
      `}</style>
    </div>
  );
}

function Step4({
  form,
  set,
  photos,
  uploadingPhoto,
  photoRef,
  onPhoto,
  onRemovePhoto,
}: {
  form: FormData;
  set: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  photos: string[];
  uploadingPhoto: boolean;
  photoRef: React.RefObject<HTMLInputElement | null>;
  onPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (url: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <Field label="Informe general">
        <textarea
          value={form.generalReport}
          onChange={(e) => set("generalReport", e.target.value)}
          rows={4}
          placeholder="Describe el estado general de la instalación..."
          className="form-textarea"
        />
      </Field>

      <Field label="Riesgos de seguridad identificados">
        <textarea
          value={form.securityRisks}
          onChange={(e) => set("securityRisks", e.target.value)}
          rows={3}
          placeholder="Vulnerabilidades, riesgos, puntos críticos..."
          className="form-textarea"
        />
      </Field>

      <Field label="Recomendaciones">
        <textarea
          value={form.recommendations}
          onChange={(e) => set("recommendations", e.target.value)}
          rows={3}
          placeholder="Acciones recomendadas..."
          className="form-textarea"
        />
      </Field>

      <Field label="Fotos">
        <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
        <div className="flex flex-wrap gap-2">
          {photos.map((url, i) => (
            <div key={i} className="relative w-16 h-16">
              <img src={url} alt="foto" className="w-full h-full object-cover rounded-lg" />
              <button
                onClick={() => onRemovePhoto(url)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
          <button
            onClick={() => photoRef.current?.click()}
            disabled={uploadingPhoto}
            className="w-16 h-16 rounded-lg bg-muted border border-border border-dashed flex items-center justify-center text-muted-foreground hover:border-border transition-colors disabled:opacity-50"
          >
            {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
        </div>
      </Field>

      <style jsx>{`
        .form-textarea {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
          resize: none;
        }
        .form-textarea::placeholder { color: rgb(82 82 91); }
      `}</style>
    </div>
  );
}

function Step5({
  form,
  set,
  canvasRef,
  drawing,
  signatureUrl,
  onStartDraw,
  onDraw,
  onEndDraw,
  onClearSignature,
  onSaveSignature,
}: {
  form: FormData;
  set: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  drawing: boolean;
  signatureUrl: string;
  onStartDraw: (e: React.MouseEvent | React.TouchEvent) => void;
  onDraw: (e: React.MouseEvent | React.TouchEvent) => void;
  onEndDraw: () => void;
  onClearSignature: () => void;
  onSaveSignature: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-xs text-muted-foreground">
        Datos del contacto que presenció la visita y su opinión. La firma es opcional — puedes completar la visita sin ella.
      </p>

      <Field label="Nombre del contacto">
        <input value={form.surveyContactName} onChange={(e) => set("surveyContactName", e.target.value)} className="form-input" placeholder="Nombre..." />
      </Field>
      <Field label="Cargo">
        <input value={form.surveyContactRole} onChange={(e) => set("surveyContactRole", e.target.value)} className="form-input" placeholder="Gerente, Jefe de turno..." />
      </Field>
      <Field label="¿Cómo nos conoció?">
        <SimpleSelect value={form.surveyHowDidYouHear} onValueChange={(v) => set("surveyHowDidYouHear", v)} className="form-select"
          options={[
            { value: "", label: "Seleccionar..." },
            { value: "referido", label: "Referido" },
            { value: "redes_sociales", label: "Redes sociales" },
            { value: "google", label: "Google" },
            { value: "llamada_comercial", label: "Llamada comercial" },
            { value: "otro", label: "Otro" },
          ]}
        />
      </Field>
      <Field label="Opinión sobre la visita">
        <SimpleSelect value={form.surveyVisitOpinion} onValueChange={(v) => set("surveyVisitOpinion", v)} className="form-select"
          options={[
            { value: "", label: "Seleccionar..." },
            { value: "excelente", label: "Excelente" },
            { value: "buena", label: "Buena" },
            { value: "regular", label: "Regular" },
            { value: "mala", label: "Mala" },
          ]}
        />
      </Field>
      <Field label="Expectativas del servicio">
        <textarea value={form.surveyExpectations} onChange={(e) => set("surveyExpectations", e.target.value)} rows={2} className="form-textarea" placeholder="¿Qué espera del servicio de seguridad?" />
      </Field>
      <Field label="Problemas actuales con seguridad">
        <textarea value={form.surveyCurrentPainPoints} onChange={(e) => set("surveyCurrentPainPoints", e.target.value)} rows={2} className="form-textarea" placeholder="¿Qué problemas tiene actualmente?" />
      </Field>

      {/* Signature */}
      <Field label="Firma del contacto (opcional)">
        {signatureUrl ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-emerald-500/30">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-400 flex-1">Firma guardada</p>
            <button onClick={onClearSignature} className="text-muted-foreground">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <canvas
              ref={canvasRef}
              width={320}
              height={120}
              className="w-full rounded-xl bg-zinc-900 border border-border touch-none"
              style={{ cursor: "crosshair" }}
              onMouseDown={onStartDraw}
              onMouseMove={onDraw}
              onMouseUp={onEndDraw}
              onMouseLeave={onEndDraw}
              onTouchStart={onStartDraw}
              onTouchMove={onDraw}
              onTouchEnd={onEndDraw}
            />
            <div className="flex gap-2">
              <button
                onClick={onClearSignature}
                className="flex-1 py-2 rounded-lg bg-muted border border-border text-muted-foreground text-xs hover:bg-muted transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={onSaveSignature}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-700 text-white text-xs hover:bg-zinc-600 transition-colors"
              >
                <Pen size={12} />
                Guardar firma
              </button>
            </div>
          </div>
        )}
      </Field>

      <style jsx>{`
        .form-input, .form-select {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
        }
        .form-input::placeholder { color: rgb(82 82 91); }
        .form-textarea {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
          resize: none;
        }
        .form-textarea::placeholder { color: rgb(82 82 91); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
