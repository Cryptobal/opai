"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ShieldCheck, ShieldX, MapPin, User, ExternalLink, Globe } from "lucide-react";

interface Application {
  id: string;
  etapa: string;
  matchScore: number | null;
  matchDetalle: Record<string, number> | null;
  fuente: string;
  notasInternas: string | null;
  createdAt: string;
  guardia: {
    id: string;
    code: string | null;
    os10: boolean | null;
    os10ExpiresAt: string | null;
    experienciaAnios: number | null;
    turnosDisponibles: string[];
    lifecycleStatus: string;
    persona: {
      firstName: string;
      lastName: string;
      rut: string | null;
      sex: string | null;
      commune: string | null;
      region: string | null;
    };
  };
}

interface Job {
  id: string;
  titulo: string;
  estado: string;
  turno: string;
  region: string;
  applications: Application[];
  channels: Array<{ id: string; canal: string; estado: string | null; activo: boolean; externalId: string | null }>;
}

interface ManualChannel {
  key: string;
  label: string;
}

const ETAPAS = ["POSTULADO", "EN_REVISION", "ENTREVISTA", "OFERTA", "CONTRATADO"] as const;
const ETAPA_LABELS: Record<string, string> = {
  POSTULADO: "Postulado",
  EN_REVISION: "En revisión",
  ENTREVISTA: "Entrevista",
  OFERTA: "Oferta",
  CONTRATADO: "Contratado",
  DESCARTADO: "Descartado",
};
const ETAPA_COLORS: Record<string, string> = {
  POSTULADO: "bg-gray-100",
  EN_REVISION: "bg-blue-50",
  ENTREVISTA: "bg-amber-50",
  OFERTA: "bg-purple-50",
  CONTRATADO: "bg-green-50",
};
const MANUAL_PORTALS: Record<string, string> = {
  indeed: "https://indeed.com/hiring",
  computrabajo: "https://www.computrabajo.cl",
  bumeran: "https://www.bumeran.com",
  laborum: "https://www.laborum.com",
  linkedin: "https://www.linkedin.com/talent",
  yapo: "https://www.yapo.cl",
};

const FUENTE_COLORS: Record<string, string> = {
  google_jobs: "bg-blue-100 text-blue-700",
  indeed: "bg-indigo-100 text-indigo-700",
  computrabajo: "bg-orange-100 text-orange-700",
  base_opai: "bg-green-100 text-green-700",
  portal_guardia: "bg-teal-100 text-teal-700",
  directo: "bg-gray-100 text-gray-700",
};

const NEXT_ETAPA: Record<string, string> = {
  POSTULADO: "EN_REVISION",
  EN_REVISION: "ENTREVISTA",
  ENTREVISTA: "OFERTA",
  OFERTA: "CONTRATADO",
};

