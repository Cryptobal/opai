"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Upload,
  Trash2,
  Plus,
  ImagePlus,
  Sparkles,
  Camera,
  ListChecks,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Finding = {
  id: string;
  description: string;
  severity: string;
  location: string | null;
  sectorTag: string | null;
  category: string | null;
  aggravatingFactors: string | null;
  importedFromFindingId: string | null;
  sortOrder: number;
};

type Photo = {
  id: string;
  publicUrl: string;
  storageKey: string;
  fileName: string | null;
  caption: string | null;
  linkedFindingIds: string[];
  takenAt: string | null;
  importedFromVisitId: string | null;
  importedFromPhotoId: string | null;
  sortOrder: number;
};

type Report = {
  id: string;
  title: string;
  status: string;
  installationId: string;
  visitId: string | null;
  installation: { id: string; name: string; address: string | null; city: string | null };
  visit: { id: string; checkInAt: string } | null;
  userFindings: Finding[];
  userPhotos: Photo[];
};

type AvailableVisit = {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  status: string;
  visitType: string;
  supervisorName: string | null;
  findings: Array<{
    id: string;
    description: string;
    severity: string;
    category: string | null;
    photoUrl: string | null;
    alreadyImported: boolean;
  }>;
  photos: Array<{
    id: string;
    publicUrl: string;
    categoryName: string | null;
    takenAt: string | null;
    alreadyImported: boolean;
  }>;
};

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Crítico", color: "bg-status-danger" },
  { value: "high", label: "Alto", color: "bg-orange-600" },
  { value: "medium", label: "Medio", color: "bg-yellow-600" },
  { value: "low", label: "Bajo", color: "bg-status-ok" },
];

const SECTOR_SUGGESTIONS = [
  "Norte",
  "Sur",
  "Este",
  "Oeste",
  "Perimetral",
  "Interior",
  "Exterior",
  "Tecnología",
  "Acceso",
];

const CATEGORY_SUGGESTIONS = [
  "Perimetral",
  "CCTV",
  "Iluminación",
  "Cerco",
  "Estructural",
  "Operacional",
  "Normativo",
  "Acceso",
  "Tecnología",
];

const STEPS = [
  { id: 1, title: "Base", icon: FileText },
  { id: 2, title: "Fotos", icon: Camera },
  { id: 3, title: "Hallazgos", icon: ListChecks },
  { id: 4, title: "Generar", icon: Sparkles },
];

