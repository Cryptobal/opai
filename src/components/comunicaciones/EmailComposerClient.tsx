"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Mail,
  Send,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";

type Guardia = {
  id: string;
  code: string | null;
  nombre: string;
  email: string | null;
  lifecycleStatus: string;
  currentInstallationId?: string | null;
};

type Installation = {
  id: string;
  name: string;
};

type Template = {
  id: string;
  nombre: string;
  asunto: string;
  tipo: string;
};

interface EmailComposerClientProps {
  tenantId: string;
}

const STEPS = [
  { label: "Destinatarios", icon: Users },
  { label: "Contenido", icon: Mail },
  { label: "Revisión y Envío", icon: Send },
] as const;

export default function EmailComposerClient({ tenantId }: EmailComposerClientProps) {
  const [step, setStep] = useState(0);
  const [guardias, setGuardias] = useState<Guardia[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingGuardias, setLoadingGuardias] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Step 1
  const [filterStatus, setFilterStatus] = useState("active");
  const [installationId, setInstallationId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [installations, setInstallations] = useState<Installation[]>([]);

  // Step 2
  const [templateId, setTemplateId] = useState("");
  const [asunto, setAsunto] = useState("");

  // Step 3
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  void tenantId;

  useEffect(() => {
    async function fetchGuardias() {
      try {
        const statusParam = filterStatus === "all" ? "" : filterStatus;
        const url = `/api/personas/guardias${statusParam ? `?status=${statusParam}` : ""}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success !== false) {
          const list = (json.data ?? json).map((g: Record<string, unknown>) => {
            const persona = g.persona as Record<string, unknown> | undefined;
            const lastName = (persona?.lastName ?? g.lastName) as string | undefined;
            const firstName = (persona?.firstName ?? g.firstName) as string | undefined;
            return {
              id: g.id as string,
              code: (g.code as string) ?? null,
              nombre:
                (g.nombre as string) ??
                [lastName, firstName].filter(Boolean).join(" ") ??
                "Sin nombre",
              email: (g.personalEmail as string) ?? (persona?.personalEmail as string) ?? (g.email as string) ?? null,
              lifecycleStatus: (g.lifecycleStatus as string) ?? "contratado",
              currentInstallationId: (g.currentInstallationId as string) ?? null,
            };
          });
          setGuardias(list);
        }
      } catch {
        toast.error("Error al cargar guardias");
      } finally {
        setLoadingGuardias(false);
      }
    }
    setLoadingGuardias(true);
    fetchGuardias();
  }, [filterStatus]);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/personas/comunicaciones/templates");
        const json = await res.json();
        if (json.success && json.data) {
          setTemplates(json.data);
        }
      } catch {
        toast.error("Error al cargar plantillas");
      } finally {
        setLoadingTemplates(false);
      }
    }
    fetchTemplates();
  }, []);

  useEffect(() => {
    async function fetchInstallations() {
      try {
        const res = await fetch("/api/ops/instalaciones");
        const json = await res.json();
        if (json.success && json.data) {
          setInstallations(
            json.data.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })),
          );
        }
      } catch {
        // Silencioso: el filtro de instalación no estará disponible
      }
    }
    fetchInstallations();
  }, []);

  const filteredGuardias = useMemo(() => {
    let list = guardias;
    if (installationId && installationId !== "all") {
      list = list.filter((g) => g.currentInstallationId === installationId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.nombre.toLowerCase().includes(q) ||
          (g.code ?? "").toLowerCase().includes(q) ||
          (g.email ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [guardias, installationId, search]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  const toggleGuardia = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredGuardias.map((g) => g.id)));
  }, [filteredGuardias]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setAsunto(t.asunto);
  }

  const canAdvance = (): boolean => {
    if (step === 0) return selectedIds.size > 0;
    if (step === 1) return !!templateId && !!asunto.trim();
    return true;
  };

  async function handleSend() {
    setConfirmOpen(false);
    setSending(true);
    try {
      const res = await fetch("/api/personas/comunicaciones/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaIds: Array.from(selectedIds),
          templateId,
          asunto: asunto.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Error al enviar correos");
        return;
      }
      toast.success(`Enviados: ${json.enviados}, Errores: ${json.errores}`);
      setStep(0);
      setSelectedIds(new Set());
      setTemplateId("");
      setAsunto("");
    } catch {
      toast.error("Error de conexión al enviar correos");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Enviar Comunicación
        </CardTitle>
        {/* Stepper */}
        <div className="flex items-center gap-2 mt-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`h-px w-6 ${isDone ? "bg-status-ok" : "bg-muted"}`}
                  />
                )}
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-status-ok-soft text-status-ok-fg"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* STEP 0: Destinatarios */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={installationId} onValueChange={setInstallationId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Instalación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las instalaciones</SelectItem>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Buscar guardia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-60"
              />
              <Button variant="outline" size="sm" onClick={selectAll}>
                <Users className="h-3.5 w-3.5 mr-1" />
                Todos los activos
              </Button>
              {selectedIds.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="font-semibold">
                  {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
                </Badge>
                {Array.from(selectedIds)
                  .slice(0, 10)
                  .map((id) => {
                    const g = guardias.find((x) => x.id === id);
                    return g ? (
                      <Badge
                        key={id}
                        variant="outline"
                        className="cursor-pointer hover:bg-destructive/20"
                        onClick={() => toggleGuardia(id)}
                      >
                        {g.nombre}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ) : null;
                  })}
                {selectedIds.size > 10 && (
                  <Badge variant="outline">+{selectedIds.size - 10} más</Badge>
                )}
              </div>
            )}

            {loadingGuardias ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Cargando guardias…
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y divide-border">
                {filteredGuardias.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">
                    No se encontraron guardias
                  </p>
                ) : (
                  filteredGuardias.map((g) => {
                    const selected = selectedIds.has(g.id);
                    return (
                      <div
                        key={g.id}
                        onClick={() => toggleGuardia(g.id)}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50 ${
                          selected ? "bg-primary/10" : ""
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded border flex items-center justify-center text-[10px] ${
                            selected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium break-words">{g.nombre}</p>
                          <p className="text-xs text-muted-foreground break-all">
                            {g.code ?? "–"} · {g.email ?? "Sin email"}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Contenido */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Plantilla</label>
              {loadingTemplates ? (
                <div className="flex items-center text-muted-foreground text-sm gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando…
                </div>
              ) : (
                <Select value={templateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plantilla…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {templates.length === 0 && !loadingTemplates && (
                <p className="text-xs text-status-warn-fg flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  No hay plantillas disponibles. Crea una en la pestaña Plantillas.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Asunto</label>
              <Input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto del correo"
              />
            </div>

            {selectedTemplate && (
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Usando plantilla:</p>
                <p className="text-sm font-medium">{selectedTemplate.nombre}</p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Revisión */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Destinatarios:</span>
                <Badge variant="secondary">
                  {selectedIds.size} guardia{selectedIds.size !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Plantilla:</span>
                <span className="text-sm">
                  {selectedTemplate?.nombre ?? "–"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Asunto:</span>
                <span className="text-sm">{asunto || "–"}</span>
              </div>
            </div>

            {selectedIds.size > 20 && (
              <div className="flex items-start gap-2 text-status-warn-fg text-xs rounded-md bg-status-warn-soft p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Estás a punto de enviar a {selectedIds.size} guardias. Verifica los
                  destinatarios antes de continuar.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance()}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={sending || !canAdvance()}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" />
                  Enviar ahora
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
            <DialogDescription>
              Se enviarán {selectedIds.size} correo{selectedIds.size !== 1 ? "s" : ""}{" "}
              usando la plantilla &quot;{selectedTemplate?.nombre}&quot;. Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Confirmar envío
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