export function AtsPipelineClient({ job, manualChannels = [] }: { job: Job; manualChannels?: ManualChannel[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Application | null>(null);
  const [moving, setMoving] = useState(false);
  const [showDescartados, setShowDescartados] = useState(false);
  const [channelUrls, setChannelUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const ch of job.channels) {
      if (ch.externalId) initial[ch.canal] = ch.externalId;
    }
    return initial;
  });
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  const pipeline = new Map<string, Application[]>();
  for (const e of ETAPAS) pipeline.set(e, []);
  pipeline.set("DESCARTADO", []);

  for (const app of job.applications) {
    const list = pipeline.get(app.etapa);
    if (list) list.push(app);
  }

  async function moveEtapa(appId: string, nuevaEtapa: string) {
    setMoving(true);
    try {
      const res = await fetch(`/api/ops/ats/jobs/${job.id}/applications/${appId}/etapa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: nuevaEtapa }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success(`Movido a ${ETAPA_LABELS[nuevaEtapa]}`);
      setSelected(null);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setMoving(false);
    }
  }

  async function saveChannelUrl(canal: string, url: string) {
    setSavingUrl(canal);
    try {
      const res = await fetch(`/api/ops/ats/jobs/${job.id}/channel-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, externalUrl: url }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success(`URL de ${canal} guardada`);
    } catch {
      toast.error("Error de red");
    } finally {
      setSavingUrl(null);
    }
  }

  const descartados = pipeline.get("DESCARTADO") ?? [];

  // Channels that are automatic (already published)
  const autoChannels = job.channels.filter(
    (ch) => ch.activo && ch.estado === "publicado",
  );

  return (
    <div className="space-y-4">
      {/* Distribution section — per job */}
      {(manualChannels.length > 0 || autoChannels.length > 0) && (
        <Card className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm sm:text-base">Distribución de este aviso</h3>
          </div>

          {/* Auto-published channels */}
          {autoChannels.length > 0 && (
            <div className="space-y-2">
              {autoChannels.map((ch) => (
                <div key={ch.canal} className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="text-[10px]">Publicado</Badge>
                  <span className="font-medium">{ch.canal.replace("_", " ")}</span>
                  {ch.externalId && (
                    <a
                      href={ch.externalId}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate"
                    >
                      Ver aviso
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Manual channels — publish + paste URL */}
          {manualChannels.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Publica este aviso en los portales habilitados y pega el enlace para trazabilidad.
              </p>
              {manualChannels.map(({ key, label }) => {
                const portalUrl = MANUAL_PORTALS[key];
                const currentUrl = channelUrls[key] ?? "";
                return (
                  <div key={key} className="space-y-1.5 p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{label}</span>
                      {portalUrl && (
                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Ir a {label} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        value={currentUrl}
                        onChange={(e) =>
                          setChannelUrls((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder="Pega la URL del aviso publicado..."
                        className="text-xs h-8"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-8 text-xs"
                        disabled={!currentUrl || savingUrl === key}
                        onClick={() => saveChannelUrl(key, currentUrl)}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-5 gap-3 min-h-[400px]">
        {ETAPAS.map((etapa) => {
          const apps = pipeline.get(etapa) ?? [];
          return (
            <div key={etapa} className={`rounded-lg p-3 ${ETAPA_COLORS[etapa]}`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">{ETAPA_LABELS[etapa]}</h4>
                <Badge variant="secondary" className="text-xs">{apps.length}</Badge>
              </div>
              <div className="space-y-2">
                {apps.map((app) => (
                  <Card
                    key={app.id}
                    className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelected(app)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold shrink-0">
                        {app.guardia.persona.firstName[0]}
                        {app.guardia.persona.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {app.guardia.persona.firstName} {app.guardia.persona.lastName}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {app.guardia.os10 ? (
                            <ShieldCheck className="h-3 w-3 text-green-600" />
                          ) : (
                            <ShieldX className="h-3 w-3 text-red-400" />
                          )}
                          {app.guardia.persona.commune && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {app.guardia.persona.commune}
                            </span>
                          )}
                        </div>
                        {app.matchScore !== null && (
                          <div className="mt-1.5">
                            <Progress value={app.matchScore} className="h-1.5" />
                            <span className="text-xs text-muted-foreground">{app.matchScore}%</span>
                          </div>
                        )}
                        <Badge className={`text-[10px] mt-1 ${FUENTE_COLORS[app.fuente] ?? "bg-gray-100"}`} variant="secondary">
                          {app.fuente.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Descartados toggle */}
      {descartados.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDescartados(!showDescartados)}
          >
            Descartados ({descartados.length}) {showDescartados ? "▲" : "▼"}
          </Button>
          {showDescartados && (
            <div className="grid grid-cols-5 gap-2 mt-2">
              {descartados.map((app) => (
                <Card
                  key={app.id}
                  className="p-2 opacity-60 cursor-pointer"
                  onClick={() => setSelected(app)}
                >
                  <p className="text-xs truncate">
                    {app.guardia.persona.firstName} {app.guardia.persona.lastName}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selected.guardia.persona.firstName} {selected.guardia.persona.lastName}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">RUT:</span>{" "}
                    {selected.guardia.persona.rut ?? "Sin RUT"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Código:</span>{" "}
                    {selected.guardia.code ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">OS10:</span>{" "}
                    {selected.guardia.os10 ? "Sí" : "No"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Experiencia:</span>{" "}
                    {selected.guardia.experienciaAnios ?? 0} años
                  </div>
                  <div>
                    <span className="text-muted-foreground">Región:</span>{" "}
                    {selected.guardia.persona.region ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Comuna:</span>{" "}
                    {selected.guardia.persona.commune ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fuente:</span>{" "}
                    <Badge className={FUENTE_COLORS[selected.fuente] ?? ""} variant="secondary">
                      {selected.fuente}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Etapa:</span>{" "}
                    <Badge variant="outline">{ETAPA_LABELS[selected.etapa]}</Badge>
                  </div>
                </div>

                {selected.matchScore !== null && (
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Match Score: {selected.matchScore}%
                    </p>
                    <Progress value={selected.matchScore} className="h-2" />
                    {selected.matchDetalle && (
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                        {Object.entries(selected.matchDetalle).map(([k, v]) => (
                          <div key={k}>
                            {k}: <span className="font-medium text-foreground">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selected.notasInternas && (
                  <div>
                    <p className="text-sm font-medium">Notas internas</p>
                    <p className="text-sm text-muted-foreground">{selected.notasInternas}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t">
                  {NEXT_ETAPA[selected.etapa] && (
                    <Button
                      onClick={() => moveEtapa(selected.id, NEXT_ETAPA[selected.etapa])}
                      disabled={moving}
                      className="flex-1"
                    >
                      Mover a {ETAPA_LABELS[NEXT_ETAPA[selected.etapa]]}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                  {selected.etapa !== "DESCARTADO" && (
                    <Button
                      variant="destructive"
                      onClick={() => moveEtapa(selected.id, "DESCARTADO")}
                      disabled={moving}
                    >
                      Descartar
                    </Button>
                  )}
                  {selected.etapa === "DESCARTADO" && (
                    <Button
                      variant="outline"
                      onClick={() => moveEtapa(selected.id, "POSTULADO")}
                      disabled={moving}
                      className="flex-1"
                    >
                      Reactivar
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
