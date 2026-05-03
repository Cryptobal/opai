"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  ExternalLink,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  FileUp,
  User,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocStatusBadge } from "./DocStatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { cn } from "@/lib/utils";

type TipoRef = {
  id: string;
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  tieneVencimiento: boolean;
  diasAlerta: number;
  order: number;
};

type VerificacionFisica = {
  presente: boolean;
  ultimaVerificacion: string;
  supervisorName: string | null;
  hallazgo: {
    id: string;
    status: string;
    severity: string;
    ticketCode: string | null;
    ticketId: string | null;
  } | null;
};

type TipoConfigItem = {
  id: string;
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  obligatorioEnVisita: boolean;
  verificacion: VerificacionFisica | null;
};

type DocItem = {
  id: string;
  tipoId: string;
  tipo: TipoRef;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
  notes: string | null;
  portalClienteVisible: boolean;
};

type GuardiaDocItem = {
  tipoNombre: string;
  tipoCodigo: string;
  status: string;
  expiresAt: string | null;
};

type GuardiaBlock = {
  guardia: {
    id: string;
    firstName: string;
    lastName: string;
    rut: string | null;
    faceIdPhotoUrl: string | null;
  };
  documentos: GuardiaDocItem[];
  cumplimiento: { total: number; vigentes: number; faltantes: number };
};

type Cumplimiento = {
  total: number;
  vigentes: number;
  porVencer: number;
  vencidos: number;
  sinDocumento: number;
  porcentaje: number;
};

type ConsolidatedData = {
  cumplimiento: Cumplimiento;
  globales: DocItem[];
  instalacion: DocItem[];
  guardias: GuardiaBlock[];
  tiposGlobal: TipoConfigItem[];
  tiposInstalacion: TipoConfigItem[];
};

function StatusIcon({ status }: { status: string }) {
  if (status === "vigente" || status === "no_aplica") return <CheckCircle2 className="h-4 w-4 text-status-ok-fg" />;
  if (status === "por_vencer") return <AlertTriangle className="h-4 w-4 text-status-warn-fg" />;
  if (status === "vencido") return <XCircle className="h-4 w-4 text-status-danger-fg" />;
  return <Circle className="h-4 w-4 text-zinc-600" />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  installationId: string;
}

