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
} from "./types";

export function SupervisionVisitWizard() {
  const router = useRouter();

  // Core state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1);
  const [saving, setSaving] = useState(false);

  // Visit data
  const [visit, setVisit] = useState<VisitData | null>(null);
  const [guards, setGuards] = useState<DotacionGuard[]>([]);

  // Step 2: Evaluations
  const [evaluations, setEvaluations] = useState<GuardEvaluation[]>([]);
  const [installationState, setInstallationState] = useState("normal");
  const [findings, setFindings] = useState<Finding[]>([]);

  // Step 3: Checklist + Book
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>([]);
  const [openFindings, setOpenFindings] = useState<Finding[]>([]);
  const [bookUpToDate, setBookUpToDate] = useState<boolean | null>(null);
  const [bookLastEntryDate, setBookLastEntryDate] = useState("");
  const [bookNotes, setBookNotes] = useState("");
  const [bookPhotoFile, setBookPhotoFile] = useState<File | null>(null);
  const [bookPhotoPreview, setBookPhotoPreview] = useState<string | null>(null);

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
    complaintsSuggestions: "",
    npsScore: null,
  });
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [validationPhotoFile, setValidationPhotoFile] = useState<File | null>(null);
  const [validationPhotoPreview, setValidationPhotoPreview] = useState<string | null>(null);
  const [validationType, setValidationType] = useState<"signature" | "photo" | null>(null);

  // Step 1 callback: after check-in
  function handleCheckedIn(visitData: VisitData, dotacion: DotacionGuard[], guardsExpected: number) {
    setVisit(visitData);
    setGuards(dotacion);

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
  }

  async function fetchChecklistItems(installationId: string) {
    try {
      const res = await fetch(`/api/ops/supervision/installation-checklist/${installationId}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setChecklistItems(json.data);
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

  // Step 2 → 3: Save evaluations
  async function handleStep2Next() {
    if (!visit) return;
    setSaving(true);
    try {
      // Save evaluations
      await fetch(`/api/ops/supervision/${visit.id}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluations }),
      });

      // Save installation state
      await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationState, wizardStep: 3 }),
      });

      setCurrentStep(3);
      setMaxReachedStep((prev) => Math.max(prev, 3) as WizardStep);
      toast.success("Evaluaciones guardadas");
    } catch {
      toast.error("Error al guardar evaluaciones");
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
        await fetch(`/api/ops/supervision/${visit.id}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: itemsToSave }),
        });
      }

      // Upload book photo if present
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
        if (photoRes.ok && photoJson.success) {
          bookPhotoUrl = photoJson.data.photoUrl;
        }
      }

      // Save book data + legacy document checklist
      const documentChecklist: Record<string, boolean> = {};
      for (const item of checklistItems) {
        documentChecklist[item.name] = checklistResults.some(
          (r) => r.checklistItemId === item.id && r.isChecked,
        );
      }

      await fetch(`/api/ops/supervision/${visit.id}`, {
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

      setCurrentStep(4);
      setMaxReachedStep((prev) => Math.max(prev, 4) as WizardStep);
      toast.success("Verificacion guardada");
    } catch {
      toast.error("Error al guardar verificacion");
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
        if (res.ok && json.success) {
          setCapturedPhotos((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, uploaded: true, uploadedId: json.data.id } : p,
            ),
          );
        }

        // Also upload to legacy images table for backward compat
        const legacyForm = new FormData();
        legacyForm.append("file", photo.file);
        legacyForm.append("caption", photo.categoryName);
        await fetch(`/api/ops/supervision/${visit.id}/images`, {
          method: "POST",
          body: legacyForm,
        });
      }

      await fetch(`/api/ops/supervision/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wizardStep: 5 }),
      });

      setCurrentStep(5);
      setMaxReachedStep((prev) => Math.max(prev, 5) as WizardStep);
      toast.success("Fotos subidas");
    } catch {
      toast.error("Error al subir fotos");
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
        if (uploadRes.ok && uploadJson.success) {
          clientValidationUrl = uploadJson.data.photoUrl;
        }
      } else if (validationType === "photo" && validationPhotoFile) {
        const formData = new FormData();
        formData.append("file", validationPhotoFile);
        formData.append("categoryName", "Foto con cliente");
        const uploadRes = await fetch(`/api/ops/supervision/${visit.id}/photos`, {
          method: "POST",
          body: formData,
        });
        const uploadJson = await uploadRes.json();
        if (uploadRes.ok && uploadJson.success) {
          clientValidationUrl = uploadJson.data.photoUrl;
        }
      }

      // Calculate survey average
      const surveyScores = [
        surveyData.serviceQuality,
        surveyData.scheduleCompliance,
        surveyData.personalPresentation,
        surveyData.professionalism,
      ].filter((s): s is number => s !== null);
      const clientSatisfaction =
        surveyScores.length > 0
          ? Math.round((surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length) * 100) / 100
          : null;

      const res = await fetch(`/api/ops/supervision/${visit.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          completedVia: "mobile",
          generalComments: generalComments || null,
          installationState,
          guardsExpected: visit.guardsExpected,
          guardsFound: visit.guardsFound,
          bookUpToDate,
          bookLastEntryDate: bookLastEntryDate || null,
          bookNotes: bookNotes || null,
          clientContacted,
          clientContactName: clientContactName || null,
          clientSatisfaction,
          clientComment: surveyData.complaintsSuggestions || null,
          ...(clientValidationUrl ? { clientValidationUrl } : {}),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo cerrar la visita");
      }

      toast.success("Visita finalizada correctamente");
      router.push("/ops/supervision/mis-visitas");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al finalizar visita";
      toast.error(message);
    } finally {
      setSaving(false);
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

  // Finding handlers
  function handleFindingCreated(finding: Finding) {
    setFindings((prev) => [...prev, finding]);
  }

  async function handleFindingStatusChange(findingId: string, status: string) {
    if (!visit) return;
    try {
      await fetch(`/api/ops/supervision/installation-findings/${visit.installationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId,
          status,
          verifiedInVisitId: visit.id,
        }),
      });
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

  // Navigate to step (only if reachable)
  function goToStep(step: WizardStep) {
    if (step <= maxReachedStep) {
      setCurrentStep(step);
    }
  }

  // Count alerts for stepper
  const stepAlerts: Record<number, boolean> = {};
  if (visit) {
    // Step 1: geofence issue or dotation mismatch
    if (visit.guardsExpected != null && visit.guardsFound != null && visit.guardsExpected !== visit.guardsFound) {
      stepAlerts[1] = true;
    }
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

      {/* Step content */}
      {currentStep === 1 && <Step1CheckIn onCheckedIn={handleCheckedIn} />}

      {currentStep === 2 && visit && (
        <Step2Evaluation
          visit={visit}
          guards={guards}
          evaluations={evaluations}
          findings={findings}
          installationState={installationState}
          onEvaluationsChange={setEvaluations}
          onInstallationStateChange={setInstallationState}
          onFindingCreated={handleFindingCreated}
          onNext={handleStep2Next}
          onPrev={() => setCurrentStep(1)}
          saving={saving}
        />
      )}

      {currentStep === 3 && visit && (
        <Step3Checklist
          visit={visit}
          checklistItems={checklistItems}
          checklistResults={checklistResults}
          openFindings={openFindings}
          bookUpToDate={bookUpToDate}
          bookLastEntryDate={bookLastEntryDate}
          bookNotes={bookNotes}
          bookPhotoFile={bookPhotoFile}
          bookPhotoPreview={bookPhotoPreview}
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
          onFindingCreated={handleFindingCreated}
          onFindingStatusChange={handleFindingStatusChange}
          onNext={handleStep3Next}
          onPrev={() => setCurrentStep(2)}
          saving={saving}
        />
      )}

      {currentStep === 4 && visit && (
        <Step4Evidence
          visit={visit}
          photoCategories={photoCategories}
          capturedPhotos={capturedPhotos}
          onPhotoCapture={handlePhotoCapture}
          onPhotoRemove={handlePhotoRemove}
          onNext={handleStep4Next}
          onPrev={() => setCurrentStep(3)}
          saving={saving}
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
        />
      )}
    </div>
  );
}