export function VraReportWizardClient({ report: initialReport }: { report: Report }) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [step, setStep] = useState(1);
  const [findings, setFindings] = useState<Finding[]>(initialReport.userFindings);
  const [photos, setPhotos] = useState<Photo[]>(initialReport.userPhotos);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setUserRole((j.user.role ?? "").toLowerCase());
      })
      .catch(() => {});
  }, []);

  const isAdmin = userRole === "owner" || userRole === "admin";

  const handleDeleteReport = async () => {
    const confirmMsg = `¿Eliminar permanentemente este borrador?\n\n"${report.title}"\n\nSe borran ${findings.length} hallazgo(s) y ${photos.length} foto(s) cargados.\n\nEsta acción no se puede deshacer.`;
    if (!confirm(confirmMsg)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vra/reports/${report.id}?hard=true`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Borrador eliminado");
      router.push(`/crm/installations/${report.installation.id}?tab=informes-vulnerabilidad`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error eliminando");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link
            href={`/crm/installations/${report.installation.id}?tab=informes-vulnerabilidad`}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{report.title}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {report.installation.name} · {report.installation.address}
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteReport}
            disabled={deleting}
            className="gap-1.5 text-status-danger-fg hover:text-status-danger-fg hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-900"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar borrador
          </Button>
        )}
      </div>

      {/* Stepper */}
      <Card className="p-4">
        <ol className="flex items-center justify-between gap-2 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <li key={s.id} className="flex items-center flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors min-w-0",
                    isActive && "bg-primary text-primary-foreground",
                    !isActive && isDone && "bg-emerald-100 text-status-ok-fg dark:bg-emerald-900/30 dark:text-status-ok-fg",
                    !isActive && !isDone && "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {isDone ? (
                    <Check className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="hidden sm:inline truncate">
                    {s.id}. {s.title}
                  </span>
                  <span className="sm:hidden font-mono">{s.id}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {step === 1 && (
        <Step1Base
          report={report}
          onUpdate={(patch) => setReport({ ...report, ...patch })}
          onNext={() => setStep(2)}
          onImported={({ photos: newPhotos, findings: newFindings }) => {
            setPhotos((prev) => [...prev, ...newPhotos]);
            setFindings((prev) => [...prev, ...newFindings]);
          }}
        />
      )}

      {step === 2 && (
        <Step2Photos
          reportId={report.id}
          photos={photos}
          onChange={setPhotos}
          findings={findings}
          onPrev={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <Step3Findings
          reportId={report.id}
          findings={findings}
          onChange={setFindings}
          photos={photos}
          onPrev={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <Step4Generate
          report={report}
          findings={findings}
          photos={photos}
          generating={generating}
          onPrev={() => setStep(3)}
          onGenerate={async () => {
            setGenerating(true);
            try {
              const res = await fetch(`/api/vra/reports/${report.id}/generate`, {
                method: "POST",
              });
              const json = await res.json();
              if (!json.success) throw new Error(json.error);
              toast.success("Informe generado correctamente");
              router.push(`/opai/vra/${report.id}`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error generando");
            } finally {
              setGenerating(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Base
// ─────────────────────────────────────────────────────────────────────────────

function Step1Base({
  report,
  onUpdate,
  onNext,
  onImported,
}: {
  report: Report;
  onUpdate: (patch: Partial<Report>) => void;
  onNext: () => void;
  onImported: (data: { photos: Photo[]; findings: Finding[] }) => void;
}) {
  const [title, setTitle] = useState(report.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    loading: boolean;
    visitsCount: number;
    findingsAvailable: number;
    photosAvailable: number;
  }>({ loading: true, visitsCount: 0, findingsAvailable: 0, photosAvailable: 0 });

  // Pre-fetch availability summary al montar
  useEffect(() => {
    fetch(`/api/vra/reports/${report.id}/available-imports`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setImportSummary((s) => ({ ...s, loading: false }));
          return;
        }
        const visits = (json.visits ?? []) as AvailableVisit[];
        let findingsAvailable = 0;
        let photosAvailable = 0;
        for (const v of visits) {
          findingsAvailable += v.findings.filter((f) => !f.alreadyImported).length;
          photosAvailable += v.photos.filter((p) => !p.alreadyImported).length;
        }
        setImportSummary({
          loading: false,
          visitsCount: visits.length,
          findingsAvailable,
          photosAvailable,
        });
      })
      .catch(() => setImportSummary((s) => ({ ...s, loading: false })));
  }, [report.id]);

  const saveTitle = async () => {
    if (title === report.title) return;
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/vra/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onUpdate({ title });
      toast.success("Título actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingTitle(false);
    }
  };

  // Solo mostrar la sección de importar si hay algo disponible
  const hasImportableContent =
    !importSummary.loading &&
    importSummary.visitsCount > 0 &&
    (importSummary.findingsAvailable > 0 || importSummary.photosAvailable > 0);

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Base del informe</h2>
        <p className="text-sm text-muted-foreground">
          Configura el título.{" "}
          {hasImportableContent
            ? "Opcionalmente importa fotos y hallazgos de visitas técnicas previas."
            : "En los siguientes pasos vas a cargar las fotos y los hallazgos de la inspección."}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Título del informe</Label>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1" />
          <Button onClick={saveTitle} disabled={savingTitle || title === report.title}>
            {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {importSummary.loading && (
        <div className="border rounded-md p-3 bg-muted/30 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando visitas técnicas previas...
        </div>
      )}

      {hasImportableContent && (
        <div className="border rounded-md p-4 bg-muted/30">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="font-medium flex items-center gap-2 flex-wrap">
                Importar de visitas técnicas previas
                <Badge variant="secondary" className="text-[10px]">
                  Opcional
                </Badge>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Hay <strong>{importSummary.visitsCount}</strong>{" "}
                {importSummary.visitsCount === 1 ? "visita previa" : "visitas previas"} a esta
                instalación con{" "}
                {importSummary.findingsAvailable > 0 && (
                  <>
                    <strong>{importSummary.findingsAvailable}</strong>{" "}
                    {importSummary.findingsAvailable === 1
                      ? "hallazgo disponible"
                      : "hallazgos disponibles"}
                  </>
                )}
                {importSummary.findingsAvailable > 0 && importSummary.photosAvailable > 0 && " y "}
                {importSummary.photosAvailable > 0 && (
                  <>
                    <strong>{importSummary.photosAvailable}</strong>{" "}
                    {importSummary.photosAvailable === 1
                      ? "foto disponible"
                      : "fotos disponibles"}
                  </>
                )}
                . Podés traer lo relevante como punto de partida.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="gap-1.5 flex-shrink-0"
            >
              <ImagePlus className="h-4 w-4" />
              Importar de {importSummary.visitsCount}{" "}
              {importSummary.visitsCount === 1 ? "visita" : "visitas"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} className="gap-1.5">
          Siguiente: Fotos
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <ImportFromVisitDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        reportId={report.id}
        onImported={onImported}
      />
    </Card>
  );
}

function ImportFromVisitDialog({
  open,
  onOpenChange,
  reportId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportId: string;
  onImported: (data: { photos: Photo[]; findings: Finding[] }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [visits, setVisits] = useState<AvailableVisit[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/vra/reports/${reportId}/available-imports`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setVisits(json.visits);
        else toast.error(json.error);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [open, reportId]);

  const handleImport = async () => {
    if (selectedFindings.size === 0 && selectedPhotos.size === 0) {
      toast.error("Selecciona al menos un hallazgo o foto");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/vra/reports/${reportId}/import-from-visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingIds: Array.from(selectedFindings),
          photoIds: Array.from(selectedPhotos),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(
        `Importados: ${json.importedFindings} hallazgos, ${json.importedPhotos} fotos`,
      );

      // Recargar findings y photos del informe
      const [fRes, pRes] = await Promise.all([
        fetch(`/api/vra/reports/${reportId}/findings`).then((r) => r.json()),
        fetch(`/api/vra/reports/${reportId}/photos`).then((r) => r.json()),
      ]);
      if (fRes.success && pRes.success) {
        onImported({ findings: fRes.findings, photos: pRes.photos });
      } else {
        // Fallback: cerrar y dejar que el wizard recargue
        window.location.reload();
      }

      setSelectedFindings(new Set());
      setSelectedPhotos(new Set());
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error importando");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar desde visitas previas</DialogTitle>
          <DialogDescription>
            Selecciona hallazgos y fotos de visitas técnicas anteriores para incluirlos como base.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando visitas...
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No hay visitas técnicas previas a esta instalación.
          </div>
        ) : (
          <div className="space-y-4">
            {visits.map((v) => (
              <div key={v.id} className="border rounded-md overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium">
                      {new Date(v.checkInAt).toLocaleDateString("es-CL", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {v.supervisorName && (
                      <span className="text-muted-foreground"> · {v.supervisorName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {v.findings.length} hallazgos
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {v.photos.length} fotos
                    </Badge>
                  </div>
                </div>

                {v.findings.length > 0 && (
                  <div className="p-3 border-b">
                    <div className="text-xs font-medium text-muted-foreground mb-2">HALLAZGOS</div>
                    <ul className="space-y-1.5">
                      {v.findings.map((f) => (
                        <li key={f.id} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            disabled={f.alreadyImported}
                            checked={selectedFindings.has(f.id) || f.alreadyImported}
                            onChange={(e) => {
                              const next = new Set(selectedFindings);
                              if (e.target.checked) next.add(f.id);
                              else next.delete(f.id);
                              setSelectedFindings(next);
                            }}
                            className="mt-1"
                          />
                          <span className={cn("flex-1", f.alreadyImported && "opacity-40")}>
                            <span className="font-medium">[{f.severity}]</span> {f.description.slice(0, 140)}
                            {f.alreadyImported && (
                              <span className="text-xs text-status-ok-fg ml-1">(ya importado)</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {v.photos.length > 0 && (
                  <div className="p-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2">FOTOS</div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {v.photos.map((p) => (
                        <label
                          key={p.id}
                          className={cn(
                            "relative cursor-pointer rounded border-2 overflow-hidden",
                            selectedPhotos.has(p.id) && "border-primary",
                            !selectedPhotos.has(p.id) && "border-transparent hover:border-muted-foreground",
                            p.alreadyImported && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={p.alreadyImported}
                            checked={selectedPhotos.has(p.id) || p.alreadyImported}
                            onChange={(e) => {
                              const next = new Set(selectedPhotos);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              setSelectedPhotos(next);
                            }}
                            className="absolute top-1 left-1 z-10"
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.publicUrl}
                            alt={p.categoryName ?? "Foto"}
                            className="w-full aspect-square object-cover"
                          />
                          {p.alreadyImported && (
                            <span className="absolute bottom-1 right-1 text-[9px] bg-status-ok text-white px-1 rounded">
                              ✓
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={importing || (selectedFindings.size === 0 && selectedPhotos.size === 0)}>
            {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            Importar seleccionados
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Photos
// ─────────────────────────────────────────────────────────────────────────────

function Step2Photos({
  reportId,
  photos,
  onChange,
  findings,
  onPrev,
  onNext,
}: {
  reportId: string;
  photos: Photo[];
  onChange: (p: Photo[]) => void;
  findings: Finding[];
  onPrev: () => void;
  onNext: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/vra/reports/${reportId}/photos`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.success) {
          onChange([...photos, json.photo]);
          successCount++;
        } else {
          toast.error(`Error subiendo ${file.name}: ${json.error}`);
        }
      }
      if (successCount > 0) toast.success(`${successCount} foto(s) subida(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!confirm("¿Eliminar esta foto?")) return;
    try {
      const res = await fetch(`/api/vra/reports/${reportId}/photos/${photoId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onChange(photos.filter((p) => p.id !== photoId));
      toast.success("Foto eliminada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleUpdateCaption = async (photoId: string, caption: string) => {
    try {
      const res = await fetch(`/api/vra/reports/${reportId}/photos/${photoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onChange(photos.map((p) => (p.id === photoId ? { ...p, caption } : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Fotos del informe</h2>
        <p className="text-sm text-muted-foreground">
          Sube las fotografías que respaldarán el análisis. Mínimo 1, recomendado 8-15. Cada foto
          puede vincularse después a un hallazgo en el paso 3.
        </p>
      </div>

      <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/20">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <ImagePlus className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-3">
          Selecciona o arrastra imágenes aquí (JPG/PNG, máx 10 MB c/u)
        </p>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Subiendo..." : "Seleccionar imágenes"}
        </Button>
      </div>

      {photos.length > 0 && (
        <div>
          <div className="text-sm text-muted-foreground mb-3">
            {photos.length} foto(s) en el informe
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="border rounded-md overflow-hidden bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.publicUrl} alt={p.fileName ?? "Foto"} className="w-full aspect-square object-cover" />
                <div className="p-2 space-y-1.5">
                  <Input
                    placeholder="Caption (opcional)"
                    defaultValue={p.caption ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (p.caption ?? "")) {
                        handleUpdateCaption(p.id, e.target.value);
                      }
                    }}
                    className="text-xs h-8"
                  />
                  <div className="flex items-center justify-between">
                    {p.importedFromPhotoId && (
                      <Badge variant="outline" className="text-[9px]">
                        Visita
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-status-danger-fg ml-auto"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-3">
        <Button variant="outline" onClick={onPrev} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button onClick={onNext} className="gap-1.5">
          Siguiente: Hallazgos
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Findings
// ─────────────────────────────────────────────────────────────────────────────

function Step3Findings({
  reportId,
  findings,
  onChange,
  photos: _photos,
  onPrev,
  onNext,
}: {
  reportId: string;
  findings: Finding[];
  onChange: (f: Finding[]) => void;
  photos: Photo[];
  onPrev: () => void;
  onNext: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Finding | null>(null);

  const handleCreate = async (data: Partial<Finding>) => {
    try {
      const res = await fetch(`/api/vra/reports/${reportId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onChange([...findings, json.finding]);
      toast.success("Hallazgo agregado");
      setCreating(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleUpdate = async (id: string, data: Partial<Finding>) => {
    try {
      const res = await fetch(`/api/vra/reports/${reportId}/findings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onChange(findings.map((f) => (f.id === id ? json.finding : f)));
      toast.success("Hallazgo actualizado");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este hallazgo?")) return;
    try {
      const res = await fetch(`/api/vra/reports/${reportId}/findings/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onChange(findings.filter((f) => f.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold mb-1">Hallazgos</h2>
          <p className="text-sm text-muted-foreground">
            Registra cada hallazgo: descripción, severidad, localización (libre — ej: "Pieza de
            bombas", "Reja del acceso", "Techo bodega norte"), sector y categoría.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Agregar hallazgo
        </Button>
      </div>

      {findings.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-md">
          <ListChecks className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay hallazgos todavía.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sin hallazgos la IA no podrá generar un informe útil.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              onEdit={() => setEditing(f)}
              onDelete={() => handleDelete(f.id)}
            />
          ))}
        </div>
      )}

      <div className="flex justify-between pt-3">
        <Button variant="outline" onClick={onPrev} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button onClick={onNext} className="gap-1.5" disabled={findings.length === 0}>
          Siguiente: Generar
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <FindingDialog
        open={creating}
        onOpenChange={setCreating}
        onSave={handleCreate}
        title="Nuevo hallazgo"
      />

      <FindingDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        finding={editing}
        onSave={(data) => editing && handleUpdate(editing.id, data)}
        title="Editar hallazgo"
      />
    </Card>
  );
}

function FindingRow({
  finding,
  onEdit,
  onDelete,
}: {
  finding: Finding;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sev = SEVERITY_OPTIONS.find((s) => s.value === finding.severity);
  return (
    <div className="border rounded-md p-3 flex items-start gap-3">
      <Badge className={cn("text-white text-[10px]", sev?.color ?? "bg-gray-600")}>
        {sev?.label.toUpperCase() ?? finding.severity.toUpperCase()}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{finding.description}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px] text-muted-foreground">
          {finding.location && <span>📍 {finding.location}</span>}
          {finding.sectorTag && (
            <Badge variant="outline" className="text-[9px]">
              {finding.sectorTag}
            </Badge>
          )}
          {finding.category && (
            <Badge variant="outline" className="text-[9px]">
              {finding.category}
            </Badge>
          )}
          {finding.importedFromFindingId && (
            <Badge variant="outline" className="text-[9px]">
              de visita
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 px-2">
          Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 w-8 p-0 text-status-danger-fg">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FindingDialog({
  open,
  onOpenChange,
  finding,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  finding?: Finding | null;
  onSave: (data: Partial<Finding>) => void;
  title: string;
}) {
  const [description, setDescription] = useState(finding?.description ?? "");
  const [severity, setSeverity] = useState(finding?.severity ?? "medium");
  const [location, setLocation] = useState(finding?.location ?? "");
  const [sectorTag, setSectorTag] = useState(finding?.sectorTag ?? "");
  const [category, setCategory] = useState(finding?.category ?? "");
  const [aggravating, setAggravating] = useState(finding?.aggravatingFactors ?? "");

  useEffect(() => {
    if (open) {
      setDescription(finding?.description ?? "");
      setSeverity(finding?.severity ?? "medium");
      setLocation(finding?.location ?? "");
      setSectorTag(finding?.sectorTag ?? "");
      setCategory(finding?.category ?? "");
      setAggravating(finding?.aggravatingFactors ?? "");
    }
  }, [open, finding]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Cada hallazgo alimenta directamente la IA al generar las secciones del informe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descripción del hallazgo *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Ej: Perforación activa en muro perimetral oeste, con técnica de erosión y golpe directo. Hay dos orificios visibles, uno parchado con placa metálica y otro abierto."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Severidad *</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", s.color)} />
                        {s.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Localización</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Pieza de bombas, Reja acceso principal..."
                list="vra-location-suggestions"
              />
              <datalist id="vra-location-suggestions">
                <option value="Muro perimetral oeste" />
                <option value="Reja acceso principal" />
                <option value="Caseta de vigilancia" />
                <option value="Techo bodega central" />
                <option value="Pieza de bombas" />
                <option value="Patio de carga" />
                <option value="Sector estacionamiento" />
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Sector (etiqueta amplia)</Label>
              <Input
                value={sectorTag}
                onChange={(e) => setSectorTag(e.target.value)}
                placeholder="Ej: Norte, Perimetral, Interior..."
                list="vra-sector-suggestions"
              />
              <datalist id="vra-sector-suggestions">
                {SECTOR_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Categoría / sistema</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ej: CCTV, Iluminación, Cerco..."
                list="vra-category-suggestions"
              />
              <datalist id="vra-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Factores agravantes (opcional)</Label>
            <Textarea
              value={aggravating}
              onChange={(e) => setAggravating(e.target.value)}
              rows={2}
              placeholder="Ej: Sin iluminación nocturna y sin cobertura CCTV en este sector."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave({
                description,
                severity,
                location: location.trim() || null,
                sectorTag: sectorTag.trim() || null,
                category: category.trim() || null,
                aggravatingFactors: aggravating.trim() || null,
              })
            }
            disabled={description.trim().length < 3}
          >
            <Check className="h-4 w-4 mr-1" />
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Generate
// ─────────────────────────────────────────────────────────────────────────────

function Step4Generate({
  report,
  findings,
  photos,
  generating,
  onPrev,
  onGenerate,
}: {
  report: Report;
  findings: Finding[];
  photos: Photo[];
  generating: boolean;
  onPrev: () => void;
  onGenerate: () => void;
}) {
  const distrib = findings.reduce<Record<string, number>>(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );

  const canGenerate = findings.length > 0 || photos.length > 0;

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Generar informe</h2>
        <p className="text-sm text-muted-foreground">
          Revisa el resumen y dispara la IA. El proceso toma entre 30 y 90 segundos según la
          cantidad de fotos y el modelo configurado del tenant.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Fotos</div>
          <div className="text-2xl font-semibold">{photos.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Hallazgos
          </div>
          <div className="text-2xl font-semibold">{findings.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Distribución
          </div>
          <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
            {distrib.critical > 0 && (
              <Badge className="bg-status-danger text-white">{distrib.critical} crít</Badge>
            )}
            {distrib.high > 0 && (
              <Badge className="bg-orange-600 text-white">{distrib.high} alto</Badge>
            )}
            {distrib.medium > 0 && (
              <Badge className="bg-yellow-600 text-white">{distrib.medium} med</Badge>
            )}
            {distrib.low > 0 && (
              <Badge className="bg-status-ok text-white">{distrib.low} bajo</Badge>
            )}
            {findings.length === 0 && <span className="text-muted-foreground">—</span>}
          </div>
        </Card>
      </div>

      {!canGenerate && (
        <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-4 text-sm text-orange-700 dark:text-status-warn-fg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Sin datos para generar.</strong> Volvé al paso 2 o 3 y agregá al menos una foto
            o un hallazgo. Sin esto la IA no tendrá insumo para producir un informe útil.
          </div>
        </div>
      )}

      {generating && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4 text-sm text-blue-700 dark:text-status-info-fg">
          <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
          <strong>Generando informe...</strong> Fase 1/3: análisis visual de fotos. Fase 2/3:
          generación de secciones. Fase 3/3: ensamblaje. No cierres esta ventana.
        </div>
      )}

      <div className="flex justify-between pt-3">
        <Button variant="outline" onClick={onPrev} disabled={generating} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button onClick={onGenerate} disabled={generating || !canGenerate} size="lg" className="gap-1.5">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Generando..." : "Generar informe con IA"}
        </Button>
      </div>
    </Card>
  );
}