export function InstalacionDocsOperacionalesTab({ installationId }: Props) {
  const [data, setData] = useState<ConsolidatedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    globales: true,
    instalacion: true,
    guardias: true,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadModal, setUploadModal] = useState<{ tipoId: string; tipoNombre: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ issuedAt: "", expiresAt: "", notes: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/operacional/instalaciones/${installationId}`);
      const json = await res.json();
      if (json.success) setData(json.data);
      else toast.error(json.error || "Error al cargar");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpload = async () => {
    if (!uploadModal || !uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("tipoId", uploadModal.tipoId);
      if (uploadForm.issuedAt) formData.append("issuedAt", uploadForm.issuedAt);
      if (uploadForm.expiresAt) formData.append("expiresAt", uploadForm.expiresAt);
      if (uploadForm.notes) formData.append("notes", uploadForm.notes);

      const res = await fetch(`/api/operacional/instalaciones/${installationId}`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      toast.success("Documento subido");
      setUploadModal(null);
      setUploadFile(null);
      setUploadForm({ issuedAt: "", expiresAt: "", notes: "" });
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/operacional/instalaciones/${installationId}/${docId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Documento eliminado");
        await fetchData();
      } else {
        toast.error("Error al eliminar");
      }
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No se pudieron cargar los documentos operacionales.
      </div>
    );
  }

  const { cumplimiento, globales, instalacion, guardias, tiposGlobal, tiposInstalacion } = data;

  return (
    <div className="space-y-4">
      {/* Cumplimiento header */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                Cumplimiento: {cumplimiento.vigentes}/{cumplimiento.total} vigentes
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {cumplimiento.porVencer > 0 && (
                  <span className="flex items-center gap-1 text-status-warn-fg">
                    <AlertTriangle className="h-3 w-3" /> {cumplimiento.porVencer} por vencer
                  </span>
                )}
                {cumplimiento.vencidos > 0 && (
                  <span className="flex items-center gap-1 text-status-danger-fg">
                    <XCircle className="h-3 w-3" /> {cumplimiento.vencidos} vencido{cumplimiento.vencidos > 1 ? "s" : ""}
                  </span>
                )}
                {cumplimiento.sinDocumento > 0 && (
                  <span className="flex items-center gap-1 text-zinc-500">
                    <Circle className="h-3 w-3" /> {cumplimiento.sinDocumento} faltante{cumplimiento.sinDocumento > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <p className="text-2xl font-bold">{cumplimiento.porcentaje}%</p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-status-ok transition-all"
              style={{ width: `${cumplimiento.porcentaje}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section: Globales */}
      <CollapsibleSection
        title="Documentos Globales (empresa)"
        count={`${globales.length}/${tiposGlobal.length} cargados`}
        expanded={expandedSections.globales}
        onToggle={() => toggleSection("globales")}
      >
        {tiposGlobal.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 px-1">Sin tipos globales configurados.</p>
        ) : (
          <div className="space-y-1">
            {tiposGlobal.map((t) => {
              const doc = globales.find((d) => d.tipoId === t.id);
              return (
                <TipoDocRow
                  key={t.id}
                  tipo={t}
                  doc={doc}
                  readOnly
                  onView={doc ? () => window.open(doc.fileUrl, "_blank") : undefined}
                />
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Section: Instalación */}
      <CollapsibleSection
        title="Documentos de la Instalación"
        count={`${instalacion.length}/${tiposInstalacion.length} cargados`}
        expanded={expandedSections.instalacion}
        onToggle={() => toggleSection("instalacion")}
        action={
          tiposInstalacion.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const loaded = new Set(instalacion.map((d) => d.tipoId));
                const available = tiposInstalacion.filter((t) => !loaded.has(t.id));
                const target = available[0] ?? tiposInstalacion[0];
                setUploadModal({ tipoId: target.id, tipoNombre: target.nombre });
                setUploadFile(null);
                setUploadForm({ issuedAt: "", expiresAt: "", notes: "" });
              }}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Cargar
            </Button>
          ) : undefined
        }
      >
        {tiposInstalacion.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 px-1">Sin tipos de documentos configurados.</p>
        ) : (
          <div className="space-y-1">
            {tiposInstalacion.map((t) => {
              const doc = instalacion.find((d) => d.tipoId === t.id);
              return (
                <TipoDocRow
                  key={t.id}
                  tipo={t}
                  doc={doc}
                  onView={doc ? () => window.open(doc.fileUrl, "_blank") : undefined}
                  onDelete={doc ? () => setDeleteId(doc.id) : undefined}
                  onUpload={
                    !doc
                      ? () => {
                          setUploadModal({ tipoId: t.id, tipoNombre: t.nombre });
                          setUploadFile(null);
                          setUploadForm({ issuedAt: "", expiresAt: "", notes: "" });
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Section: Guardias */}
      <CollapsibleSection
        title="Documentos por Guardia"
        count={`${guardias.reduce((s, g) => s + g.cumplimiento.vigentes, 0)}/${guardias.reduce((s, g) => s + g.cumplimiento.total, 0)}`}
        expanded={expandedSections.guardias}
        onToggle={() => toggleSection("guardias")}
      >
        {guardias.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 px-1">Sin guardias asignados a esta instalación.</p>
        ) : (
          <div className="space-y-3">
            {guardias.map((gb) => (
              <GuardiaDocsCard key={gb.guardia.id} data={gb} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Upload Modal */}
      <Dialog open={!!uploadModal} onOpenChange={(open) => !open && setUploadModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Tipo selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de documento</Label>
              <Select
                value={uploadModal?.tipoId ?? ""}
                onValueChange={(val) => {
                  const t = tiposInstalacion.find((t) => t.id === val);
                  if (t) setUploadModal({ tipoId: t.id, tipoNombre: t.nombre });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tiposInstalacion.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File drop */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f?.type === "application/pdf") setUploadFile(f);
                else toast.error("Solo se permiten archivos PDF");
              }}
              className="relative rounded-lg border-2 border-dashed p-6 text-center border-border hover:border-muted-foreground/40 transition-colors"
            >
              <input
                type="file"
                accept=".pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); e.target.value = ""; }}
              />
              {uploadFile ? (
                <div className="flex items-center gap-2 justify-center">
                  <FileText className="h-5 w-5 text-status-danger-fg" />
                  <span className="text-sm font-medium break-all">{uploadFile.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <FileUp className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm">Arrastra un PDF o haz clic</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha emisión</Label>
                <Input type="date" value={uploadForm.issuedAt} onChange={(e) => setUploadForm((p) => ({ ...p, issuedAt: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha vencimiento</Label>
                <Input type="date" value={uploadForm.expiresAt} onChange={(e) => setUploadForm((p) => ({ ...p, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input value={uploadForm.notes} onChange={(e) => setUploadForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Observaciones..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModal(null)}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Eliminar documento"
        description="El documento será eliminado permanentemente."
        confirmLabel="Eliminar"
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
      />
    </div>
  );
}

/* ── Collapsible section ── */

function CollapsibleSection({
  title,
  count,
  expanded,
  onToggle,
  action,
  children,
}: {
  title: string;
  count: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-0 px-0">
        <div className="flex items-center gap-2 w-full py-3 px-4 hover:bg-muted/30 transition-colors">
          <div
            className="flex items-center gap-2 flex-1 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={onToggle}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
          >
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm font-semibold flex-1">{title}</span>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
          {action}
        </div>
        {expanded && <div className="px-4 pb-3 border-t border-border/30">{children}</div>}
      </CardContent>
    </Card>
  );
}

/* ── Tipo + Document row (shows config + doc + física + hallazgo) ── */

function TipoDocRow({
  tipo,
  doc,
  readOnly,
  onView,
  onDelete,
  onUpload,
}: {
  tipo: TipoConfigItem;
  doc?: DocItem;
  readOnly?: boolean;
  onView?: () => void;
  onDelete?: () => void;
  onUpload?: () => void;
}) {
  const digitalStatus = doc ? doc.status : "sin_documento";
  const verif = tipo.verificacion;
  const hallazgo = verif?.hallazgo;
  const hallazgoAbierto = hallazgo && (hallazgo.status === "open" || hallazgo.status === "in_progress");

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors">
      <StatusIcon status={digitalStatus} />
      <div className="min-w-0 w-full sm:flex-1 sm:w-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm font-medium break-words", !doc && "text-zinc-400")}>{tipo.nombre}</p>
          {tipo.obligatorio && (
            <span className="text-[10px] text-status-warn-fg shrink-0">obligatorio</span>
          )}
          {tipo.obligatorioEnVisita && (
            <span className="text-[10px] rounded-full bg-status-info-soft text-status-info-fg px-1.5 py-0.5 shrink-0">
              oblig. visita
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {doc ? (
            <>
              <span className="break-all">{doc.fileName}</span>
              {doc.expiresAt && (
                <>
                  <span>·</span>
                  <span>Vence: {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(new Date(doc.expiresAt))}</span>
                </>
              )}
            </>
          ) : (
            <span className="text-zinc-500">Sin documento cargado</span>
          )}
          {tipo.normativa && !doc && <span className="text-zinc-600">· {tipo.normativa}</span>}
        </div>
        {/* Física + hallazgo status */}
        {(verif || hallazgoAbierto) && (
          <div className="flex items-center gap-2 mt-1 text-[11px]">
            {verif && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
                  verif.presente
                    ? "bg-status-ok-soft text-status-ok-fg"
                    : "bg-status-danger-soft text-status-danger-fg",
                )}
                title={`Última visita: ${new Date(verif.ultimaVerificacion).toLocaleDateString("es-CL")}${verif.supervisorName ? ` — ${verif.supervisorName}` : ""}`}
              >
                {verif.presente ? "✓ físico OK" : "✗ no presente"}
              </span>
            )}
            {hallazgoAbierto && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
                  hallazgo.severity === "critical"
                    ? "bg-status-danger-soft text-status-danger-fg"
                    : hallazgo.severity === "major"
                      ? "bg-status-warn-soft text-status-warn-fg"
                      : "bg-status-info-soft text-status-info-fg",
                )}
              >
                <AlertTriangle className="h-3 w-3" />
                {hallazgo.ticketCode ? `Ticket #${hallazgo.ticketCode}` : "Hallazgo abierto"}
              </span>
            )}
          </div>
        )}
      </div>
      <DocStatusBadge status={digitalStatus} expiresAt={doc?.expiresAt ?? null} />
      <div className="flex items-center gap-0.5 shrink-0">
        {onView && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onView} title="Ver PDF">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        {onUpload && (
          <Button variant="ghost" size="sm" onClick={onUpload} className="h-7 px-2 text-xs" title="Cargar">
            <Upload className="h-3.5 w-3.5 mr-1" /> Cargar
          </Button>
        )}
        {!readOnly && onDelete && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-status-danger-fg" onClick={onDelete} title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Guardia docs card ── */

function GuardiaDocsCard({ data }: { data: GuardiaBlock }) {
  const [expanded, setExpanded] = useState(false);
  const { guardia, documentos, cumplimiento } = data;
  const fullName = `${guardia.lastName} ${guardia.firstName}`.trim();

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <button
        className="flex items-center gap-3 w-full py-2.5 px-3 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{fullName}</span>
          {guardia.rut && <span className="text-xs text-muted-foreground ml-2">({guardia.rut})</span>}
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "text-xs",
            cumplimiento.vigentes === cumplimiento.total
              ? "bg-status-ok-soft text-status-ok-fg"
              : cumplimiento.faltantes > 0
                ? "bg-status-warn-soft text-status-warn-fg"
                : ""
          )}
        >
          {cumplimiento.vigentes}/{cumplimiento.total}
        </Badge>
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-3 pb-2">
          {documentos.map((d, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <StatusIcon status={d.status} />
              <span className="text-sm flex-1">{d.tipoNombre}</span>
              <DocStatusBadge status={d.status} expiresAt={d.expiresAt} />
            </div>
          ))}
          <div className="pt-1.5">
            <Link
              href={`/personas/guardias/${guardia.id}`}
              className="inline-flex items-center gap-1 text-xs text-status-info-fg hover:text-status-info-fg"
            >
              Ver ficha <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
