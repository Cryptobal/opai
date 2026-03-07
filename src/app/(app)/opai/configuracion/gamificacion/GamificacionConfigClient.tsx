"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/opai/PageHeader";
import { KpiCard } from "@/components/opai/KpiCard";
import { KpiGrid } from "@/components/opai/KpiGrid";
import { DataTable, type DataTableColumn } from "@/components/opai/DataTable";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DIMENSION_CONFIG } from "@/components/gamification/types";
import {
  Settings,
  Award,
  Target,
  DollarSign,
  Gift,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
  Users,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

// ── Tabs ──

const TABS = [
  { id: "config", label: "Configuración", icon: Settings },
  { id: "badges", label: "Badges", icon: Award },
  { id: "desafios", label: "Desafíos", icon: Target },
  { id: "fondos", label: "Fondos", icon: DollarSign },
  { id: "beneficios", label: "Beneficios", icon: Gift },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
];

// ── Dimension keys (only the 5 main dimensions) ──

const MAIN_DIMENSIONS = Object.entries(DIMENSION_CONFIG).filter(
  ([key]) => key !== "social" && key !== "bonus"
);

const PESO_FIELDS: Record<string, string> = {
  rondas: "pesoRondas",
  asistencia: "pesoAsistencia",
  sistema_digital: "pesoSistemaDigital",
  supervision: "pesoSupervision",
  capacitacion: "pesoCapacitacion",
};

// ── Helper for date formatting ──

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatMoney(amount?: number | null): string {
  if (amount == null) return "$0";
  return `$${amount.toLocaleString("es-CL")}`;
}

// ══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════

export function GamificacionConfigClient() {
  const [activeTab, setActiveTab] = useState("config");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Gamificación"
        description="Trust Score, puntos, badges, desafíos, fondos y beneficios"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <ChipTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "config" && <GeneralConfigTab />}
      {activeTab === "badges" && <BadgesManagementTab />}
      {activeTab === "desafios" && <DesafiosManagementTab />}
      {activeTab === "fondos" && <FondosManagementTab />}
      {activeTab === "beneficios" && <BeneficiosManagementTab />}
      {activeTab === "dashboard" && <DashboardTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TAB 1 — General Config
// ══════════════════════════════════════════════════════════

function GeneralConfigTab() {
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/gamification/config")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setConfig(res.data);
        else toast.error("Error al cargar configuración");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/gamification/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        toast.success("Configuración guardada");
      } else {
        toast.error(data.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  if (loading) return <LoadingState type="skeleton" rows={6} />;
  if (!config) return <EmptyState title="No se pudo cargar la configuración" />;

  const pesoSum = MAIN_DIMENSIONS.reduce(
    (sum, [key]) => sum + (Number(config[PESO_FIELDS[key]]) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Kill Switch */}
      <Card className="border-red-500/20">
        <CardHeader>
          <CardTitle className="text-base">Módulo Activo</CardTitle>
          <CardDescription>
            Activa o desactiva el módulo de gamificación para todo el tenant.
            Desactivar no borra datos, pero deja de calcular puntajes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={config.moduloActivo ?? false}
              onCheckedChange={(v) => updateField("moduloActivo", v)}
            />
            <Label className="text-sm">
              {config.moduloActivo ? "Activo" : "Desactivado"}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Pesos por Dimensión */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pesos por Dimensión</CardTitle>
          <CardDescription>
            Define el peso relativo de cada dimensión en el Trust Score. Los pesos
            deben sumar 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MAIN_DIMENSIONS.map(([key, dim]) => (
              <div key={key} className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${dim.bgColor}`}
                />
                <Label className="min-w-[110px] text-sm">{dim.label}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20"
                  value={config[PESO_FIELDS[key]] ?? 0}
                  onChange={(e) =>
                    updateField(PESO_FIELDS[key], parseInt(e.target.value) || 0)
                  }
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
          </div>
          <p
            className={`text-xs ${
              pesoSum === 100 ? "text-muted-foreground" : "text-red-400 font-medium"
            }`}
          >
            Total: {pesoSum}% {pesoSum !== 100 && "(debe sumar 100%)"}
          </p>
        </CardContent>
      </Card>

      {/* Parámetros Generales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parámetros Generales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Tasa conversión (puntos por CLP)</Label>
              <Input
                type="number"
                min={0}
                value={config.puntosPorClp ?? 10}
                onChange={(e) =>
                  updateField("puntosPorClp", parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Máx. puntos diarios</Label>
              <Input
                type="number"
                min={0}
                value={config.maxPuntosDiarios ?? 200}
                onChange={(e) =>
                  updateField("maxPuntosDiarios", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Expiración puntos (meses)</Label>
              <Input
                type="number"
                min={1}
                value={config.expiracionPuntosMeses ?? 12}
                onChange={(e) =>
                  updateField(
                    "expiracionPuntosMeses",
                    parseInt(e.target.value) || 1
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Día reset ranking</Label>
              <Input
                type="text"
                value={config.rankingResetDia ?? "lunes"}
                onChange={(e) => updateField("rankingResetDia", e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={config.bonosHabilitados ?? false}
              onCheckedChange={(v) => updateField("bonosHabilitados", v)}
            />
            <Label className="text-sm">Bonos habilitados</Label>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TAB 2 — Badges Management
// ══════════════════════════════════════════════════════════

function BadgesManagementTab() {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/badges")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setBadges(res.data ?? []);
        else toast.error("Error al cargar badges");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    {
      key: "icono",
      label: "Ícono",
      className: "w-12 text-center",
      render: (v: string) => <span className="text-lg">{v || "🏅"}</span>,
    },
    { key: "nombre", label: "Nombre" },
    { key: "categoria", label: "Categoría" },
    {
      key: "puntosBonus",
      label: "Puntos",
      render: (v: number) => (
        <span className="text-emerald-400 font-medium">+{v ?? 0}</span>
      ),
    },
    {
      key: "secreto",
      label: "Secreto",
      render: (v: boolean) =>
        v ? (
          <span className="text-amber-400 text-xs">Sí</span>
        ) : (
          <span className="text-muted-foreground text-xs">No</span>
        ),
    },
    {
      key: "_actions",
      label: "",
      className: "w-20",
      render: (_: any, row: any) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Badges {!loading && `(${badges.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Badge
        </Button>
      </div>
      <DataTable columns={columns} data={badges} loading={loading} compact />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TAB 3 — Desafíos Management
// ══════════════════════════════════════════════════════════

function DesafiosManagementTab() {
  const [desafios, setDesafios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/desafios")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setDesafios(res.data ?? []);
        else toast.error("Error al cargar desafíos");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "tipo", label: "Tipo" },
    {
      key: "fechaInicio",
      label: "Inicio",
      render: (v: string) => formatDate(v),
    },
    {
      key: "fechaFin",
      label: "Fin",
      render: (v: string) => formatDate(v),
    },
    {
      key: "recompensaPuntos",
      label: "Puntos",
      render: (v: number) => (
        <span className="text-emerald-400 font-medium">+{v ?? 0}</span>
      ),
    },
    {
      key: "_actions",
      label: "",
      className: "w-20",
      render: (_: any, row: any) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Desafíos {!loading && `(${desafios.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Desafío
        </Button>
      </div>
      <DataTable columns={columns} data={desafios} loading={loading} compact />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TAB 4 — Fondos Management
// ══════════════════════════════════════════════════════════

function FondosManagementTab() {
  const [fondos, setFondos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/fondos")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setFondos(res.data ?? []);
        else toast.error("Error al cargar fondos");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "tipo", label: "Tipo" },
    {
      key: "monto",
      label: "Monto",
      render: (v: number) => formatMoney(v),
    },
    {
      key: "fechaInicio",
      label: "Inicio",
      render: (v: string) => formatDate(v),
    },
    {
      key: "fechaFin",
      label: "Fin",
      render: (v: string) => formatDate(v),
    },
    {
      key: "_actions",
      label: "",
      className: "w-20",
      render: (_: any, row: any) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Fondos {!loading && `(${fondos.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Fondo
        </Button>
      </div>
      <DataTable columns={columns} data={fondos} loading={loading} compact />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TAB 5 — Beneficios Management
// ══════════════════════════════════════════════════════════

function BeneficiosManagementTab() {
  const [beneficios, setBeneficios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/beneficios")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setBeneficios(res.data ?? []);
        else toast.error("Error al cargar beneficios");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "categoria", label: "Categoría" },
    {
      key: "costoPuntos",
      label: "Costo",
      render: (v: number) => (
        <span className="font-medium">{v ?? 0} pts</span>
      ),
    },
    { key: "proveedor", label: "Proveedor" },
    {
      key: "disponible",
      label: "Activo",
      className: "w-16 text-center",
      render: (v: boolean) =>
        v ? (
          <Check className="h-4 w-4 text-emerald-400 mx-auto" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground mx-auto" />
        ),
    },
    {
      key: "_actions",
      label: "",
      className: "w-20",
      render: (_: any, row: any) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Beneficios {!loading && `(${beneficios.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Beneficio
        </Button>
      </div>
      <DataTable columns={columns} data={beneficios} loading={loading} compact />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TAB 6 — Dashboard
// ══════════════════════════════════════════════════════════

function DashboardTab() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [totalGuardias, setTotalGuardias] = useState(0);
  const [avgTrustScore, setAvgTrustScore] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [configRes, rankingRes] = await Promise.all([
          fetch("/api/gamification/config").then((r) => r.json()),
          fetch("/api/gamification/rankings/global?limit=10").then((r) => r.json()),
        ]);

        if (!mounted) return;

        if (configRes.success) setConfig(configRes.data);

        if (rankingRes.success && rankingRes.data) {
          const data = rankingRes.data;
          setRanking(data.ranking ?? []);
          setTotalGuardias(data.total ?? 0);

          // Compute average trust score from top results
          const scores = (data.ranking ?? []) as any[];
          if (scores.length > 0) {
            const avg =
              scores.reduce((s: number, r: any) => s + (r.trustScore ?? 0), 0) /
              scores.length;
            setAvgTrustScore(Math.round(avg * 10) / 10);
          }
        }
      } catch {
        toast.error("Error al cargar dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const rankColumns: DataTableColumn[] = [
    {
      key: "posicion",
      label: "#",
      className: "w-12 text-center",
      render: (v: number) => (
        <span className="font-mono text-muted-foreground">{v}</span>
      ),
    },
    { key: "nombre", label: "Guardia" },
    {
      key: "trustScore",
      label: "Trust Score",
      render: (v: number) => (
        <span className="font-semibold font-mono">{v ?? 0}</span>
      ),
    },
    { key: "nivelActual", label: "Nivel" },
    {
      key: "puntosNetos",
      label: "Puntos",
      render: (v: number) => (
        <span className="font-mono">{(v ?? 0).toLocaleString("es-CL")}</span>
      ),
    },
  ];

  if (loading) return <LoadingState type="skeleton" rows={6} />;

  return (
    <div className="space-y-6">
      <KpiGrid columns={4}>
        <KpiCard
          title="Guardias activos"
          value={totalGuardias}
          icon={<Users className="h-4 w-4" />}
          variant="blue"
        />
        <KpiCard
          title="Trust Score promedio"
          value={avgTrustScore || "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="teal"
        />
        <KpiCard
          title="Badges"
          value="—"
          icon={<Trophy className="h-4 w-4" />}
          variant="amber"
          description="Próximamente"
        />
        <KpiCard
          title="Puntos otorgados"
          value="—"
          icon={<Award className="h-4 w-4" />}
          variant="purple"
          description="Próximamente"
        />
      </KpiGrid>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Top 10 Guardias</h2>
        <DataTable
          columns={rankColumns}
          data={ranking}
          loading={false}
          compact
          emptyMessage="No hay datos de ranking disponibles"
        />
      </div>
    </div>
  );
}
