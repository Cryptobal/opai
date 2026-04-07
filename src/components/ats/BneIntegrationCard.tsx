"use client";

/**
 * BNE (Bolsa Nacional de Empleo) integration card.
 *
 * Renders inside ATS Configuration → Canales tab when the BNE channel is set
 * to `partner_api`. Lets the tenant admin paste the OAuth2 credentials issued
 * by BNE for their employer account, test the connection, and review status.
 *
 * Credentials are POSTed to /api/ops/ats/bne/credentials. The secret is never
 * sent back from the server in plaintext; only a masked preview is shown.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  HelpCircle,
} from "lucide-react";

export interface BneIntegrationConfig {
  configured: boolean;
  consumerKeyPreview?: string;
  hasSecret?: boolean;
  environment?: "prod" | "test";
  rutEmpleador?: string | null;
  idEmpleador?: number | null;
  idUsuarioPublicador?: number | null;
  mostrarNombreEmpresa?: boolean;
  defaultDiasPublicacion?: number;
  status?: "pending" | "active" | "error";
  lastSyncAt?: string | null;
  lastError?: string | null;
  jobCount?: number;
}

export function BneIntegrationCard({
  initial,
  channelEnabled,
  onToggleChannel,
}: {
  initial: BneIntegrationConfig;
  channelEnabled: boolean;
  onToggleChannel: (enabled: boolean) => void;
}) {
  const [config, setConfig] = useState<BneIntegrationConfig>(initial);
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [rutEmpleador, setRutEmpleador] = useState(initial.rutEmpleador ?? "");
  const [environment, setEnvironment] = useState<"prod" | "test">(
    initial.environment ?? "prod",
  );
  const [diasPublicacion, setDiasPublicacion] = useState(
    initial.defaultDiasPublicacion ?? 30,
  );
  const [mostrarNombre, setMostrarNombre] = useState(
    initial.mostrarNombreEmpresa ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        environment,
        defaultDiasPublicacion: diasPublicacion,
        mostrarNombreEmpresa: mostrarNombre,
      };
      if (consumerKey.trim()) body.consumerKey = consumerKey.trim();
      if (consumerSecret.trim()) body.consumerSecret = consumerSecret.trim();
      if (rutEmpleador.trim()) body.rutEmpleador = rutEmpleador.trim();

      const res = await fetch("/api/ops/ats/bne/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Error al guardar credenciales");
        return;
      }
      // Re-fetch to get masked preview / discovered ids.
      await reload();
      setConsumerKey("");
      setConsumerSecret("");
      toast.success("Credenciales BNE guardadas");
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/ops/ats/bne/test", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "BNE rechazó la conexión");
        await reload();
        return;
      }
      if (json.discovered?.idEmpleador) {
        toast.success(
          `Conectado · idEmpleador descubierto: ${json.discovered.idEmpleador}`,
        );
      } else if (json.discoveryError) {
        toast.warning(
          `Token OK, pero no se pudo descubrir idEmpleador: ${json.discoveryError}`,
        );
      } else {
        toast.success("Conexión BNE exitosa");
      }
      await reload();
    } catch {
      toast.error("Error de red al probar BNE");
    } finally {
      setTesting(false);
    }
  }

  async function reload() {
    try {
      const res = await fetch("/api/ops/ats/bne/credentials");
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch {
      /* ignore */
    }
  }

  const ready =
    config.configured &&
    config.hasSecret &&
    !!config.idEmpleador &&
    config.status === "active";

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm sm:text-base">
              BNE (Bolsa Nacional de Empleo)
            </h3>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Cómo solicitar credenciales BNE"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                sideOffset={8}
                className="!min-w-[340px] !max-w-[380px] p-4 text-xs space-y-3"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-sm text-foreground">
                    Cómo obtener tus credenciales BNE
                  </p>
                  <p className="text-muted-foreground">
                    BNE entrega credenciales API por empresa. Cada empleador
                    debe solicitar las suyas — son intransferibles.
                  </p>
                </div>

                <ol className="space-y-2 list-decimal list-inside text-foreground">
                  <li>
                    Ingresa con clave única a{" "}
                    <a
                      href="https://www.bne.cl"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-0.5 hover:underline"
                    >
                      bne.cl <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    con tu perfil empresa.
                  </li>
                  <li>
                    Envía un correo a{" "}
                    <a
                      href="mailto:soporte@bne.gob.cl?subject=Solicitud%20de%20credenciales%20API%20BNE&body=Estimados%2C%0A%0ASolicito%20generar%20credenciales%20API%20BNE%20para%20la%20siguiente%20empresa%3A%0A%0A-%20Raz%C3%B3n%20social%3A%20%0A-%20RUT%3A%20%0A-%20Contacto%20t%C3%A9cnico%3A%20%0A%0AGracias."
                      className="text-primary hover:underline font-mono"
                    >
                      soporte@bne.gob.cl
                    </a>{" "}
                    indicando:
                    <ul className="list-disc list-inside ml-3 mt-1 text-muted-foreground space-y-0.5">
                      <li>Razón social y RUT</li>
                      <li>Asunto: solicitud credenciales API BNE</li>
                      <li>Contacto técnico</li>
                    </ul>
                  </li>
                  <li>
                    Recibirás un caso{" "}
                    <code className="text-[11px]">CAS-XXXX</code>. Cuando lo
                    resuelvan, las credenciales aparecen en tu perfil empresa
                    de bne.cl, sección{" "}
                    <strong>&quot;Credenciales Generadas&quot;</strong> dentro
                    de &quot;Solicitud de credenciales API BNE&quot;.
                  </li>
                  <li>
                    Pega <em>Consumer Key</em> + <em>Consumer Secret</em> en
                    los campos de abajo, ingresa tu RUT y presiona{" "}
                    <strong>Guardar</strong>.
                  </li>
                  <li>
                    Click en <strong>Probar conexión</strong>. OPAI obtendrá
                    el token OAuth2 y descubrirá automáticamente tu{" "}
                    <code className="text-[11px]">idEmpleador</code> contra el
                    API de BNE.
                  </li>
                </ol>

                <div className="rounded-md bg-muted/50 p-2 space-y-0.5 text-muted-foreground">
                  <p className="font-medium text-foreground">Notas:</p>
                  <p>
                    · Las credenciales se cifran (AES-256-GCM) antes de
                    guardarse en la base de datos.
                  </p>
                  <p>
                    · Soporte BNE: +56 2 2405 5200 ·{" "}
                    <a
                      href="mailto:soporte@bne.gob.cl"
                      className="text-primary hover:underline"
                    >
                      soporte@bne.gob.cl
                    </a>
                  </p>
                </div>
              </PopoverContent>
            </Popover>
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              API REST
            </Badge>
            {ready ? (
              <Badge
                variant="default"
                className="text-[10px] px-1.5 py-0 bg-green-600"
              >
                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                Conectado
              </Badge>
            ) : config.status === "error" ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                <AlertTriangle className="h-3 w-3 mr-0.5" />
                Error
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Pendiente
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Publica avisos directamente a la Bolsa Nacional de Empleo vía API
            OAuth2. Cada empresa usa sus propias credenciales emitidas por BNE.
          </p>
        </div>
        <Switch checked={channelEnabled} onCheckedChange={onToggleChannel} />
      </div>

      {channelEnabled && (
        <>
          <p className="text-[11px] text-muted-foreground">
            ¿No tienes credenciales aún? Click en el ícono{" "}
            <HelpCircle className="inline h-3 w-3 -mt-0.5" /> arriba para ver
            cómo solicitarlas a BNE.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Consumer Key</Label>
              <Input
                placeholder={
                  config.consumerKeyPreview || "BrVxujLTQPkCYwKZ..."
                }
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                className="font-mono text-xs"
              />
              {config.consumerKeyPreview && !consumerKey && (
                <p className="text-[10px] text-muted-foreground">
                  Actual: {config.consumerKeyPreview}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Consumer Secret</Label>
              <Input
                type="password"
                placeholder={config.hasSecret ? "•••••••• (guardado)" : ""}
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">RUT empleador</Label>
              <Input
                placeholder="77.840.623-3"
                value={rutEmpleador}
                onChange={(e) => setRutEmpleador(e.target.value)}
                className="text-xs"
              />
              {config.idEmpleador && (
                <p className="text-[10px] text-muted-foreground">
                  idEmpleador BNE: {config.idEmpleador}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ambiente</Label>
              <select
                value={environment}
                onChange={(e) =>
                  setEnvironment(e.target.value as "prod" | "test")
                }
                className="w-full h-9 rounded-md border bg-background px-2 text-xs"
              >
                <option value="prod">Producción (api.bne.cl)</option>
                <option value="test">Pruebas (test.api.bne.cl)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Días de publicación por defecto</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={diasPublicacion}
                onChange={(e) =>
                  setDiasPublicacion(parseInt(e.target.value) || 30)
                }
                className="text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-3 pt-5">
              <Label className="text-xs">Mostrar nombre empresa</Label>
              <Switch
                checked={mostrarNombre}
                onCheckedChange={setMostrarNombre}
              />
            </div>
          </div>

          {config.lastError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <strong>Último error:</strong> {config.lastError}
            </div>
          )}

          {config.jobCount ? (
            <p className="text-[11px] text-muted-foreground">
              {config.jobCount} avisos publicados ·{" "}
              {config.lastSyncAt
                ? `último: ${new Date(config.lastSyncAt).toLocaleString("es-CL")}`
                : "—"}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} size="sm">
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Guardar
            </Button>
            <Button
              onClick={test}
              disabled={testing || !config.configured}
              size="sm"
              variant="outline"
            >
              {testing && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Probar conexión
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
