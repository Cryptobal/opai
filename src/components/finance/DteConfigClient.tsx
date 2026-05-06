"use client";

/**
 * DteConfigClient — UI de configuración DTE (3 tabs).
 *
 *  1. Datos del Emisor   — RUT, razón social, giro, ambiente, etc.
 *  2. Certificado Digital — upload de .pfx + password (encriptado AES-256-GCM)
 *  3. Folios (CAFs)       — upload de XML CAF + listado + toggle isActive
 *
 * Nota: el PROVIDER DTE (ej. SimpleAPI) ya NO se elige por tenant — es una
 * decisión platform-wide (PlatformDteProvider) gestionada en /platform/dte.
 *
 * Toda la UI usa primitives de @/components/ui (shadcn) y respeta el patrón
 * del DS v3 (tokens semánticos, sin colores hardcoded).
 */

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

// ── Types — todos los Dates llegan ya serializados como ISO string ────────

interface ConfigData {
  environment: string;
  isActive: boolean;
  emisorRut: string | null;
  emisorRazonSocial: string | null;
  emisorGiro: string | null;
  emisorActeco: number | null;
  emisorDireccion: string | null;
  emisorComuna: string | null;
  emisorCiudad: string | null;
  emisorTelefono: string | null;
  emisorEmail: string | null;
  resolNumero: number | null;
  resolFecha: string | null;
  /** Logo del emisor en base64 (PNG/JPG). Se imprime en el PDF del DTE. */
  logoBase64: string | null;
}

interface CertData {
  id: string;
  fileName: string;
  rutTitular: string;
  nombreTitular: string | null;
  emisorCert: string | null;
  notBefore: string;
  notAfter: string;
  fingerprint: string;
  uploadedAt: string;
}

interface CafData {
  id: string;
  dteType: number;
  folioDesde: number;
  folioHasta: number;
  rutEmisor: string;
  fechaAutorizacion: string;
  fileName: string;
  isActive: boolean;
  uploadedAt: string;
}

const DEFAULT_CONFIG: ConfigData = {
  environment: "CERTIFICATION",
  isActive: false,
  emisorRut: "",
  emisorRazonSocial: "",
  emisorGiro: "",
  emisorActeco: null,
  emisorDireccion: "",
  emisorComuna: "",
  emisorCiudad: "",
  emisorTelefono: "",
  emisorEmail: "",
  resolNumero: null,
  resolFecha: null,
  logoBase64: null,
};

interface Props {
  // Aceptamos `unknown`-ish del server: la página serializa Dates a ISO antes
  // de cruzar el boundary, así que mapeamos defensivamente con DEFAULT_CONFIG.
  initialConfig: Partial<ConfigData> | null;
  initialCertificate: CertData | null;
  initialCafs: CafData[];
}

