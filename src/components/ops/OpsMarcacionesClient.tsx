"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LogIn,
  LogOut,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Search,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Smartphone,
  Filter,
  Copy,
  Link2,
  QrCode,
  Download,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Tipos ───

interface MarcacionItem {
  id: string;
  tipo: "entrada" | "salida";
  timestamp: string;
  guardia: {
    id: string;
    code: string | null;
    nombre: string;
    rut: string | null;
    email: string | null;
  };
  installation: {
    id: string;
    nombre: string;
    geoRadiusM: number;
  };
  puesto: { id: string; nombre: string; horario: string } | null;
  slotNumber: number | null;
  geo: {
    lat: number | null;
    lng: number | null;
    validada: boolean;
    distanciaM: number | null;
  };
  metodoId: string;
  fotoEvidencia: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  hashIntegridad: string;
  createdAt: string;
}

interface Stats {
  totalHoy: number;
  entradasHoy: number;
  salidasHoy: number;
  fueraRadioHoy: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ClientData {
  id: string;
  name: string;
  installations: { id: string; name: string; marcacionCode?: string | null }[];
}

// ─── Props ───

interface OpsMarcacionesClientProps {
  initialClients: ClientData[];
}

// ─── Componente ───

export function OpsMarcacionesClient({ initialClients }: OpsMarcacionesClientProps) {
  const [marcaciones, setMarcaciones] = useState<MarcacionItem[]>([]);
  const [stats, setStats] = useState<Stats>({ totalHoy: 0, entradasHoy: 0, salidasHoy: 0, fueraRadioHoy: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [installationId, setInstallationId] = useState("");
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchText, setSearchText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [urlsMarcacionOpen, setUrlsMarcacionOpen] = useState(false);

  // Todas las instalaciones (flatten)
  const allInstallations = initialClients.flatMap((c) =>
    c.installations.map((i) => ({ ...i, clientName: c.name }))
  );

  const fetchMarcaciones = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (installationId) params.set("installationId", installationId);
        if (desde) params.set("desde", desde);
        if (hasta) params.set("hasta", hasta);
        params.set("page", page.toString());
        params.set("limit", "50");

        const res = await fetch(`/api/ops/marcacion/reporte?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          setMarcaciones(data.data.marcaciones);
          setStats(data.data.stats);
          setPagination(data.data.pagination);
        }
      } catch {
        console.error("Error fetching marcaciones");
      } finally {
        setLoading(false);
      }
    },
    [installationId, desde, hasta]
  );

  useEffect(() => {
    fetchMarcaciones(1);
  }, [fetchMarcaciones]);

  // Filtrar por texto (nombre, rut) del lado del cliente
  const filtered = searchText
    ? marcaciones.filter(
        (m) =>
          m.guardia.nombre.toLowerCase().includes(searchText.toLowerCase()) ||
          m.guardia.rut?.includes(searchText) ||
          m.installation.nombre.toLowerCase().includes(searchText.toLowerCase())
      )
    : marcaciones;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

  const formatDateTime = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

  const [clients, setClients] = useState(initialClients);
  const [generatingCodeId, setGeneratingCodeId] = useState<string | null>(null);

  // Re-flatten when clients change (after generating code)
  const allInstallationsLive = clients.flatMap((c) =>
    c.installations.map((i) => ({ ...i, clientName: c.name }))
  );

  const installationsWithCode = allInstallationsLive.filter(
    (i) => i.marcacionCode != null && i.marcacionCode.trim() !== ""
  );
  const installationsWithoutCode = allInstallationsLive.filter(
    (i) => !i.marcacionCode || i.marcacionCode.trim() === ""
  );

  const generateCode = async (instId: string) => {
    setGeneratingCodeId(instId);
    try {
      const res = await fetch("/api/ops/marcacion/generar-codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: instId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error generando código");
      // Update local state
      setClients((prev) =>
        prev.map((c) => ({
          ...c,
          installations: c.installations.map((i) =>
            i.id === instId ? { ...i, marcacionCode: data.data.marcacionCode } : i
          ),
        }))
      );
      toast.success(`Código generado: ${data.data.marcacionCode}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error generando código");
    } finally {
      setGeneratingCodeId(null);
    }
  };
  const getMarcacionUrl = (code: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/marcar/${code}`;
    }
    return `/marcar/${code}`;
  };
  const copyMarcacionUrl = (code: string) => {
    const url = getMarcacionUrl(code);
    navigator.clipboard.writeText(url).then(
      () => toast.success("URL copiada al portapapeles"),
      () => toast.error("No se pudo copiar")
    );
  };

  const downloadQr = async (code: string, installationName: string) => {
    const url = getMarcacionUrl(code);
    try {
      // Generar QR como canvas con alto detalle
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, url, {
        width: 800,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });

      // Crear imagen con marco para impresión
      const printCanvas = document.createElement("canvas");
      const ctx = printCanvas.getContext("2d")!;
      const padding = 60;
      const textAreaHeight = 120;
      printCanvas.width = canvas.width + padding * 2;
      printCanvas.height = canvas.height + padding * 2 + textAreaHeight;

      // Fondo blanco
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, printCanvas.width, printCanvas.height);

      // QR centrado
      ctx.drawImage(canvas, padding, padding);

      // Texto debajo del QR
      const textY = canvas.height + padding + 30;
      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      const centerX = printCanvas.width / 2;

      ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("Marcación de Asistencia", centerX, textY);

      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(installationName, centerX, textY + 36);

      ctx.fillStyle = "#64748b";
      ctx.font = "16px monospace";
      ctx.fillText(`Código: ${code}`, centerX, textY + 68);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText("Gard Security — Res. Exenta N°38 DT Chile", centerX, textY + 92);

      // Descargar como PNG
      const dataUrl = printCanvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `QR-Marcacion-${installationName.replace(/\s+/g, "-")}-${code}.png`;
      a.click();

      toast.success("QR descargado");
    } catch (err) {
      console.error("Error generando QR:", err);
      toast.error("No se pudo generar el QR");
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Links de marcación por instalación (contraíble, minimalista) ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setUrlsMarcacionOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
        >
          <span className="text-sm font-semibold flex items-center gap-2">
            {urlsMarcacionOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
            URLs de marcación
            {installationsWithCode.length > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground">
                ({installationsWithCode.length})
              </span>
            )}
          </span>
        </button>
        {urlsMarcacionOpen && (
          <div className="px-4 pb-4 pt-0 border-t border-border/60">
            {installationsWithCode.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {installationsWithCode.map((i) => (
                  <div
                    key={i.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium truncate max-w-[180px]">{i.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      title="Copiar URL de marcación"
                      onClick={() => copyMarcacionUrl(i.marcacionCode!)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      title="Descargar QR para imprimir"
                      onClick={() => void downloadQr(i.marcacionCode!, i.name)}
                    >
                      <QrCode className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {installationsWithoutCode.length > 0 && (
              <div className={installationsWithCode.length > 0 ? "mt-3 pt-3 border-t border-border/60" : ""}>
                <p className="text-xs text-muted-foreground mb-2">
                  Sin código de marcación:
                </p>
                <div className="flex flex-wrap gap-2">
                  {installationsWithoutCode.map((i) => (
                    <Button
                      key={i.id}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={generatingCodeId === i.id}
                      onClick={() => void generateCode(i.id)}
                    >
                      {generatingCodeId === i.id ? "Generando…" : i.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {installationsWithCode.length === 0 && installationsWithoutCode.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay instalaciones activas.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Dashboard resumen ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Marcaciones hoy" value={stats.totalHoy} color="text-blue-400" />
        <StatCard label="Entradas hoy" value={stats.entradasHoy} color="text-emerald-400" />
        <StatCard label="Salidas hoy" value={stats.salidasHoy} color="text-orange-400" />
        <StatCard
          label="Fuera de radio"
          value={stats.fueraRadioHoy}
          color={stats.fueraRadioHoy > 0 ? "text-red-400" : "text-slate-400"}
        />
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </div>

        <div className="flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-[140px]">
          <label className="text-[10px] text-muted-foreground block mb-0.5">Instalación</label>
          <select
            value={installationId}
            onChange={(e) => setInstallationId(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Todas</option>
            {allInstallationsLive.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.clientName})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 sm:flex-none">
          <label className="text-[10px] text-muted-foreground block mb-0.5">Desde</label>
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-8 text-xs w-full sm:w-[130px]"
          />
        </div>

        <div className="flex-1 sm:flex-none">
          <label className="text-[10px] text-muted-foreground block mb-0.5">Hasta</label>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-8 text-xs w-full sm:w-[130px]"
          />
        </div>

        <div className="flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-[140px]">
          <label className="text-[10px] text-muted-foreground block mb-0.5">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nombre, RUT..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Guardia</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Instalación</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha / Hora</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Geo</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Distancia</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hash</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    <Clock className="h-5 w-5 mx-auto mb-2 animate-spin" />
                    Cargando marcaciones...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Sin marcaciones en el período seleccionado
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <Fragment key={m.id}>
                    <tr
                      className="border-b border-border/60 last:border-0 hover:bg-accent/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    >
                      {/* Tipo */}
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            m.tipo === "entrada"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-orange-500/15 text-orange-400"
                          }`}
                        >
                          {m.tipo === "entrada" ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                          {m.tipo === "entrada" ? "Entrada" : "Salida"}
                        </span>
                      </td>

                      {/* Guardia */}
                      <td className="px-3 py-2">
                        <Link
                          href={`/personas/guardias/${m.guardia.id}`}
                          className="text-primary hover:underline font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.guardia.nombre}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">{m.guardia.rut}</p>
                      </td>

                      {/* Instalación */}
                      <td className="px-3 py-2">
                        <span className="font-medium">{m.installation.nombre}</span>
                        {m.puesto && (
                          <p className="text-[10px] text-muted-foreground">
                            {m.puesto.nombre} · {m.puesto.horario}
                          </p>
                        )}
                      </td>

                      {/* Fecha/Hora */}
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {formatDateTime(m.timestamp)}
                      </td>

                      {/* Geo */}
                      <td className="px-3 py-2 text-center">
                        {m.geo.validada ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                        ) : m.geo.distanciaM != null ? (
                          <AlertTriangle className="h-4 w-4 text-red-400 mx-auto" />
                        ) : (
                          <MapPin className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>

                      {/* Distancia */}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.geo.distanciaM != null ? `${m.geo.distanciaM}m` : "—"}
                      </td>

                      {/* Hash */}
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {m.hashIntegridad.slice(0, 12)}...
                      </td>
                    </tr>

                    {/* Fila expandida con detalle completo */}
                    {expandedId === m.id && (
                      <tr className="bg-muted/20">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                            <DetailItem icon={Hash} label="Hash de integridad" value={m.hashIntegridad} mono />
                            <DetailItem
                              icon={MapPin}
                              label="Coordenadas"
                              value={m.geo.lat && m.geo.lng ? `${m.geo.lat}, ${m.geo.lng}` : "Sin GPS"}
                            />
                            <DetailItem
                              icon={MapPin}
                              label="Validación geo"
                              value={
                                m.geo.validada
                                  ? `Dentro del radio (${m.geo.distanciaM}m / ${m.installation.geoRadiusM}m)`
                                  : m.geo.distanciaM != null
                                  ? `FUERA del radio (${m.geo.distanciaM}m / ${m.installation.geoRadiusM}m)`
                                  : "Sin validación"
                              }
                            />
                            <DetailItem icon={Smartphone} label="IP" value={m.ipAddress || "—"} />
                            <DetailItem icon={Smartphone} label="Dispositivo" value={truncateUA(m.userAgent)} />
                            <DetailItem icon={Clock} label="Método" value={m.metodoId === "rut_pin" ? "RUT + PIN" : m.metodoId} />
                            <DetailItem
                              icon={Clock}
                              label="Sello de tiempo (servidor)"
                              value={new Date(m.timestamp).toISOString()}
                              mono
                            />
                            {m.guardia.email && (
                              <DetailItem icon={Clock} label="Email guardia" value={m.guardia.email} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Paginación ── */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {pagination.total} marcaciones · Página {pagination.page} de {pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => fetchMarcaciones(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchMarcaciones(pagination.page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Nota legal ── */}
      <p className="text-[10px] text-muted-foreground/60 border-t border-border pt-3">
        Registro conforme a Resolución Exenta N°38, Dirección del Trabajo, Chile (09/05/2024).
        Cada marcación incluye hash SHA-256 de integridad, sello de tiempo del servidor, y geolocalización validada.
      </p>
    </div>
  );
}

// ─── Sub-componentes ───

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={`text-xs ${mono ? "font-mono break-all" : ""}`}>{value}</p>
    </div>
  );
}

function truncateUA(ua: string | null): string {
  if (!ua) return "—";
  // Extraer info útil del user agent
  const match = ua.match(/(iPhone|Android|Chrome|Safari|Firefox|Edge)[/ ]?(\d+)?/i);
  return match ? match[0] : ua.slice(0, 40) + "...";
}
