"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Loader2,
  MoreVertical,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─── */

type PanelFinding = {
  id: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  visitId: string;
  createdAt: string;
  occurrenceCount?: number;
  firstDetectedAt?: string | null;
  visit?: { id: string; checkInAt: string; supervisor?: { name: string } | null } | null;
  ticket?: { id: string; code: string; status: string } | null;
  guard?: { persona: { firstName: string; lastName: string } } | null;
  tipoDoc?: { id: string; nombre: string } | null;
};

const SEVERITY_CONFIG: Record<
  string,
  { label: string; variant: "destructive" | "warning" | "secondary" }
> = {
  critical: { label: "Crítico", variant: "destructive" },
  major: { label: "Mayor", variant: "warning" },
  minor: { label: "Menor", variant: "secondary" },
};

const CATEGORY_LABELS: Record<string, string> = {
  personal: "Personal",
  infrastructure: "Infraestructura",
  documentation: "Documentación",
  operational: "Operativo",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "warning" | "default" | "success" | "secondary" }
> = {
  open: { label: "Abierto", variant: "warning" },
  in_progress: { label: "En progreso", variant: "default" },
  resolved: { label: "Resuelto", variant: "success" },
  verified: { label: "Verificado", variant: "success" },
};

/** Dónde se subsana el hallazgo, según su tipo. */
function findingTarget(f: PanelFinding, installationId: string) {
  if (f.ticket) {
    return {
      href: `/ops/tickets/${f.ticket.id}`,
      icon: Ticket,
      label: `Ticket ${f.ticket.code}`,
    };
  }
  if (f.tipoDoc) {
    return {
      href: `/crm/installations/${installationId}?tab=docs`,
      icon: FileText,
      label: "Documentos de la instalación",
    };
  }
  return {
    href: `/ops/supervision/${f.visitId}`,
    icon: ClipboardCheck,
    label: "Visita de origen",
  };
}

/* ─── Component ─── */

export function SupervisionFindingsPanel({
  installation,
  onClose,
  onChanged,
}: {
  installation: { id: string; name: string } | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [findings, setFindings] = useState<PanelFinding[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFindings = useCallback(async (installationId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ops/supervision/installation-findings/${installationId}?status=open`,
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setFindings(json.data as PanelFinding[]);
      }
    } catch {
      toast.error("Error al cargar hallazgos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (installation) void fetchFindings(installation.id);
    else setFindings([]);
  }, [installation, fetchFindings]);

  async function handleStatusChange(finding: PanelFinding, newStatus: string) {
    if (!installation) return;
    try {
      const res = await fetch(
        `/api/ops/supervision/installation-findings/${installation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingId: finding.id, status: newStatus }),
        },
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Estado actualizado");
        void fetchFindings(installation.id);
        onChanged?.();
      } else {
        toast.error(json.error || "Error al actualizar");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }

  function goToFinding(f: PanelFinding) {
    if (!installation) return;
    const target = findingTarget(f, installation.id);
    onClose();
    router.push(target.href);
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });

  return (
    <Sheet open={!!installation} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-4 py-4 pr-14 sm:px-5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 shrink-0 text-status-danger-fg" />
            <span className="truncate">{installation?.name}</span>
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {loading
              ? "Cargando hallazgos…"
              : `${findings.length} hallazgo${findings.length !== 1 ? "s" : ""} abierto${findings.length !== 1 ? "s" : ""}. Pincha uno para ir a subsanarlo.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-2 px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : findings.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              Sin hallazgos abiertos en esta instalación.
            </p>
          ) : (
            findings.map((f) => {
              const sevCfg = SEVERITY_CONFIG[f.severity];
              const stCfg = STATUS_CONFIG[f.status];
              const target = installation
                ? findingTarget(f, installation.id)
                : null;
              const TargetIcon = target?.icon ?? ChevronRight;
              const openedAt = f.firstDetectedAt ?? f.createdAt;
              const daysOpen = Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(openedAt).getTime()) /
                    (1000 * 60 * 60 * 24),
                ),
              );

              return (
                <div
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToFinding(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToFinding(f);
                    }
                  }}
                  className="group cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={sevCfg?.variant ?? "secondary"}
                        className="text-[12px]"
                      >
                        {sevCfg?.label ?? f.severity}
                      </Badge>
                      <Badge variant="outline" className="text-[12px]">
                        {CATEGORY_LABELS[f.category] ?? f.category}
                      </Badge>
                      <Badge
                        variant={stCfg?.variant ?? "secondary"}
                        className="text-[12px]"
                      >
                        {stCfg?.label ?? f.status}
                      </Badge>
                    </div>

                    {f.status !== "resolved" && f.status !== "verified" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 sm:h-8 sm:w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {f.status === "open" && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleStatusChange(f, "in_progress");
                              }}
                            >
                              Marcar en progreso
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleStatusChange(f, "resolved");
                            }}
                          >
                            Marcar resuelto
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <p className="mt-1.5 text-[13px] leading-snug">
                    {f.description}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <span>
                      Abierto hace <strong>{daysOpen}</strong>{" "}
                      {daysOpen === 1 ? "día" : "días"}
                    </span>
                    <span>1ª: {formatDate(openedAt)}</span>
                    {f.guard && (
                      <span>
                        {f.guard.persona.firstName} {f.guard.persona.lastName}
                      </span>
                    )}
                    {f.visit?.supervisor?.name && (
                      <span>{f.visit.supervisor.name}</span>
                    )}
                  </div>

                  {target && (
                    <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-primary">
                      <TargetIcon className="h-3.5 w-3.5" />
                      <span>{target.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
