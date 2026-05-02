"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarcacionConfig } from "@/lib/ops-marcacion-config";
import {
  AlertTriangle,
  Clock,
  Fingerprint,
  Loader2,
  Mail,
  MapPin,
  QrCode,
  Route,
  Save,
  Shield,
  Timer,
  Camera,
  Users,
} from "lucide-react";

type OpsAdminRecipient = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

interface OpsMarcacionTabProps {
  config: MarcacionConfig;
  setConfig: Dispatch<SetStateAction<MarcacionConfig | null>>;
  saving: boolean;
  onSave: () => void;
}

export function OpsMarcacionTab({ config, setConfig, saving, onSave }: OpsMarcacionTabProps) {
  const [admins, setAdmins] = useState<OpsAdminRecipient[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsError, setAdminsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchAdmins = async () => {
      try {
        const res = await fetch("/api/ops/admins");
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "No se pudieron cargar los usuarios");
        }
        if (!active) return;
        setAdmins(data.data);
      } catch (error) {
        if (!active) return;
        setAdminsError(error instanceof Error ? error.message : "No se pudieron cargar los usuarios");
      } finally {
        if (active) setAdminsLoading(false);
      }
    };

    void fetchAdmins();
    return () => {
      active = false;
    };
  }, []);

  const toggleRecipient = (userId: string, checked: boolean) => {
    setConfig((current) => {
      if (!current) return current;
      const nextIds = checked
        ? Array.from(new Set([...current.emailAlertaFueraRangoUserIds, userId]))
        : current.emailAlertaFueraRangoUserIds.filter((id) => id !== userId);
      return { ...current, emailAlertaFueraRangoUserIds: nextIds };
    });
  };

  const selectedAdmins = admins.filter((admin) => config.emailAlertaFueraRangoUserIds.includes(admin.id));

  return (
    <div className="space-y-6">
      {/* Parámetros de marcación */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-primary" />
            Parámetros de marcación
          </h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Tolerancia de atraso (min)
              </Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={config.toleranciaAtrasoMinutos}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, toleranciaAtrasoMinutos: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Entradas dentro de este rango no se consideran atraso
              </p>
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                Rotación código QR (horas)
              </Label>
              <Input
                type="number"
                min={0}
                max={720}
                value={config.rotacionCodigoHoras}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rotacionCodigoHoras: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                0 = no rotar automáticamente. Ej: 168 = cada semana
              </p>
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                Plazo oposición (horas)
              </Label>
              <Input
                type="number"
                min={12}
                max={168}
                value={config.plazoOposicionHoras}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, plazoOposicionHoras: Number(e.target.value) || 48 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Horas para que el trabajador se oponga a un ajuste manual
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-1">
            <div className="sm:max-w-xs">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                Delay email marca manual (min)
              </Label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={config.emailDelayManualMinutos ?? 0}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, emailDelayManualMinutos: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Minutos de espera antes de enviar el email de marca manual.
                0 = inmediato. Si se resetea la asistencia antes de este plazo, el email no se envía.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Geocerca y alertas fuera de rango
              </h4>
              <p className="text-xs text-muted-foreground">
                Hoy el radio de marcación existe por instalación. Aquí puedes activar un radio global
                para todo el tenant y definir quién recibe las alertas cuando una marca queda fuera de rango.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={Boolean(config.radioGlobalMarcacionEnabled)}
                  onChange={(e) =>
                    setConfig((c) => c && { ...c, radioGlobalMarcacionEnabled: e.target.checked })
                  }
                  className="rounded border-border"
                />
                <div className="text-xs">
                  <p className="font-medium">Usar radio global de marcación</p>
                  <p className="text-muted-foreground">
                    Si está desactivado, se usa el radio configurado en cada instalación.
                  </p>
                </div>
              </label>

              <div>
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Radio global permitido (m)
                </Label>
                <Input
                  type="number"
                  min={10}
                  max={1000}
                  disabled={!config.radioGlobalMarcacionEnabled}
                  value={config.radioGlobalMarcacionM}
                  onChange={(e) => {
                    const raw = Number.parseInt(e.target.value, 10);
                    const nextValue = Number.isNaN(raw) ? 1000 : Math.min(1000, Math.max(10, raw));
                    setConfig((c) => c && {
                      ...c,
                      radioGlobalMarcacionM: nextValue,
                    });
                  }}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se aplica a marcaciones PIN y Face ID. Rango permitido: 10 a 1000 metros.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={Boolean(config.emailAlertaFueraRangoEnabled)}
                  onChange={(e) =>
                    setConfig((c) => c && { ...c, emailAlertaFueraRangoEnabled: e.target.checked })
                  }
                  className="rounded border-border"
                />
                <div className="text-xs">
                  <p className="font-medium flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Enviar alerta por fuera de rango
                  </p>
                  <p className="text-muted-foreground">
                    Email automático cuando el guardia marca fuera del radio permitido.
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={Boolean(config.emailAlertaFueraRangoIncludeSupervisors)}
                  onChange={(e) =>
                    setConfig((c) => c && {
                      ...c,
                      emailAlertaFueraRangoIncludeSupervisors: e.target.checked,
                    })
                  }
                  className="rounded border-border"
                />
                <div className="text-xs">
                  <p className="font-medium flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Incluir supervisores asignados
                  </p>
                  <p className="text-muted-foreground">
                    Mantiene el comportamiento actual y suma los usuarios extra elegidos abajo.
                  </p>
                </div>
              </label>
            </div>

            <div className="space-y-2">
              <div>
                <Label>Usuarios adicionales a notificar</Label>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Selecciona usuarios internos del tenant. Se deduplican si también son supervisores asignados.
                </p>
              </div>

              {adminsLoading ? (
                <div className="flex items-center gap-2 rounded border border-border px-3 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando usuarios...
                </div>
              ) : adminsError ? (
                <div className="flex items-center gap-2 rounded border border-status-warn-border bg-status-warn-soft px-3 py-3 text-xs text-status-warn-fg dark:text-status-warn-fg">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {adminsError}
                </div>
              ) : admins.length === 0 ? (
                <div className="rounded border border-border px-3 py-3 text-xs text-muted-foreground">
                  No hay usuarios activos disponibles para asignar.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {admins.map((admin) => {
                    const checked = config.emailAlertaFueraRangoUserIds.includes(admin.id);
                    const displayName = admin.name?.trim() || admin.email;
                    return (
                      <label
                        key={admin.id}
                        className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleRecipient(admin.id, e.target.checked)}
                          className="mt-0.5 rounded border-border"
                        />
                        <div className="min-w-0 text-xs">
                          <p className="font-medium text-foreground">{displayName}</p>
                          <p className="text-muted-foreground truncate">{admin.email}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {admin.role}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="rounded border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground">
                {selectedAdmins.length > 0
                  ? `Usuarios adicionales seleccionados: ${selectedAdmins.map((admin) => admin.name?.trim() || admin.email).join(", ")}.`
                  : "No hay usuarios adicionales seleccionados."}
                {" "}
                {config.emailAlertaFueraRangoIncludeSupervisors
                  ? "Los supervisores asignados también recibirán la alerta."
                  : "Solo se notificará a los usuarios seleccionados."}
              </div>
            </div>
          </div>

          <div>
            <Label>Cláusula legal (incluida en aviso de marca manual)</Label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              value={config.clausulaLegal}
              onChange={(e) =>
                setConfig((c) => c && { ...c, clausulaLegal: e.target.value })
              }
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void onSave()} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Guardar parámetros"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Parámetros de rondas */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            Parámetros de rondas
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Polling monitoreo (seg)</Label>
              <Input
                type="number"
                min={10}
                max={120}
                value={config.rondasPollingSegundos ?? 30}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasPollingSegundos: Number(e.target.value) || 30 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Frecuencia de actualización recomendada para monitoreo.
              </p>
            </div>
            <div>
              <Label>Ventana inicio antes (min)</Label>
              <Input
                type="number"
                min={0}
                max={360}
                value={config.rondasVentanaInicioAntesMin ?? 60}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasVentanaInicioAntesMin: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Ventana inicio después (min)</Label>
              <Input
                type="number"
                min={0}
                max={360}
                value={config.rondasVentanaInicioDespuesMin ?? 120}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasVentanaInicioDespuesMin: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={Boolean(config.rondasRequiereFotoEvidencia)}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasRequiereFotoEvidencia: e.target.checked })
                }
                className="rounded border-border"
              />
              <div className="text-xs">
                <p className="font-medium flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  Requerir foto evidencia
                </p>
                <p className="text-muted-foreground">
                  Exige evidencia visual al marcar checkpoint.
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={Boolean(config.rondasPermiteReemplazo)}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasPermiteReemplazo: e.target.checked })
                }
                className="rounded border-border"
              />
              <div className="text-xs">
                <p className="font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Permitir reemplazo de guardia
                </p>
                <p className="text-muted-foreground">
                  Autoriza inicio de ronda por guardia distinto al asignado.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void onSave()} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Guardar parámetros de rondas"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