export function DteConfigClient({
  initialConfig,
  initialCertificate,
  initialCafs,
}: Props) {
  const [config, setConfig] = useState<ConfigData>(() => ({
    ...DEFAULT_CONFIG,
    ...(initialConfig ?? {}),
  }));
  const [cert, setCert] = useState<CertData | null>(initialCertificate);
  const [cafs, setCafs] = useState<CafData[]>(initialCafs);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/finance/config/dte-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Error");
      // El backend retorna el row actualizado; reaplicamos defaults para
      // cubrir campos undefined.
      const returned = body.data as Partial<ConfigData>;
      setConfig({ ...DEFAULT_CONFIG, ...returned });
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingConfig(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch(
        "/api/finance/config/dte-provider/test-connection",
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Falló");
      toast.success("Conexión exitosa con SimpleAPI");
    } catch (err) {
      toast.error(`Falló prueba de conexión: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Tabs defaultValue="emisor" className="w-full">
      <TabsList>
        <TabsTrigger value="emisor">Datos del Emisor</TabsTrigger>
        <TabsTrigger value="certificado">Certificado Digital</TabsTrigger>
        <TabsTrigger value="folios">Folios (CAFs)</TabsTrigger>
      </TabsList>

      {/* ── Tab 1: Datos del Emisor ───────────────────────────────────── */}
      <TabsContent value="emisor" className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <Select
                  value={config.environment}
                  onValueChange={(v) =>
                    setConfig((c) => ({ ...c, environment: v }))
                  }
                >
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CERTIFICATION">Certificación</SelectItem>
                    <SelectItem value="PRODUCTION">Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>RUT Emisor</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorRut ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, emisorRut: e.target.value }))
                  }
                  placeholder="12345678-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Razón Social</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorRazonSocial ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      emisorRazonSocial: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Giro</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorGiro ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, emisorGiro: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Código Actividad Económica</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  value={config.emisorActeco ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      emisorActeco: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    }))
                  }
                  placeholder="801000"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Dirección</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorDireccion ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      emisorDireccion: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Comuna</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorComuna ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, emisorComuna: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ciudad</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorCiudad ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, emisorCiudad: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  className="h-10 sm:h-9"
                  value={config.emisorTelefono ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      emisorTelefono: e.target.value,
                    }))
                  }
                  placeholder="+56 2 1234 5678"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="email"
                  value={config.emisorEmail ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, emisorEmail: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Resolución SII Nº</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  value={config.resolNumero ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      resolNumero: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha Resolución SII</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="date"
                  value={
                    config.resolFecha ? config.resolFecha.split("T")[0] : ""
                  }
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      resolFecha: e.target.value || null,
                    }))
                  }
                />
              </div>
            </div>

            {/* Logo del emisor — se imprime en el PDF del DTE */}
            <div className="pt-4 border-t border-ds-border-subtle space-y-3">
              <div>
                <Label>Logo del emisor (opcional)</Label>
                <p className="text-[12px] text-ds-text-3 mt-0.5">
                  Aparece en la esquina superior izquierda del PDF de la
                  factura. PNG o JPG, máximo ~600KB. Se almacena en base64 en
                  la BD del tenant.
                </p>
              </div>
              <div className="flex items-start gap-4">
                {config.logoBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      config.logoBase64.startsWith("data:")
                        ? config.logoBase64
                        : `data:image/png;base64,${config.logoBase64}`
                    }
                    alt="Logo emisor"
                    className="h-16 w-auto max-w-[200px] object-contain rounded border border-ds-border-default bg-ds-surface-1 p-1"
                  />
                ) : (
                  <div className="h-16 w-32 flex items-center justify-center text-[12px] text-ds-text-3 rounded border border-dashed border-ds-border-default bg-ds-surface-1">
                    Sin logo
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="h-10 sm:h-9"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 600 * 1024) {
                        toast.error(
                          `Logo muy grande (${Math.round(file.size / 1024)}KB). Máx 600KB.`,
                        );
                        e.target.value = "";
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = String(reader.result ?? "");
                        // Guardamos sin el prefijo data:image/...;base64,
                        // para que SimpleAPI lo procese directo. El prefijo
                        // lo agregamos solo para el preview de la UI.
                        const base64 = dataUrl.split(",")[1] ?? dataUrl;
                        setConfig((c) => ({ ...c, logoBase64: base64 }));
                        toast.success(`Logo cargado (${Math.round(file.size / 1024)}KB). Recordá Guardar.`);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  {config.logoBase64 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig((c) => ({ ...c, logoBase64: null }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Quitar logo
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-ds-border-subtle">
              <Switch
                checked={config.isActive}
                onCheckedChange={(c) =>
                  setConfig((cfg) => ({ ...cfg, isActive: c }))
                }
                id="dte-active"
              />
              <Label htmlFor="dte-active">Emisión activa</Label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={saveConfig} disabled={savingConfig}>
                {savingConfig ? (
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar
              </Button>
              <Button
                variant="outline"
                onClick={testConnection}
                disabled={testing}
              >
                {testing && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                Probar conexión
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 2: Certificado Digital ────────────────────────────────── */}
      <TabsContent value="certificado" className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            {cert ? (
              <CertificateInfo
                cert={cert}
                onDeleted={() => {
                  setCert(null);
                  toast.success("Certificado eliminado");
                }}
              />
            ) : (
              <UploadCertForm
                onUploaded={(c) => {
                  setCert(c);
                  toast.success("Certificado subido y validado");
                }}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 3: Folios (CAFs) ──────────────────────────────────────── */}
      <TabsContent value="folios" className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            <UploadCafForm
              onUploaded={(c) => {
                setCafs((prev) => [...prev, c]);
                toast.success(
                  `CAF subido: tipo ${c.dteType}, folios ${c.folioDesde}–${c.folioHasta}`
                );
              }}
            />
            <div className="border-t border-ds-border-subtle pt-4">
              <h3 className="font-semibold mb-3 text-ds-text-1">
                CAFs cargados
              </h3>
              {cafs.length === 0 ? (
                <p className="text-sm text-ds-text-3">
                  No hay CAFs cargados.
                </p>
              ) : (
                <div className="space-y-2">
                  {cafs.map((caf) => (
                    <CafRow
                      key={caf.id}
                      caf={caf}
                      onToggle={(c) =>
                        setCafs((prev) =>
                          prev.map((x) =>
                            x.id === caf.id ? { ...x, isActive: c } : x
                          )
                        )
                      }
                      onDeleted={() =>
                        setCafs((prev) => prev.filter((x) => x.id !== caf.id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// ─── Tab "Certificado": info card cuando hay cert ───────────────────────────

function CertificateInfo({
  cert,
  onDeleted,
}: {
  cert: CertData;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const notAfter = new Date(cert.notAfter);
  const now = new Date();
  const expired = notAfter < now;
  const expiresSoon =
    !expired && notAfter < new Date(Date.now() + 30 * 86400000);

  async function deleteCert() {
    if (!confirm("¿Eliminar el certificado?")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        "/api/finance/config/dte-provider/certificate",
        { method: "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Error");
      onDeleted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <Field label="Archivo" value={cert.fileName} />
        <Field label="Titular" value={cert.nombreTitular ?? "—"} />
        <Field label="RUT" value={cert.rutTitular} mono />
        <Field label="Emisor" value={cert.emisorCert ?? "—"} />
        <Field
          label="Vigente desde"
          value={new Date(cert.notBefore).toLocaleDateString("es-CL")}
        />
        <div>
          <div className="text-[12px] uppercase tracking-wide text-ds-text-4 mb-0.5">
            Vigente hasta
          </div>
          <div
            className={
              expired
                ? "text-status-danger-fg font-semibold"
                : expiresSoon
                ? "text-status-warn-fg font-semibold"
                : "text-ds-text-1"
            }
          >
            {notAfter.toLocaleDateString("es-CL")}
            {expired && " (vencido)"}
            {expiresSoon && " (expira pronto)"}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="text-[12px] uppercase tracking-wide text-ds-text-4 mb-0.5">
            Fingerprint SHA-1
          </div>
          <code className="text-xs font-mono break-all text-ds-text-2">
            {cert.fingerprint}
          </code>
        </div>
      </div>
      <Button
        variant="destructive"
        onClick={deleteCert}
        disabled={deleting}
      >
        {deleting ? (
          <Loader2 className="animate-spin h-4 w-4 mr-2" />
        ) : (
          <Trash2 className="h-4 w-4 mr-2" />
        )}
        Eliminar certificado
      </Button>
      <p className="text-xs text-ds-text-3 border-l-2 border-status-warn-border pl-3 bg-status-warn-soft py-2 pr-2 rounded-r">
        El certificado se almacena encriptado con AES-256-GCM. Solo se
        desencripta en memoria al momento de firmar un DTE. Nunca se loguea ni
        se muestra desencriptado.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wide text-ds-text-4 mb-0.5">
        {label}
      </div>
      <div className={mono ? "font-mono text-ds-text-1" : "text-ds-text-1"}>
        {value}
      </div>
    </div>
  );
}

// ─── Tab "Certificado": upload form cuando NO hay cert ──────────────────────

function UploadCertForm({ onUploaded }: { onUploaded: (c: CertData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);

  async function submit() {
    if (!file || !password) {
      toast.error("Selecciona archivo y password");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", password);
      const res = await fetch("/api/finance/config/dte-provider/certificate", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Error");
      onUploaded(body.data as CertData);
      setFile(null);
      setPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Archivo .pfx</Label>
        <Input
          className="h-10 sm:h-9"
          type="file"
          accept=".pfx,.p12"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Password del certificado</Label>
        <Input
          className="h-10 sm:h-9"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button onClick={submit} disabled={uploading || !file || !password}>
        {uploading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
        Subir y validar
      </Button>
      <p className="text-xs text-ds-text-3">
        Se almacenará encriptado en la base de datos. Solo se usará al momento
        de emitir DTEs.
      </p>
    </div>
  );
}

// ─── Tab "Folios": una fila de CAF ──────────────────────────────────────────

function CafRow({
  caf,
  onToggle,
  onDeleted,
}: {
  caf: CafData;
  onToggle: (newActive: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle(c: boolean) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/finance/config/dte-provider/cafs/${caf.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: c }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Error");
      onToggle(c);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `¿Eliminar el CAF tipo ${caf.dteType} (${caf.folioDesde}–${caf.folioHasta})?`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/finance/config/dte-provider/cafs/${caf.id}`,
        { method: "DELETE" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Error");
      onDeleted();
      toast.success("CAF eliminado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between border border-ds-border-subtle rounded-lg p-3 bg-ds-surface-1">
      <div className="text-sm min-w-0">
        <div className="font-mono text-ds-text-1">
          Tipo {caf.dteType} · Folios {caf.folioDesde}–{caf.folioHasta}
        </div>
        <div className="text-xs text-ds-text-3 truncate">
          {caf.fileName} · Autorizado{" "}
          {new Date(caf.fechaAutorizacion).toLocaleDateString("es-CL")}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Switch
            checked={caf.isActive}
            onCheckedChange={toggle}
            disabled={busy}
            id={`caf-${caf.id}-active`}
          />
          <Label
            htmlFor={`caf-${caf.id}-active`}
            className="text-xs text-ds-text-3"
          >
            {caf.isActive ? "Activo" : "Inactivo"}
          </Label>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={remove}
          disabled={busy}
          aria-label="Eliminar CAF"
        >
          <Trash2 className="h-4 w-4 text-status-danger-fg" />
        </Button>
      </div>
    </div>
  );
}

// ─── Tab "Folios": upload form ──────────────────────────────────────────────

function UploadCafForm({ onUploaded }: { onUploaded: (c: CafData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/finance/config/dte-provider/cafs", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Error");
      onUploaded(body.data as CafData);
      setFile(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Label>Subir archivo CAF (XML descargado del SII)</Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          className="h-10 sm:h-9"
          type="file"
          accept=".xml"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          onClick={submit}
          disabled={uploading || !file}
          className="shrink-0"
        >
          {uploading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
          Subir
        </Button>
      </div>
      <p className="text-xs text-ds-text-3">
        El XML se almacenará tal cual sin modificaciones (requisito SII para
        mantener la firma del CAF válida).
      </p>
    </div>
  );
}
