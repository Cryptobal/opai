"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Upload,
  ShieldAlert,
  FileText,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type UnifiedReport = {
  kind: "vra" | "manual";
  id: string;
  title: string;
  status: string;
  riskLevel: string | null;
  version: number | null;
  date: string;
  pdfUrl: string | null;
  publicToken: string | null;
  portalVisible: boolean;
  expiresAt?: string | null;
  notes?: string | null;
};

const RISK_COLORS: Record<string, string> = {
  critical: "bg-status-danger text-white",
  high: "bg-orange-600 text-white",
  medium: "bg-yellow-600 text-white",
  low: "bg-status-ok text-white",
};

const RISK_LABELS: Record<string, string> = {
  critical: "CRÍTICO",
  high: "ALTO",
  medium: "MEDIO",
  low: "BAJO",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  generating: "Generando...",
  ready: "Listo",
  approved: "Aprobado",
  sent: "Enviado",
  vigente: "Vigente",
  vencido: "Vencido",
  por_vencer: "Por vencer",
};

export function InstalacionVraReportsTab({ installationId }: { installationId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<UnifiedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Pre-fetch del rol para decidir si mostrar botón eliminar
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setUserRole((j.user.role ?? "").toLowerCase());
      })
      .catch(() => {});
  }, []);

  const isAdmin = userRole === "owner" || userRole === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/installations/${installationId}/vra-reports`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItems(json.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error cargando informes");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateNew = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/vra/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Borrador creado. Captura los datos para que la IA pueda generar.");
      router.push(`/opai/vra/${json.report.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creando borrador");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteReport = async (item: UnifiedReport) => {
    if (item.kind !== "vra") return;
    const confirmMsg = `¿Eliminar permanentemente el informe "${item.title}"?\n\nEsto borra el informe, sus hallazgos, fotos y secciones generadas. El PDF en Documentos Operacionales (si existe) se mantiene como histórico.\n\nEsta acción no se puede deshacer.`;
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/api/vra/reports/${item.id}?hard=true`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Informe eliminado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error eliminando");
    }
  };

  const handleTogglePortalVisible = async (item: UnifiedReport, visible: boolean) => {
    try {
      if (item.kind === "vra") {
        await fetch(`/api/vra/reports/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalVisible: visible }),
        });
      } else {
        await fetch(`/api/operacional/instalaciones/${installationId}/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalClienteVisible: visible }),
        });
      }
      toast.success(visible ? "Visible en portal cliente" : "Oculto del portal");
      load();
    } catch {
      toast.error("Error al actualizar visibilidad");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base">Informes de Vulnerabilidad</h3>
          <p className="text-sm text-muted-foreground">
            Informes generados con IA y PDFs subidos manualmente
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleCreateNew} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? "Creando..." : "Nuevo informe"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/crm/installations/${installationId}?tab=docs-operacionales`} className="gap-1.5">
              <Upload className="h-4 w-4" />
              Subir PDF manual
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Cargando informes...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <ShieldAlert className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            No hay informes de vulnerabilidad para esta instalación.
          </p>
          <p className="text-xs text-muted-foreground">Genera el primero con IA o sube un PDF manual.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={`${item.kind}-${item.id}`} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h4 className="font-medium truncate">{item.title}</h4>
                    {item.kind === "vra" && (
                      <Badge variant="default" className="gap-1 text-[10px]">
                        <Sparkles className="h-2.5 w-2.5" />
                        IA
                      </Badge>
                    )}
                    {item.kind === "manual" && (
                      <Badge variant="outline" className="text-[10px]">
                        Manual
                      </Badge>
                    )}
                    {item.riskLevel && (
                      <Badge className={cn("text-[10px]", RISK_COLORS[item.riskLevel])}>
                        {RISK_LABELS[item.riskLevel]}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                    {item.portalVisible && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-emerald-300 text-status-ok-fg dark:text-status-ok-fg gap-1"
                      >
                        <Eye className="h-2.5 w-2.5" />
                        Visible portal
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(item.date).toLocaleDateString("es-CL", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    {item.version && ` · v${item.version}.0`}
                    {item.expiresAt && ` · vence ${new Date(item.expiresAt).toLocaleDateString("es-CL")}`}
                  </div>
                  {item.notes && (
                    <div className="text-xs text-muted-foreground mt-1 italic">{item.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.kind === "vra" && item.status === "draft" && (
                    <Button variant="default" size="sm" asChild>
                      <Link href={`/opai/vra/${item.id}/edit`} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Continuar captura
                      </Link>
                    </Button>
                  )}
                  {item.kind === "vra" && item.status !== "draft" && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/opai/vra/${item.id}`} className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir
                      </Link>
                    </Button>
                  )}
                  {item.pdfUrl && (
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={item.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePortalVisible(item, !item.portalVisible)}
                    title={item.portalVisible ? "Ocultar del portal" : "Mostrar en portal"}
                  >
                    {item.portalVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  {isAdmin && item.kind === "vra" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteReport(item)}
                      title="Eliminar informe"
                      className="text-status-danger-fg hover:text-status-danger-fg hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
