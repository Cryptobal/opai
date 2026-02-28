"use client";

import { useCallback, useEffect, useState } from "react";
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

  // Step 4: Photos
  const [photoCategories, setPhotoCategories] = useState<PhotoCategory[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);

  // Step 5: Closure
  const [generalComments, setGeneralComments] = useState("");
  const [clientContacted, setClientContacted] = useState(false);
  const [clientContactName, setClientContactName] = useState("");
  const [clientSatisfaction, setClientSatisfaction] = useState<number | null>(null);
  const [clientComment, setClientComment] = useState("");

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
    } catch (e) {
      toast.error("Error al guardar evaluaciones");
    } finally {
      setSaving(false);
    }
  }

  // Step 3 → 4: Save checklist + book
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
          documentChecklist,
          wizardStep: 4,
        }),
      });

      setCurrentStep(4);
      setMaxReachedStep((prev) => Math.max(prev, 4) as WizardStep);
      toast.success("Verificación guardada");
    } catch (e) {
      toast.error("Error al guardar verificación");
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
    } catch (e) {
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
          clientComment: clientComment || null,
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

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Progress indicator */}
      <WizardProgress
        currentStep={currentStep}
        maxReachedStep={maxReachedStep}
        onStepClick={visit ? goToStep : undefined}
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
          onChecklistChange={setChecklistResults}
          onBookChange={(data) => {
            setBookUpToDate(data.bookUpToDate);
            setBookLastEntryDate(data.bookLastEntryDate);
            setBookNotes(data.bookNotes);
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
          capturedPhotos={capturedPhotos}
          generalComments={generalComments}
          clientContacted={clientContacted}
          clientContactName={clientContactName}
          clientSatisfaction={clientSatisfaction}
          clientComment={clientComment}
          onGeneralCommentsChange={setGeneralComments}
          onClientDataChange={(data) => {
            setClientContacted(data.clientContacted);
            setClientContactName(data.clientContactName);
            setClientSatisfaction(data.clientSatisfaction);
            setClientComment(data.clientComment);
          }}
          onFinalize={handleFinalize}
          onPrev={() => setCurrentStep(4)}
          saving={saving}
        />
      )}
    </div>
  );
}
