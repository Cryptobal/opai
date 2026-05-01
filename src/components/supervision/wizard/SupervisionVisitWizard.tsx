"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WizardProgress } from "./WizardProgress";
import { Step1CheckIn } from "./Step1CheckIn";
import { Step2Evaluation } from "./Step2Evaluation";
import { Step3Checklist } from "./Step3Checklist";
import { Step4Evidence } from "./Step4Evidence";
import { Step5Closure } from "./Step5Closure";
import type {
  WizardStep,
  DotacionGuard,
  GuardEvaluation,
  ChecklistItem,
  ChecklistResult,
  Finding,
  PhotoCategory,
  CapturedPhoto,
  VisitData,
  SurveyData,
  InstalacionDocumentType,
  DocumentCheckResult,
  GuardDocCheckResult,
  PendingFinding,
} from "./types";

export function SupervisionVisitWizard({
  onComplete,
  mode = "regular",
}: { onComplete?: () => void; mode?: "regular" | "vra" } = {}) {
  const router = useRouter();
  const isVraMode = mode === "vra";

  // Core state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1);
  const [saving, setSaving] = useState(false);
  const [verificacionesSaved, setVerificacionesSaved] = useState(false);

  // Visit data
  const [visit, setVisit] = useState<VisitData | null>(null);
  const [guards, setGuards] = useState<DotacionGuard[]>([]);

  // Step 2: Evaluations
  const [evaluations, setEvaluations] = useState<GuardEvaluation[]>([]);
  const [installationState, setInstallationState] = useState("normal");
  const [installationStateNotes, setInstallationStateNotes] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [pendingFindings, setPendingFindings] = useState<PendingFinding[]>([]);

  // Step 3: Checklist + Book
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>([]);
  const [openFindings, setOpenFindings] = useState<Finding[]>([]);
  const [bookUpToDate, setBookUpToDate] = useState<boolean | null>(null);
  const [bookLastEntryDate, setBookLastEntryDate] = useState("");
  const [bookNotes, setBookNotes] = useState("");
  const [bookPhotoFile, setBookPhotoFile] = useState<File | null>(null);
  const [bookPhotoPreview, setBookPhotoPreview] = useState<string | null>(null);
  const [puestoPhotoFile, setPuestoPhotoFile] = useState<File | null>(null);
  const [puestoPhotoPreview, setPuestoPhotoPreview] = useState<string | null>(null);
  const [documentTypes, setDocumentTypes] = useState<InstalacionDocumentType[]>([]);
  const [documentResults, setDocumentResults] = useState<DocumentCheckResult[]>([]);
  const [globalDocTypes, setGlobalDocTypes] = useState<InstalacionDocumentType[]>([]);
  const [globalDocResults, setGlobalDocResults] = useState<DocumentCheckResult[]>([]);
  const [guardDocTypes, setGuardDocTypes] = useState<InstalacionDocumentType[]>([]);
  const [guardDocResults, setGuardDocResults] = useState<GuardDocCheckResult[]>([]);

  // Step 4: Photos
  const [photoCategories, setPhotoCategories] = useState<PhotoCategory[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);

  // Step 5: Closure
  const [generalComments, setGeneralComments] = useState("");
  const [clientContacted, setClientContacted] = useState(false);
  const [clientContactName, setClientContactName] = useState("");
  const [clientContactRole, setClientContactRole] = useState("");
  const [surveyData, setSurveyData] = useState<SurveyData>({
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
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [validationPhotoFile, setValidationPhotoFile] = useState<File | null>(null);
  const [validationPhotoPreview, setValidationPhotoPreview] = useState<string | null>(null);
  const [validationType, setValidationType] = useState<"signature" | "photo" | null>(null);

  // Estado del dialog post-checkout en modo VRA
  const [showVraGenerateDialog, setShowVraGenerateDialog] = useState(false);
  const [creatingVraReport, setCreatingVraReport] = useState(false);

  // Step 1 callback: after check-in
  function handleCheckedIn(visitData: VisitData, dotacion: DotacionGuard[], guardsExpected: number) {
    setVisit(visitData);
    setGuards(dotacion);

    // Rehidrata pendingFindings desde draftData si existen (recuperación tras crash)
    const draftPending = (visitData.draftData as { pendingFindings?: PendingFinding[] } | null)
      ?.pendingFindings;
    if (Array.isArray(draftPending) && draftPending.length > 0) {
      setPendingFindings(draftPending);
    }

    // Initialize evaluations from dotation
    const initialEvals: GuardEvaluation[] = dotacion.map((g) => ({
      guardId: g.guardId,
      guardName: g.guardName,
      isReinforcement: g.type === "reinforcement",
      presentationScore: null,
      orderScore: null,
      protocolScore: null,
      observation: "",
    }));
    setEvaluations(initialEvals);

    setCurrentStep(2);
    setMaxReachedStep(2);

    // Pre-fetch data for next steps
    void fetchChecklistItems(visitData.installationId);
    void fetchPhotoCategories(visitData.installationId);
    void fetchOpenFindings(visitData.installationId);
    void fetchDocumentTypes();
    void fetchGlobalDocTypes();
    void fetchGuardDocTypes(dotacion);
  }

  async function fetchChecklistItems(installationId: string) {
    try {
      const res = await fetch(`/api/ops/supervision/installation-checklist/${installationId}`);
      const json = await res.json();
      if (res.ok && json.success) {
        // Skip default items — document types from settings already cover them
        if (!json.isDefault) {
          setChecklistItems(json.data);
        }
      }
    } catch {
      // Use defaults if fetch fails
    }
  }

  async function fetchPhotoCategories(installationId: string) {
    try {
      const res = await fetch(`/api/ops/supervision/installation-photo-categories/${installationId}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setPhotoCategories(json.data);
      }
    } catch {
      // Use defaults if fetch fails
    }
  }

  async function fetchOpenFindings(installationId: string) {
    try {
      const res = await fetch(`/api/ops/supervision/installation-findings/${installationId}?status=open`);
      const json = await res.json();
      if (res.ok && json.success) {
        setOpenFindings(json.data);
      }
    } catch {
      // Ignore errors
    }
  }

  async function fetchDocumentTypes() {
    try {
      const res = await fetch("/api/ops/supervision/document-types");
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const mapped: InstalacionDocumentType[] = json.data.map(
          (t: { tipoDocId?: string; id?: string; code: string; label: string; required?: boolean }) => ({
            code: t.code,
            label: t.label,
            required: t.required ?? false,
            tipoDocId: t.tipoDocId ?? t.id ?? null,
            capa: "instalacion" as const,
          }),
        );
        setDocumentTypes(mapped);
        setDocumentResults(
          mapped.map((d) => ({
            code: d.code,
            isChecked: false,
            lastEntryDate: null,
            photoFile: null,
            photoPreview: null,
            pendingLocalId: null,
            autoFindingId: null,
            autoTicketCode: null,
          })),
        );
      }
    } catch {
      // Ignore errors
    }
  }

  async function fetchGlobalDocTypes() {
    try {
      const res = await fetch("/api/operacional/tipos?capa=global");
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const visitTypes: InstalacionDocumentType[] = json.data
          .filter((t: { obligatorioEnVisita?: boolean }) => t.obligatorioEnVisita)
          .map((t: { id: string; codigo: string; nombre: string; obligatorio?: boolean }) => ({
            code: t.codigo,
            label: t.nombre,
            required: t.obligatorio ?? false,
            tipoDocId: t.id,
            capa: "global" as const,
          }));
        setGlobalDocTypes(visitTypes);
        setGlobalDocResults(
          visitTypes.map((d) => ({
            code: d.code,
            isChecked: false,
            lastEntryDate: null,
            photoFile: null,
            photoPreview: null,
            pendingLocalId: null,
            autoFindingId: null,
            autoTicketCode: null,
          })),
        );
      }
    } catch {
      // Ignore — global doc types are optional
    }
  }

  async function fetchGuardDocTypes(dotacion: DotacionGuard[]) {
    try {
      const res = await fetch("/api/operacional/tipos?capa=guardia");
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const visitTypes: InstalacionDocumentType[] = json.data
          .filter((t: { obligatorioEnVisita?: boolean }) => t.obligatorioEnVisita)
          .map((t: { id: string; codigo: string; nombre: string; obligatorio?: boolean }) => ({
            code: t.codigo,
            label: t.nombre,
            required: t.obligatorio ?? false,
            tipoDocId: t.id,
            capa: "guardia" as const,
          }));
        setGuardDocTypes(visitTypes);
        setGuardDocResults(
          dotacion.map((g) => ({
            guardiaId: g.guardId,
            guardiaName: g.guardName,
            guardiaRut: g.guardRut,
            docs: visitTypes.map((d) => ({
              code: d.code,
              isChecked: false,
              lastEntryDate: null,
              photoFile: null,
              photoPreview: null,
              pendingLocalId: null,
              autoFindingId: null,
              autoTicketCode: null,
            })),
          })),
        );
      }
    } catch {
      // Ignore — guard doc types are optional
    }
  }

  /** Upload a doc verification photo and return its URL */
  async function uploadDocPhoto(visitId: string, file: File, label: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("categoryName", `Verificación: ${label}`);
      const res = await fetch(`/api/ops/supervision/${visitId}/photos`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return json.data.photoUrl as string;
      }
      console.warn(`[WIZARD] Failed to upload doc photo for ${label}:`, json);
      return null;
    } catch (err) {
      console.warn(`[WIZARD] Error uploading doc photo for ${label}:`, err);
      return null;
    }
  }

  /** Collect and POST all doc verificaciones to the verificaciones-fisicas endpoint */
  async function saveVerificaciones(overrides?: {
    global?: DocumentCheckResult[];
    instalacion?: DocumentCheckResult[];
    guardia?: GuardDocCheckResult[];
  }) {
    if (!visit) return;
    if (verificacionesSaved) return;

    const globalSrc = overrides?.global ?? globalDocResults;
    const instSrc = overrides?.instalacion ?? documentResults;
    const guardSrc = overrides?.guardia ?? guardDocResults;

    // Upload all doc verification photos first
    const globalPhotoUrls: Record<string, string> = {};
    for (const result of globalSrc) {
      if (result.photoFile) {
        const url = await uploadDocPhoto(visit.id, result.photoFile, result.code);
        if (url) globalPhotoUrls[result.code] = url;
      }
    }

    const instalacionPhotoUrls: Record<string, string> = {};
    for (const result of instSrc) {
      if (result.photoFile) {
        const url = await uploadDocPhoto(visit.id, result.photoFile, result.code);
        if (url) instalacionPhotoUrls[result.code] = url;
      }
    }

    const guardPhotoUrls: Record<string, Record<string, string>> = {};
    for (const guardResult of guardSrc) {
      guardPhotoUrls[guardResult.guardiaId] = {};
      for (const doc of guardResult.docs) {
        if (doc.photoFile) {
          const url = await uploadDocPhoto(visit.id, doc.photoFile, `${guardResult.guardiaName}-${doc.code}`);
          if (url) guardPhotoUrls[guardResult.guardiaId][doc.code] = url;
        }
      }
    }

    const verificaciones: Array<{
      tipoDocId?: string;
      guardiaDocType?: string;
      capa: "global" | "instalacion" | "guardia";
      installationId: string;
      guardiaId?: string;
      presente: boolean;
      photoUrl?: string;
      hallazgoId?: string;
    }> = [];

    // Global doc results — use tipoDocId (UUID) so la grilla los pueda indexar
    for (const result of globalSrc) {
      const tipo = globalDocTypes.find((t) => t.code === result.code);
      verificaciones.push({
        ...(tipo?.tipoDocId ? { tipoDocId: tipo.tipoDocId } : { guardiaDocType: result.code }),
        capa: "global",
        installationId: visit.installationId,
        presente: result.isChecked,
        ...(globalPhotoUrls[result.code] ? { photoUrl: globalPhotoUrls[result.code] } : {}),
        ...(result.autoFindingId ? { hallazgoId: result.autoFindingId } : {}),
      });
    }

    // Installation doc results — use tipoDocId (UUID)
    for (const result of instSrc) {
      const tipo = documentTypes.find((t) => t.code === result.code);
      verificaciones.push({
        ...(tipo?.tipoDocId ? { tipoDocId: tipo.tipoDocId } : { guardiaDocType: result.code }),
        capa: "instalacion",
        installationId: visit.installationId,
        presente: result.isChecked,
        ...(instalacionPhotoUrls[result.code] ? { photoUrl: instalacionPhotoUrls[result.code] } : {}),
        ...(result.autoFindingId ? { hallazgoId: result.autoFindingId } : {}),
      });
    }

    // Guard doc results — keep guardiaDocType (by design, capa guardia uses codes)
    for (const guardResult of guardSrc) {
      for (const doc of guardResult.docs) {
        const guardUrls = guardPhotoUrls[guardResult.guardiaId] ?? {};
        verificaciones.push({
          guardiaDocType: doc.code,
          capa: "guardia",
          installationId: visit.installationId,
          guardiaId: guardResult.guardiaId,
          presente: doc.isChecked,
          ...(guardUrls[doc.code] ? { photoUrl: guardUrls[doc.code] } : {}),
          ...(doc.autoFindingId ? { hallazgoId: doc.autoFindingId } : {}),
        });
      }
    }

    if (verificaciones.length > 0) {
      const res = await fetch("/api/operacional/verificaciones-fisicas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisionId: visit.id, verificaciones }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn("[WIZARD] Error saving verificaciones:", err);
        // Non-blocking: don't throw, the core wizard flow shouldn't break
      }
    }

    setVerificacionesSaved(true);
  }

  // Step 2 → 3: Save evaluations
  async function handleStep2Next() {
    if (!visit) return;
    setSaving(true);
    try {
      // Save evaluations
      const evalRes = await fetch(`/api/ops/supervision/${visit.id}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluations }),
      });
      if (!evalRes.ok) {
        const err = await evalRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar evaluaciones");
      }

      // Save installation state
      const stateRes = await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationState, installationStateNotes: installationStateNotes || null, wizardStep: 3 }),
      });
      if (!stateRes.ok) {
        const err = await stateRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar estado de instalación");
      }

      setCurrentStep(3);
      setMaxReachedStep((prev) => Math.max(prev, 3) as WizardStep);
      toast.success("Evaluaciones guardadas");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al guardar evaluaciones";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Step 3 → 4: Save checklist + book + upload book photo
  async function handleStep3Next() {
    if (!visit) return;
    setSaving(true);
    try {
      // Save checklist results (only non-default items)
      const itemsToSave = checklistResults.filter((r) => !r.checklistItemId.startsWith("default-"));
      if (itemsToSave.length > 0) {
        const clRes = await fetch(`/api/ops/supervision/${visit.id}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: itemsToSave }),
        });
        if (!clRes.ok) {
          const err = await clRes.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al guardar checklist");
        }
      }

      // Upload puesto de guardia photo (obligatoria)
      if (puestoPhotoFile) {
        const formData = new FormData();
        formData.append("file", puestoPhotoFile);
        formData.append("categoryName", "Puesto de guardia y presentación personal");
        const puestoRes = await fetch(`/api/ops/supervision/${visit.id}/photos`, {
          method: "POST",
          body: formData,
        });
        const puestoJson = await puestoRes.json();
        if (!puestoRes.ok || !puestoJson.success) {
          throw new Error(puestoJson.error ?? "Error al subir foto del puesto de guardia");
        }
      }

      // Upload book photo if present (solo cuando libro al día = Sí)
      let bookPhotoUrl: string | null = null;
      if (bookPhotoFile) {
        const formData = new FormData();
        formData.append("file", bookPhotoFile);
        formData.append("categoryName", "Libro de novedades");
        const photoRes = await fetch(`/api/ops/supervision/${visit.id}/photos`, {
          method: "POST",
          body: formData,
        });
        const photoJson = await photoRes.json();
        if (!photoRes.ok || !photoJson.success) {
          throw new Error(photoJson.error ?? "Error al subir foto del libro");
        }
        bookPhotoUrl = photoJson.data.photoUrl;
      }

      // NOTE: saveVerificaciones se ejecuta al cierre (handleFinalize), no aquí.
      // Esto permite que los hallazgos diferidos (pendingFindings) se persistan
      // primero y mappeen su `hallazgoId` real en cada verificación.

      // Save book data + legacy document checklist
      const documentChecklist: Record<string, boolean> = {};
      for (const item of checklistItems) {
        documentChecklist[item.name] = checklistResults.some(
          (r) => r.checklistItemId === item.id && r.isChecked,
        );
      }
      // Also include document type results
      for (const dr of documentResults) {
        const dt = documentTypes.find((d) => d.code === dr.code);
        if (dt) {
          documentChecklist[dt.label] = dr.isChecked;
        }
      }

      const saveRes = await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookUpToDate,
          bookLastEntryDate: bookLastEntryDate || null,
          bookNotes: bookNotes || null,
          ...(bookPhotoUrl ? { bookPhotoUrl } : {}),
          documentChecklist,
          wizardStep: 4,
        }),
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar verificación");
      }

      setCurrentStep(4);
      setMaxReachedStep((prev) => Math.max(prev, 4) as WizardStep);
      toast.success("Verificación guardada");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al guardar verificación";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Step 4 → 5: Upload photos
  async function handleStep4Next() {
    if (!visit) return;
    setSaving(true);
    try {
      // Upload each photo
      const location = await getCurrentLocation().catch(() => null);
      for (let i = 0; i < capturedPhotos.length; i++) {
        const photo = capturedPhotos[i];
        if (photo.uploaded) continue;

        const formData = new FormData();
        formData.append("file", photo.file);
        if (photo.categoryId) formData.append("categoryId", photo.categoryId);
        formData.append("categoryName", photo.categoryName);
        if (location) {
          formData.append("gpsLat", String(location.lat));
          formData.append("gpsLng", String(location.lng));
        }

        const res = await fetch(`/api/ops/supervision/${visit.id}/photos`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? `Error al subir foto ${i + 1}`);
        }
        setCapturedPhotos((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, uploaded: true, uploadedId: json.data.id } : p,
          ),
        );

        // Also upload to legacy images table for backward compat
        const legacyForm = new FormData();
        legacyForm.append("file", photo.file);
        legacyForm.append("caption", photo.categoryName);
        await fetch(`/api/ops/supervision/${visit.id}/images`, {
          method: "POST",
          body: legacyForm,
        }).catch(() => { /* legacy upload failure is non-critical */ });
      }

      const stepRes = await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wizardStep: 5 }),
      });
      if (!stepRes.ok) {
        const err = await stepRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al avanzar al paso 5");
      }

      setCurrentStep(5);
      setMaxReachedStep((prev) => Math.max(prev, 5) as WizardStep);
      toast.success("Fotos subidas");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al subir fotos";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Step 5: Finalize visit
  async function handleFinalize() {
    if (!visit) return;
    setSaving(true);
    try {
      const location = await getCurrentLocation();

      // Upload validation image (signature or photo) if present
      let clientValidationUrl: string | null = null;
      if (validationType === "signature" && signatureDataUrl) {
        // Convert base64 to File
        const response = await fetch(signatureDataUrl);
        const blob = await response.blob();
        const file = new File([blob], "firma-cliente.png", { type: "image/png" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("categoryName", "Firma cliente");
        const uploadRes = await fetch(`/api/ops/supervision/${visit.id}/photos`, {
          method: "POST",
          body: formData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error ?? "Error al subir firma del cliente");
        }
        clientValidationUrl = uploadJson.data.photoUrl;
      } else if (validationType === "photo" && validationPhotoFile) {
        const formData = new FormData();
        formData.append("file", validationPhotoFile);
        formData.append("categoryName", "Foto con cliente");
        const uploadRes = await fetch(`/api/ops/supervision/${visit.id}/photos`, {
          method: "POST",
          body: formData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error ?? "Error al subir foto de validación");
        }
        clientValidationUrl = uploadJson.data.photoUrl;
      }

      // Calculate survey average (Q1-Q6, all 1-5 scale)
      const surveyScores = [
        surveyData.serviceQuality,
        surveyData.scheduleCompliance,
        surveyData.personalPresentation,
        surveyData.professionalism,
        surveyData.supervisionPresence,
        surveyData.incidentResponse,
      ].filter((s): s is number => s !== null);
      const clientSatisfaction =
        surveyScores.length > 0
          ? Math.round((surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length) * 100) / 100
          : null;

      // Create ticket if urgent risk reported (Q7)
      if (surveyData.hasUrgentRisk && surveyData.urgentRiskDetail.trim()) {
        await fetch(`/api/ops/supervision/${visit.id}/findings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guardId: null,
            category: "operational",
            severity: "critical",
            description: `[Riesgo urgente reportado por cliente] ${surveyData.urgentRiskDetail.trim()}`,
          }),
        }).catch(() => { /* non-blocking */ });
      }

      // 1) Persistir pendingFindings en orden (resuelve hallazgos diferidos del Step 3)
      const localToReal = new Map<string, { id: string; ticketCode: string | null }>();
      for (const pf of pendingFindings) {
        const findingRes = await fetch(`/api/ops/supervision/${visit.id}/findings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: pf.category,
            severity: pf.severity,
            description: pf.description,
            guardId: pf.guardId,
            ...(pf.tipoDocId ? { tipoDocId: pf.tipoDocId } : {}),
            ...(pf.guardiaDocCode ? { guardiaDocCode: pf.guardiaDocCode } : {}),
          }),
        });
        const findingJson = await findingRes.json().catch(() => ({}));
        if (!findingRes.ok || !findingJson.success) {
          toast.error(`Error al crear hallazgo: ${pf.description.slice(0, 50)}`);
          throw new Error(findingJson.error ?? "Error al crear hallazgo diferido");
        }
        localToReal.set(pf.localId, {
          id: findingJson.data.id,
          ticketCode: findingJson.data.ticketCode ?? null,
        });
      }

      // 2) Remap pendingLocalId → IDs reales sobre los doc results
      const remap = (arr: DocumentCheckResult[]): DocumentCheckResult[] =>
        arr.map((dr) => {
          if (!dr.pendingLocalId) return dr;
          const real = localToReal.get(dr.pendingLocalId);
          return real
            ? { ...dr, autoFindingId: real.id, autoTicketCode: real.ticketCode }
            : dr;
        });
      const remappedGlobal = remap(globalDocResults);
      const remappedDoc = remap(documentResults);
      const remappedGuard = guardDocResults.map((g) => ({ ...g, docs: remap(g.docs) }));
      setGlobalDocResults(remappedGlobal);
      setDocumentResults(remappedDoc);
      setGuardDocResults(remappedGuard);

      // 3) Persistir verificaciones físicas con los IDs reales
      await saveVerificaciones({
        global: remappedGlobal,
        instalacion: remappedDoc,
        guardia: remappedGuard,
      });

      const res = await fetch(`/api/ops/supervision/${visit.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          completedVia: "mobile",
          generalComments: generalComments || null,
          installationState,
          installationStateNotes: installationStateNotes || null,
          bookUpToDate,
          bookLastEntryDate: bookLastEntryDate || null,
          bookNotes: bookNotes || null,
          clientContacted,
          clientContactName: clientContactName || null,
          clientSatisfaction,
          clientComment: surveyData.additionalComments || null,
          ...(clientValidationUrl ? { clientValidationUrl } : {}),
          surveyData: clientContacted ? surveyData : null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo cerrar la visita");
      }

      toast.success("Visita finalizada correctamente");

      // Modo VRA: ofrecer generar el informe automáticamente
      if (isVraMode) {
        setShowVraGenerateDialog(true);
      } else {
        if (onComplete) onComplete();
        else router.push("/ops/supervision/historial");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al finalizar visita";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateVraReport() {
    if (!visit) return;
    setCreatingVraReport(true);
    try {
      const res = await fetch(`/api/vra/reports/from-visit/${visit.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const reportId = json.report.id;
      toast.success(
        json.alreadyExisted
          ? "Informe ya existe — abriendo wizard"
          : `Informe creado · ${json.importedFindings} hallazgos · ${json.importedPhotos} fotos importadas`,
      );
      router.push(`/opai/vra/${reportId}/edit`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error creando informe");
      setCreatingVraReport(false);
    }
  }

  async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
    return { lat: coords.latitude, lng: coords.longitude };
  }

  // Pending finding handlers — created locally on toggle, persisted at checkout
  function addPendingFinding(pf: PendingFinding) {
    setPendingFindings((prev) => {
      const filtered = prev.filter((p) => p.source !== pf.source);
      return [...filtered, pf];
    });
  }

  function removePendingFinding(source: string) {
    setPendingFindings((prev) => prev.filter((p) => p.source !== source));
  }

  // Finding handlers
  function handleFindingCreated(finding: Finding) {
    setFindings((prev) => [...prev, finding]);
  }

  async function handleFindingStatusChange(findingId: string, status: string) {
    if (!visit) return;
    try {
      const findingRes = await fetch(`/api/ops/supervision/installation-findings/${visit.installationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId,
          status,
          verifiedInVisitId: visit.id,
        }),
      });
      if (!findingRes.ok) {
        const err = await findingRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al actualizar hallazgo");
      }
      setOpenFindings((prev) => prev.filter((f) => f.id !== findingId));
      toast.success(status === "verified" ? "Hallazgo marcado como resuelto" : "Estado actualizado");
    } catch {
      toast.error("Error al actualizar hallazgo");
    }
  }

  // Photo handlers
  function handlePhotoCapture(photo: CapturedPhoto) {
    setCapturedPhotos((prev) => [...prev, photo]);
  }

  function handlePhotoRemove(index: number) {
    setCapturedPhotos((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  // Save draft
  async function handleSaveDraft() {
    if (!visit) return;
    setSaving(true);
    try {
      const draftPayload: Record<string, unknown> = {
        generalComments: generalComments || null,
        installationState,
        installationStateNotes: installationStateNotes || null,
        bookUpToDate,
        bookLastEntryDate: bookLastEntryDate || null,
        bookNotes: bookNotes || null,
        clientContacted,
        clientContactName: clientContactName || null,
        wizardStep: currentStep,
        draftData: {
          currentStep,
          evaluationsCount: evaluations.filter(
            (e) => e.presentationScore !== null,
          ).length,
          checklistCount: checklistResults.filter((r) => r.isChecked).length,
          photosCount: capturedPhotos.length,
          pendingFindings,
        },
      };

      const draftRes = await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });
      if (!draftRes.ok) {
        const err = await draftRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar borrador");
      }

      // Save evaluations if any
      if (evaluations.some((e) => e.presentationScore !== null)) {
        const evalDraftRes = await fetch(`/api/ops/supervision/${visit.id}/evaluations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluations }),
        });
        if (!evalDraftRes.ok) {
          const err = await evalDraftRes.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al guardar evaluaciones del borrador");
        }
      }

      toast.success("Borrador guardado");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al guardar borrador";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Cancel visit
  async function handleCancelVisit() {
    if (!visit) return;
    setSaving(true);
    try {
      const cancelRes = await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!cancelRes.ok) {
        const err = await cancelRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al cancelar visita");
      }
      toast.success("Visita cancelada");
      if (onComplete) onComplete();
      else router.push("/ops/supervision/historial");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al cancelar visita";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Navigate to step (only if reachable)
  function goToStep(step: WizardStep) {
    if (step <= maxReachedStep) {
      setCurrentStep(step);
    }
  }

  // Count alerts for stepper
  const stepAlerts: Record<number, boolean> = {};
  if (visit) {
    // Step 2: low evaluation
    const ratedEvals = evaluations.filter(
      (e) => e.presentationScore !== null && e.orderScore !== null && e.protocolScore !== null,
    );
    if (ratedEvals.some((e) => {
      const avg = ((e.presentationScore ?? 0) + (e.orderScore ?? 0) + (e.protocolScore ?? 0)) / 3;
      return avg < 3;
    })) {
      stepAlerts[2] = true;
    }
    // Step 3: low compliance
    if (checklistItems.length > 0) {
      const checked = checklistItems.filter((item) =>
        checklistResults.some((r) => r.checklistItemId === item.id && r.isChecked),
      ).length;
      if (checked / checklistItems.length < 0.8) stepAlerts[3] = true;
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Progress indicator */}
      <WizardProgress
        currentStep={currentStep}
        maxReachedStep={maxReachedStep}
        onStepClick={visit ? goToStep : undefined}
        stepAlerts={stepAlerts}
      />

      {/* Draft / Cancel buttons */}
      {visit && (
        <div className="flex gap-2 px-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar borrador"}
          </button>
          <button
            type="button"
            onClick={handleCancelVisit}
            disabled={saving}
            className="rounded-lg border border-status-danger-border px-3 py-2 text-xs text-status-danger-fg hover:bg-status-danger-soft transition disabled:opacity-50"
          >
            Cancelar visita
          </button>
        </div>
      )}

      {/* Step content */}
      {currentStep === 1 && <Step1CheckIn onCheckedIn={handleCheckedIn} mode={mode} />}

      {currentStep === 2 && visit && (
        <Step2Evaluation
          visit={visit}
          guards={guards}
          evaluations={evaluations}
          findings={findings}
          installationState={installationState}
          installationStateNotes={installationStateNotes}
          onEvaluationsChange={setEvaluations}
          onInstallationStateChange={setInstallationState}
          onInstallationStateNotesChange={setInstallationStateNotes}
          onFindingCreated={handleFindingCreated}
          onNext={handleStep2Next}
          onPrev={() => setCurrentStep(1)}
          saving={saving}
          mode={mode}
        />
      )}

      {currentStep === 3 && visit && (
        <Step3Checklist
          visit={visit}
          checklistItems={checklistItems}
          checklistResults={checklistResults}
          openFindings={openFindings}
          findingsCount={findings.length}
          bookUpToDate={bookUpToDate}
          bookLastEntryDate={bookLastEntryDate}
          bookNotes={bookNotes}
          bookPhotoFile={bookPhotoFile}
          bookPhotoPreview={bookPhotoPreview}
          puestoPhotoFile={puestoPhotoFile}
          puestoPhotoPreview={puestoPhotoPreview}
          documentTypes={documentTypes}
          documentResults={documentResults}
          onChecklistChange={setChecklistResults}
          onBookChange={(data) => {
            setBookUpToDate(data.bookUpToDate);
            setBookLastEntryDate(data.bookLastEntryDate);
            setBookNotes(data.bookNotes);
          }}
          onBookPhotoChange={(file, preview) => {
            setBookPhotoFile(file);
            setBookPhotoPreview(preview);
          }}
          onPuestoPhotoChange={(file, preview) => {
            setPuestoPhotoFile(file);
            setPuestoPhotoPreview(preview);
          }}
          onDocumentResultsChange={setDocumentResults}
          globalDocumentTypes={globalDocTypes}
          globalDocumentResults={globalDocResults}
          onGlobalDocumentResultsChange={setGlobalDocResults}
          guardDocTypes={guardDocTypes}
          guardDocResults={guardDocResults}
          onGuardDocResultsChange={setGuardDocResults}
          dotacionGuards={guards}
          onFindingCreated={handleFindingCreated}
          onFindingStatusChange={handleFindingStatusChange}
          onAddPendingFinding={addPendingFinding}
          onRemovePendingFinding={removePendingFinding}
          onFindingResolvedLocally={(id) =>
            setOpenFindings((prev) => prev.filter((f) => f.id !== id))
          }
          onNext={handleStep3Next}
          onPrev={() => setCurrentStep(2)}
          saving={saving}
          mode={mode}
        />
      )}

      {currentStep === 4 && visit && (
        <Step4Evidence
          visit={visit}
          photoCategories={photoCategories}
          capturedPhotos={capturedPhotos}
          findings={findings}
          onPhotoCapture={handlePhotoCapture}
          onPhotoRemove={handlePhotoRemove}
          onFindingCreated={handleFindingCreated}
          onNext={handleStep4Next}
          onPrev={() => setCurrentStep(3)}
          saving={saving}
          mode={mode}
        />
      )}

      {currentStep === 5 && visit && (
        <Step5Closure
          visit={visit}
          evaluations={evaluations}
          checklistItems={checklistItems}
          checklistResults={checklistResults}
          findings={findings}
          openFindings={openFindings}
          capturedPhotos={capturedPhotos}
          photoCategories={photoCategories}
          generalComments={generalComments}
          clientContacted={clientContacted}
          clientContactName={clientContactName}
          clientContactRole={clientContactRole}
          surveyData={surveyData}
          signatureDataUrl={signatureDataUrl}
          validationPhotoPreview={validationPhotoPreview}
          validationType={validationType}
          bookUpToDate={bookUpToDate}
          installationStateNotes={installationStateNotes}
          onGeneralCommentsChange={setGeneralComments}
          onClientContactedChange={setClientContacted}
          onClientContactNameChange={setClientContactName}
          onClientContactRoleChange={setClientContactRole}
          onSurveyDataChange={setSurveyData}
          onSignatureChange={setSignatureDataUrl}
          onValidationPhotoChange={(file, preview) => {
            setValidationPhotoFile(file);
            setValidationPhotoPreview(preview);
          }}
          onValidationTypeChange={setValidationType}
          onFinalize={handleFinalize}
          onPrev={() => setCurrentStep(4)}
          saving={saving}
          pendingFindings={pendingFindings}
          onRemovePendingFinding={removePendingFinding}
        />
      )}

      {/* Dialog post-checkout VRA: ofrecer generar informe ahora */}
      {showVraGenerateDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-t-xl sm:rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🛡️</span>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-100">Visita VRA finalizada</h3>
                <p className="text-xs text-zinc-400">
                  Capturaste {findings.length} hallazgo(s) y {capturedPhotos.length} foto(s)
                </p>
              </div>
            </div>

            <p className="text-sm text-zinc-300">
              ¿Querés generar el <strong>informe de vulnerabilidad</strong> ahora mismo? La IA
              tomará tus hallazgos y fotos como insumo y armará todas las secciones automáticamente.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreateVraReport}
                disabled={creatingVraReport}
                className="w-full px-4 py-3 rounded-lg bg-orange-600 hover:bg-status-warn text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creatingVraReport ? "Creando informe..." : "Sí, generar informe ahora"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowVraGenerateDialog(false);
                  if (onComplete) onComplete();
                  else router.push("/ops/supervision/historial");
                }}
                disabled={creatingVraReport}
                className="w-full px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm disabled:opacity-50"
              >
                Más tarde — generar desde escritorio
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 text-center pt-1">
              Si elegís &quot;más tarde&quot;, los datos quedan guardados en la visita y podés
              importarlos al crear el informe en el módulo VRA.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
