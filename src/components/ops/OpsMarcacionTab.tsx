"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Clock,
  Shield,
  QrCode,
  Save,
  Fingerprint,
  Timer,
  Route,
  Camera,
  Users,
} from "lucide-react";

interface MarcacionConfig {
  toleranciaAtrasoMinutos: number;
  rotacionCodigoHoras: number;
  plazoOposicionHoras: number;
  emailComprobanteDigitalEnabled: boolean;
  emailAvisoMarcaManualEnabled: boolean;
  emailDelayManualMinutos: number;
  clausulaLegal: string;
  rondasPollingSegundos: number;
  rondasVentanaInicioAntesMin: number;
  rondasVentanaInicioDespuesMin: number;
  rondasRequiereFotoEvidencia: boolean;
  rondasPermiteReemplazo: boolean;
}

interface OpsMarcacionTabProps {
  config: MarcacionConfig;
  setConfig: Dispatch<SetStateAction<MarcacionConfig | null>>;
  saving: boolean;
  onSave: () => void;
}

export function OpsMarcacionTab({ config, setConfig, saving, onSave }: OpsMarcacionTabProps) {
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
