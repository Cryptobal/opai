"use client";

import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeftRight, Building2, Check, Package, Plus,
  Search, Settings2, ShoppingCart, Smartphone, Truck, UserRoundCheck, Warehouse,
} from "lucide-react";
import {
  PageHero,
  Surface,
  SectionHeader,
  Stat,
  StatGrid,
  Tag,
  StatusDot,
  IconBubble,
  EmptyState,
  Spinner,
  Skeleton,
  MetricBar,
  Toolbar,
  DataTable,
  HeatGrid,
  Avatar,
  type DataTableColumn,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

type Row = { id: string; name: string; qty: number; status: "ok" | "low" | "critical" };

const SAMPLE_ROWS: Row[] = [
  { id: "1", name: "Camisa azul · M", qty: 24, status: "ok" },
  { id: "2", name: "Botín de seguridad · 42", qty: 3, status: "low" },
  { id: "3", name: "Linterna LED", qty: 0, status: "critical" },
  { id: "4", name: "Radio handy · UHF", qty: 12, status: "ok" },
];

export default function PlaygroundPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [search, setSearch] = useState("");

  // Toggle <html> class for dark mode preview
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

  const columns: DataTableColumn<Row>[] = [
    { id: "name", header: "Producto", cell: (r) => r.name },
    { id: "qty", header: "Cantidad", align: "right", cell: (r) => r.qty },
    {
      id: "status",
      header: "Estado",
      align: "center",
      cell: (r) =>
        r.status === "ok" ? null : (
          <Tag variant={r.status === "critical" ? "danger" : "warn"} size="sm">
            {r.status === "critical" ? "Agotado" : "Bajo mínimo"}
          </Tag>
        ),
    },
  ];

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <main className="mx-auto max-w-6xl px-4 py-10 space-y-12 ds-page-enter">
        {/* Header playground */}
        <div className="flex items-center justify-between">
          <PageHero
            title="Playground"
            subtitle="catálogo visual oficial"
            description="Cada componente del DS rendereado en light + dark. Esta es la fuente de verdad: si quieres usar un primitive, búscalo aquí primero."
          />
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant={theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
            >
              Light
            </Button>
            <Button
              size="sm"
              variant={theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
            >
              Dark
            </Button>
          </div>
        </div>

        {/* Surfaces */}
        <Section title="Surface — 4 niveles de elevación">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((e) => (
              <Surface key={e} elevation={e as 1 | 2 | 3 | 4} padding="md">
                <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                  elevation {e}
                </p>
                <p className="mt-1 text-sm text-ds-text-1">Lorem ipsum dolor sit amet.</p>
              </Surface>
            ))}
          </div>
        </Section>

        {/* Stats */}
        <Section title="Stat — KPI cards con count-up + variants">
          <StatGrid lgCols={4}>
            <Stat label="Default" value={1247} animate icon={Package} hint="con count-up" />
            <Stat label="Brand" value="$ 12.5M" variant="brand" icon={Warehouse} hint="valor en bodega" />
            <Stat label="OK" value={98} variant="ok" animate icon={Check} hint="confirmadas" />
            <Stat label="Warn" value={5} variant="warn" animate icon={AlertTriangle} hint="bajo mínimo" />
            <Stat label="Danger" value={3} variant="danger" animate icon={AlertTriangle} hint="agotados" />
            <Stat label="Trend up" value={847} animate trend={12} hint="vs mes pasado" />
            <Stat label="Trend down" value={232} animate trend={-8} hint="vs mes pasado" />
            <Stat label="Trend flat" value={500} animate trend={0} hint="estable" />
          </StatGrid>
        </Section>

        {/* IconBubble */}
        <Section title="IconBubble — wrapper para iconos Lucide">
          <Surface elevation={1} padding="md">
            <div className="flex flex-wrap gap-4">
              {(["brand", "neutral", "ok", "warn", "danger", "info"] as const).map((v) => (
                <div key={v} className="flex flex-col items-center gap-2">
                  <IconBubble icon={Package} variant={v} size="md" />
                  <span className="text-[11px] font-mono text-ds-text-4">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              {(["sm", "md", "lg", "xl"] as const).map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <IconBubble icon={Activity} variant="brand" size={s} />
                  <span className="text-[11px] font-mono text-ds-text-4">{s}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <IconBubble icon={UserRoundCheck} variant="ok" size="lg" rounded="circle" />
                <span className="text-[11px] font-mono text-ds-text-4">circle</span>
              </div>
            </div>
          </Surface>
        </Section>

        {/* Tags */}
        <Section title="Tag — pills semánticos">
          <Surface elevation={1} padding="md">
            <div className="flex flex-wrap gap-2">
              <Tag variant="neutral">Neutral</Tag>
              <Tag variant="brand">Brand</Tag>
              <Tag variant="ok">OK</Tag>
              <Tag variant="warn">Warn</Tag>
              <Tag variant="danger">Danger</Tag>
              <Tag variant="info">Info</Tag>
              <Tag variant="ok" dot>Confirmado</Tag>
              <Tag variant="warn" dot>Pendiente</Tag>
              <Tag variant="danger" dot>Agotado</Tag>
              <Tag variant="ok" icon={Check}>Validado</Tag>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tag variant="ok" size="sm">sm</Tag>
              <Tag variant="ok" size="md">md</Tag>
              <Tag variant="ok" size="lg">lg</Tag>
            </div>
          </Surface>
        </Section>

        {/* StatusDot */}
        <Section title="StatusDot — indicadores de estado">
          <Surface elevation={1} padding="md">
            <div className="flex flex-wrap items-center gap-6 text-sm text-ds-text-1">
              <div className="flex items-center gap-2">
                <StatusDot kind="ok" /> OK
              </div>
              <div className="flex items-center gap-2">
                <StatusDot kind="warn" /> Warn
              </div>
              <div className="flex items-center gap-2">
                <StatusDot kind="danger" pulse glow /> Danger pulsante
              </div>
              <div className="flex items-center gap-2">
                <StatusDot kind="info" glow /> Info con halo
              </div>
              <div className="flex items-center gap-2">
                <StatusDot kind="neutral" /> Neutral
              </div>
            </div>
          </Surface>
        </Section>

        {/* MetricBar */}
        <Section title="MetricBar — barras de progreso">
          <Surface elevation={1} padding="md" className="space-y-3">
            <MetricBar value={92} showValue />
            <MetricBar value={68} showValue />
            <MetricBar value={45} showValue />
            <MetricBar value={20} showValue />
            <MetricBar value={88} threshold="ok" showValue size="md" />
          </Surface>
        </Section>

        {/* Toolbar */}
        <Section title="Toolbar — search + filtros + acción">
          <Surface elevation={1} padding="md">
            <Toolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar producto…"
              controls={
                <>
                  <Button size="sm" variant="default" className="h-10 shrink-0">
                    Todos (12)
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 shrink-0 gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Alertas (3)
                  </Button>
                </>
              }
              primaryAction={
                <Button size="sm" className="h-10 gap-2">
                  <Plus className="h-4 w-4" /> Nuevo
                </Button>
              }
            />
          </Surface>
        </Section>

        {/* DataTable */}
        <Section title="DataTable — tabla con row tinting semántico">
          <DataTable
            columns={columns}
            rows={SAMPLE_ROWS}
            rowKey={(r) => r.id}
            rowVariant={(r) =>
              r.status === "critical" ? "danger" : r.status === "low" ? "warn" : "default"
            }
          />
        </Section>

        {/* Avatar */}
        <Section title="Avatar — iniciales con threshold opcional">
          <Surface elevation={1} padding="md">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar initials="JR" />
              <Avatar initials="MC" variant="ok" />
              <Avatar initials="LP" variant="warn" />
              <Avatar initials="AR" variant="danger" />
              <Avatar initials="SG" variant="brand" />
              <Avatar initials="??" variant="neutral" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar initials="JR" size="sm" />
              <Avatar initials="JR" size="md" />
              <Avatar initials="JR" size="lg" />
            </div>
          </Surface>
        </Section>

        {/* HeatGrid */}
        <Section title="HeatGrid — matriz de calor filas × columnas">
          <Surface elevation={1} padding="md">
            <HeatGrid
              rowHeaderLabel="guardia"
              rows={[
                { id: "g1", label: "Juan Pérez" },
                { id: "g2", label: "María C." },
                { id: "g3", label: "Luis Ramírez" },
                { id: "g4", label: "Ana Silva" },
              ]}
              columns={[
                { id: "ing", shortLabel: "ING", fullLabel: "Ingreso" },
                { id: "ron", shortLabel: "RON", fullLabel: "Rondas" },
                { id: "eme", shortLabel: "EME", fullLabel: "Emergencias" },
                { id: "rep", shortLabel: "REP", fullLabel: "Reportes" },
                { id: "com", shortLabel: "COM", fullLabel: "Comunicación" },
              ]}
              getScore={(r, c) => {
                const m: Record<string, Record<string, number | null>> = {
                  g1: { ing: 92, ron: 85, eme: 78, rep: null, com: 88 },
                  g2: { ing: 65, ron: 70, eme: 55, rep: 80, com: 90 },
                  g3: { ing: 45, ron: 50, eme: 40, rep: 60, com: 65 },
                  g4: { ing: 95, ron: 92, eme: null, rep: 88, com: 90 },
                };
                return m[r]?.[c] ?? null;
              }}
            />
          </Surface>
        </Section>

        {/* Surface accent */}
        <Section title="Surface — ahora con prop accent (rail lateral)">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Surface elevation={1} padding="md" accent="ok">
              <p className="text-sm text-ds-text-1">accent ok</p>
            </Surface>
            <Surface elevation={1} padding="md" accent="warn">
              <p className="text-sm text-ds-text-1">accent warn</p>
            </Surface>
            <Surface elevation={1} padding="md" accent="danger">
              <p className="text-sm text-ds-text-1">accent danger</p>
            </Surface>
            <Surface elevation={1} padding="md" accent="brand">
              <p className="text-sm text-ds-text-1">accent brand</p>
            </Surface>
          </div>
        </Section>

        {/* EmptyState */}
        <Section title="EmptyState — estados vacíos">
          <div className="grid gap-4 sm:grid-cols-2">
            <Surface elevation={1} padding="none">
              <EmptyState
                icon={Package}
                title="Sin resultados"
                description="No encontramos productos con esos filtros."
                tone="neutral"
              />
            </Surface>
            <Surface elevation={1} padding="none">
              <EmptyState
                icon={Truck}
                title="Aún no hay entregas"
                description="Crea tu primera entrega para empezar a ver el historial."
                tone="brand"
                action={
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" /> Nueva entrega
                  </Button>
                }
              />
            </Surface>
          </div>
        </Section>

        {/* Spinner + Skeleton */}
        <Section title="Spinner + Skeleton — loading states">
          <div className="grid gap-4 sm:grid-cols-2">
            <Surface elevation={1} padding="md">
              <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-3">
                Spinner
              </p>
              <div className="flex items-center gap-6">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
                <Spinner label="Cargando…" />
              </div>
            </Surface>
            <Surface elevation={1} padding="md">
              <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-3">
                Skeleton
              </p>
              <div className="space-y-2">
                <Skeleton shape="text" className="w-3/4" />
                <Skeleton shape="text" className="w-1/2" />
                <Skeleton shape="rect" className="h-16 w-full" />
                <Skeleton shape="circle" className="h-10 w-10" />
              </div>
            </Surface>
          </div>
        </Section>

        {/* SectionHeader */}
        <Section title="SectionHeader — encabezados internos">
          <Surface elevation={1} padding="md">
            <SectionHeader
              eyebrow="Sección"
              title="Movimientos recientes"
              hint="Últimas 5 acciones del módulo"
              actions={
                <Button size="sm" variant="ghost" className="h-9">
                  Ver todas
                </Button>
              }
            />
          </Surface>
        </Section>

        {/* Footer */}
        <Surface elevation={1} padding="md" className="text-center">
          <p className="text-[12px] font-mono text-ds-text-4">
            OPAI DS v3 — para reportar drift o proponer un primitive nuevo, abrir issue en GitHub.
          </p>
        </Surface>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold tracking-tight text-ds-text-1">
        {title}
      </h2>
      {children}
    </section>
  );
}
