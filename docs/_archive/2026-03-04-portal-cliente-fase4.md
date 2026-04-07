# Portal Cliente — Fase 4: Inteligencia

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Monthly reports PDF, comparative view, surveys, PWA service worker, audit log view

**Architecture:** Reports generated with @react-pdf/renderer via cron. Comparativa aggregates data across installations. PWA manifest already exists - just needs service worker registration.

**Tech Stack:** Next.js 15, Prisma, @react-pdf/renderer, Recharts (already installed), Tailwind + shadcn

---

## Task 1: Reportes API

**Files to create:**
- `src/app/api/portal/cliente/reportes/route.ts`
- `src/app/api/portal/cliente/reportes/[id]/download/route.ts`

### `src/app/api/portal/cliente/reportes/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateClienteSession } from "@/lib/portal/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await validateClienteSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installationId");

  const where: Record<string, unknown> = {
    accountId: session.accountId,
    tenantId: session.tenantId,
  };
  if (installationId) {
    where.installationId = installationId;
  }

  const reportes = await prisma.portalClienteReporte.findMany({
    where,
    orderBy: { period: "desc" },
    select: {
      id: true,
      installationId: true,
      period: true,
      pdfUrl: true,
      generatedAt: true,
      sentAt: true,
      data: true,
    },
  });

  return NextResponse.json({ reportes });
}
```

### `src/app/api/portal/cliente/reportes/[id]/download/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateClienteSession } from "@/lib/portal/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await validateClienteSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reporte = await prisma.portalClienteReporte.findFirst({
    where: {
      id: params.id,
      accountId: session.accountId,
      tenantId: session.tenantId,
    },
    select: { pdfUrl: true },
  });

  if (!reporte || !reporte.pdfUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(reporte.pdfUrl);
}
```

**Commit:**
```bash
git add src/app/api/portal/cliente/reportes/
git commit -m "feat(portal-cliente): add reportes list and download API endpoints"
```

---

## Task 2: Reportes Cron + PDF Generation

**Files to create:**
- `src/app/api/cron/portal-reportes/route.ts`
- `src/lib/portal/report-pdf.tsx`

### `src/lib/portal/report-pdf.tsx`

```tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    padding: 40,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#1a56db",
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1a56db",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 2,
  },
  periodLabel: {
    fontSize: 11,
    color: "#6b7280",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 24,
  },
  kpiCard: {
    width: "47%",
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  kpiLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
  },
  kpiUnit: {
    fontSize: 12,
    color: "#6b7280",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 9,
    color: "#9ca3af",
    textAlign: "center",
  },
});

interface ReporteData {
  rondasTotal: number;
  rondasCompletadas: number;
  rondasCumplimiento: number;
  asistenciaPromedio: number;
  ticketsTotal: number;
  alertasTotal: number;
}

interface ReportePDFProps {
  data: ReporteData;
  period: string; // e.g. '2026-02'
  installationName: string;
  accountName: string;
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

export function ReportePDF({
  data,
  period,
  installationName,
  accountName,
}: ReportePDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Servicio</Text>
          <Text style={styles.subtitle}>{accountName}</Text>
          <Text style={styles.subtitle}>{installationName}</Text>
          <Text style={styles.periodLabel}>
            Período: {formatPeriod(period)}
          </Text>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Cumplimiento de Rondas</Text>
            <Text style={styles.kpiValue}>
              {data.rondasCumplimiento}
              <Text style={styles.kpiUnit}>%</Text>
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Asistencia Promedio</Text>
            <Text style={styles.kpiValue}>
              {data.asistenciaPromedio}
              <Text style={styles.kpiUnit}>%</Text>
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Tickets Generados</Text>
            <Text style={styles.kpiValue}>{data.ticketsTotal}</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Alertas Registradas</Text>
            <Text style={styles.kpiValue}>{data.alertasTotal}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado automáticamente por Gard — {new Date().toLocaleDateString("es-CL")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
```

### `src/app/api/cron/portal-reportes/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportePDF } from "@/lib/portal/report-pdf";
import { uploadToR2 } from "@/lib/r2"; // use existing R2 client pattern
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getPreviousMonthPeriod(): string {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = getPreviousMonthPeriod();
  const [yearStr, monthStr] = period.split("-");
  const periodStart = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const periodEnd = new Date(Number(yearStr), Number(monthStr), 1);

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Find all tenants with portal reportes enabled
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    // Find accounts with reportes enabled in portalConfig
    const accounts = await prisma.crmAccount.findMany({
      where: {
        tenantId: tenant.id,
        portalConfig: { path: ["reportes"], equals: true },
      },
      select: { id: true, name: true },
    });

    for (const account of accounts) {
      const installations = await prisma.crmInstallation.findMany({
        where: {
          tenantId: tenant.id,
          accountId: account.id,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      for (const installation of installations) {
        try {
          // Skip if already generated
          const existing = await prisma.portalClienteReporte.findFirst({
            where: {
              tenantId: tenant.id,
              installationId: installation.id,
              period,
            },
          });
          if (existing) {
            skipped++;
            continue;
          }

          // Gather KPIs
          const [rondas, asistencias, tickets, alertas] = await Promise.all([
            prisma.opsRondaEjecucion.findMany({
              where: {
                tenantId: tenant.id,
                installationId: installation.id,
                fechaInicio: { gte: periodStart, lt: periodEnd },
              },
              select: { estado: true },
            }),
            prisma.opsAsistenciaDiaria.findMany({
              where: {
                tenantId: tenant.id,
                installationId: installation.id,
                fecha: { gte: periodStart, lt: periodEnd },
              },
              select: { attendanceStatus: true },
            }),
            prisma.opsTicket.count({
              where: {
                tenantId: tenant.id,
                installationId: installation.id,
                createdAt: { gte: periodStart, lt: periodEnd },
              },
            }),
            prisma.opsAlertaRonda.count({
              where: {
                tenantId: tenant.id,
                installationId: installation.id,
                createdAt: { gte: periodStart, lt: periodEnd },
              },
            }),
          ]);

          const rondasTotal = rondas.length;
          const rondasCompletadas = rondas.filter(
            (r) => r.estado === "completada"
          ).length;
          const rondasCumplimiento =
            rondasTotal > 0
              ? Math.round((rondasCompletadas / rondasTotal) * 100)
              : 0;

          const asistenciaTotal = asistencias.length;
          const asistenciaPresente = asistencias.filter(
            (a) => a.attendanceStatus === "presente"
          ).length;
          const asistenciaPromedio =
            asistenciaTotal > 0
              ? Math.round((asistenciaPresente / asistenciaTotal) * 100)
              : 0;

          const reporteData = {
            rondasTotal,
            rondasCompletadas,
            rondasCumplimiento,
            asistenciaPromedio,
            ticketsTotal: tickets,
            alertasTotal: alertas,
          };

          // Generate PDF
          const pdfBuffer = await renderToBuffer(
            React.createElement(ReportePDF, {
              data: reporteData,
              period,
              installationName: installation.name,
              accountName: account.name,
            })
          );

          // Upload to R2
          const key = `reportes/${tenant.id}/${installation.id}/${period}.pdf`;
          const pdfUrl = await uploadToR2(pdfBuffer, key, "application/pdf");

          // Create record
          await prisma.portalClienteReporte.create({
            data: {
              tenantId: tenant.id,
              accountId: account.id,
              installationId: installation.id,
              period,
              pdfUrl,
              generatedAt: new Date(),
              data: reporteData,
            },
          });

          processed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(
            `${tenant.id}/${installation.id}: ${msg}`
          );
        }
      }
    }
  }

  return NextResponse.json({ processed, skipped, errors });
}
```

**Commit:**
```bash
git add src/app/api/cron/portal-reportes/ src/lib/portal/report-pdf.tsx
git commit -m "feat(portal-cliente): add monthly report cron with PDF generation via react-pdf"
```

---

## Task 3: Reportes UI

**Files to create:**
- `src/components/portal/cliente/PortalReportes.tsx`

**Files to modify:**
- `src/app/portal/cliente/PortalClienteClient.tsx` — wire up 'reportes' section

### `src/components/portal/cliente/PortalReportes.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { FileText, Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PortalClienteSession } from "@/lib/portal/session";

interface Reporte {
  id: string;
  installationId: string;
  period: string; // '2026-02'
  pdfUrl: string | null;
  generatedAt: string | null;
  sentAt: string | null;
  data: Record<string, unknown> | null;
}

interface ReportesByInstallation {
  installationId: string;
  installationName: string;
  reportes: Reporte[];
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function capitalizeFirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

interface Props {
  session: PortalClienteSession;
}

export function PortalReportes({ session }: Props) {
  const [groups, setGroups] = useState<ReportesByInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/cliente/reportes")
      .then((r) => r.json())
      .then((data) => {
        // Group by installation
        const map = new Map<string, Reporte[]>();
        for (const r of data.reportes ?? []) {
          if (!map.has(r.installationId)) map.set(r.installationId, []);
          map.get(r.installationId)!.push(r);
        }

        const installationMap = new Map(
          session.installations.map((i) => [i.id, i.name])
        );

        const grouped: ReportesByInstallation[] = [];
        for (const [installationId, reportes] of map.entries()) {
          grouped.push({
            installationId,
            installationName:
              installationMap.get(installationId) ?? installationId,
            reportes,
          });
        }
        setGroups(grouped);
      })
      .finally(() => setLoading(false));
  }, [session.installations]);

  async function handleDownload(reporteId: string) {
    setDownloading(reporteId);
    try {
      const res = await fetch(
        `/api/portal/cliente/reportes/${reporteId}/download`,
        { redirect: "follow" }
      );
      if (res.ok || res.redirected) {
        window.open(res.url, "_blank");
      }
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Cargando reportes...
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <FileText className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">
          Los reportes se generan automáticamente el 1 de cada mes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.installationId}>
          {session.installations.length > 1 && (
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              {group.installationName}
            </h3>
          )}
          <div className="space-y-2">
            {group.reportes.map((reporte) => (
              <Card key={reporte.id} className="border-0 shadow-sm">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-blue-50 p-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {capitalizeFirst(formatPeriod(reporte.period))}
                      </p>
                      {reporte.generatedAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Generado el{" "}
                          {new Date(reporte.generatedAt).toLocaleDateString(
                            "es-CL"
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {reporte.sentAt && (
                      <Badge variant="secondary" className="text-xs">
                        Enviado
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!reporte.pdfUrl || downloading === reporte.id}
                      onClick={() => handleDownload(reporte.id)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {downloading === reporte.id ? "..." : "Descargar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Wire up in `PortalClienteClient.tsx`:**

In the `renderSection` function, add:
```typescript
case "reportes":
  return <PortalReportes session={session} />;
```

Import at top:
```typescript
import { PortalReportes } from "@/components/portal/cliente/PortalReportes";
```

**Commit:**
```bash
git add src/components/portal/cliente/PortalReportes.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): add reportes UI with per-installation grouping and PDF download"
```

---

## Task 4: Vista Comparativa API + UI

**Files to create:**
- `src/app/api/portal/cliente/comparativa/route.ts`
- `src/components/portal/cliente/PortalComparativa.tsx`

### `src/app/api/portal/cliente/comparativa/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateClienteSession } from "@/lib/portal/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Metric = "rondas_cumplimiento" | "tickets" | "asistencia";

export async function GET(request: NextRequest) {
  const session = await validateClienteSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const metric = (searchParams.get("metric") ?? "rondas_cumplimiento") as Metric;
  const from = searchParams.get("from")
    ? new Date(searchParams.get("from")!)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();

  const installations = await prisma.crmInstallation.findMany({
    where: {
      tenantId: session.tenantId,
      accountId: session.accountId,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  const results = await Promise.all(
    installations.map(async (inst) => {
      let value = 0;

      if (metric === "rondas_cumplimiento") {
        const rondas = await prisma.opsRondaEjecucion.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: inst.id,
            fechaInicio: { gte: from, lt: to },
          },
          select: { estado: true },
        });
        const total = rondas.length;
        const completadas = rondas.filter((r) => r.estado === "completada").length;
        value = total > 0 ? Math.round((completadas / total) * 100) : 0;
      } else if (metric === "tickets") {
        value = await prisma.opsTicket.count({
          where: {
            tenantId: session.tenantId,
            installationId: inst.id,
            createdAt: { gte: from, lt: to },
          },
        });
      } else if (metric === "asistencia") {
        const asistencias = await prisma.opsAsistenciaDiaria.findMany({
          where: {
            tenantId: session.tenantId,
            installationId: inst.id,
            fecha: { gte: from, lt: to },
          },
          select: { attendanceStatus: true },
        });
        const total = asistencias.length;
        const presentes = asistencias.filter(
          (a) => a.attendanceStatus === "presente"
        ).length;
        value = total > 0 ? Math.round((presentes / total) * 100) : 0;
      }

      return { installationId: inst.id, installationName: inst.name, value };
    })
  );

  // Sort by value desc and add rank
  const sorted = [...results].sort((a, b) => b.value - a.value);
  const ranked = sorted.map((item, idx) => ({ ...item, rank: idx + 1 }));

  return NextResponse.json({ metric, from, to, installations: ranked });
}
```

### `src/components/portal/cliente/PortalComparativa.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp } from "lucide-react";
import type { PortalClienteSession } from "@/lib/portal/session";

type Metric = "rondas_cumplimiento" | "tickets" | "asistencia";

interface InstallationResult {
  installationId: string;
  installationName: string;
  value: number;
  rank: number;
}

const METRIC_LABELS: Record<Metric, string> = {
  rondas_cumplimiento: "Cumplimiento de Rondas (%)",
  tickets: "Tickets Generados",
  asistencia: "Asistencia (%)",
};

const COLORS = ["#1a56db", "#3b82f6", "#93c5fd", "#bfdbfe"];

interface Props {
  session: PortalClienteSession;
}

export function PortalComparativa({ session }: Props) {
  const [metric, setMetric] = useState<Metric>("rondas_cumplimiento");
  const [data, setData] = useState<InstallationResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session.installations.length < 2) return;
    setLoading(true);
    fetch(`/api/portal/cliente/comparativa?metric=${metric}`)
      .then((r) => r.json())
      .then((res) => setData(res.installations ?? []))
      .finally(() => setLoading(false));
  }, [metric, session.installations.length]);

  if (session.installations.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <TrendingUp className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">
          La vista comparativa requiere al menos 2 instalaciones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Comparativa por Instalación</h2>
        <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rondas_cumplimiento">
              Cumplimiento de Rondas
            </SelectItem>
            <SelectItem value="tickets">Tickets</SelectItem>
            <SelectItem value="asistencia">Asistencia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          {loading ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Cargando...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="installationName"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={
                    metric !== "tickets" ? [0, 100] : undefined
                  }
                />
                <Tooltip
                  formatter={(value: number) =>
                    metric !== "tickets" ? `${value}%` : value
                  }
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={COLORS[idx % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Ranking — {METRIC_LABELS[metric]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.map((item) => (
              <div
                key={item.installationId}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={item.rank === 1 ? "default" : "secondary"}
                    className="w-7 h-7 rounded-full flex items-center justify-center p-0 text-xs"
                  >
                    {item.rank}
                  </Badge>
                  <span className="text-sm">{item.installationName}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {metric !== "tickets" ? `${item.value}%` : item.value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Wire up in `PortalClienteClient.tsx`:**

```typescript
case "comparativa":
  return <PortalComparativa session={session} />;
```

Import:
```typescript
import { PortalComparativa } from "@/components/portal/cliente/PortalComparativa";
```

**Commit:**
```bash
git add src/app/api/portal/cliente/comparativa/ src/components/portal/cliente/PortalComparativa.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): add comparativa API and multi-installation bar chart UI"
```

---

## Task 5: Encuestas API + UI

**Files to create:**
- `src/app/api/portal/cliente/encuestas/route.ts`
- `src/components/portal/cliente/PortalEncuestas.tsx`

**Files to modify:**
- `PortalClienteNav.tsx` — add 'encuestas' to PortalSection type if not present
- `PortalClienteClient.tsx` — wire up 'encuestas'

### `src/app/api/portal/cliente/encuestas/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateClienteSession } from "@/lib/portal/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await validateClienteSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const installationIds = session.installations.map((i) => i.id);

  // Query by accountId if available, fallback to installationIds
  const encuestas = await prisma.opsEncuestaCliente.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [
        { accountId: session.accountId },
        { installationId: { in: installationIds } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      installationId: true,
      contactName: true,
      serviceQuality: true,
      scheduleCompliance: true,
      personalPresentation: true,
      professionalism: true,
      supervisionPresence: true,
      incidentResponse: true,
      npsScore: true,
      additionalComments: true,
      averageScore: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ encuestas });
}
```

### `src/components/portal/cliente/PortalEncuestas.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Star, ClipboardList, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PortalClienteSession } from "@/lib/portal/session";

interface Encuesta {
  id: string;
  installationId: string | null;
  contactName: string | null;
  serviceQuality: number | null;
  scheduleCompliance: number | null;
  personalPresentation: number | null;
  professionalism: number | null;
  supervisionPresence: number | null;
  incidentResponse: number | null;
  npsScore: number | null;
  additionalComments: string | null;
  averageScore: number | null;
  createdAt: string;
}

function StarRating({ score }: { score: number | null }) {
  if (score == null) return null;
  const rounded = Math.round(score);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= rounded
              ? "fill-yellow-400 text-yellow-400"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

function NpsLabel({ score }: { score: number | null }) {
  if (score == null) return null;
  const label =
    score >= 9 ? "Promotor" : score >= 7 ? "Neutral" : "Detractor";
  const variant =
    score >= 9
      ? "default"
      : score >= 7
      ? "secondary"
      : "destructive";
  return <Badge variant={variant} className="text-xs">{label} ({score})</Badge>;
}

interface Props {
  session: PortalClienteSession;
}

export function PortalEncuestas({ session }: Props) {
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);

  const installationMap = new Map(
    session.installations.map((i) => [i.id, i.name])
  );

  useEffect(() => {
    fetch("/api/portal/cliente/encuestas")
      .then((r) => r.json())
      .then((data) => setEncuestas(data.encuestas ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Cargando encuestas...
      </div>
    );
  }

  if (encuestas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">
          Las encuestas aparecerán aquí cuando un supervisor visite tu
          instalación.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {encuestas.map((enc) => (
        <Card key={enc.id} className="border-0 shadow-sm">
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {enc.contactName ?? "Supervisor Gard"}
                </p>
                {enc.installationId && session.installations.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {installationMap.get(enc.installationId) ??
                      enc.installationId}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(enc.createdAt).toLocaleDateString("es-CL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StarRating score={enc.averageScore} />
                <NpsLabel score={enc.npsScore} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                ["Calidad del servicio", enc.serviceQuality],
                ["Cumplimiento horario", enc.scheduleCompliance],
                ["Presentación personal", enc.personalPresentation],
                ["Profesionalismo", enc.professionalism],
                ["Presencia supervisión", enc.supervisionPresence],
                ["Respuesta incidentes", enc.incidentResponse],
              ]
                .filter(([, v]) => v != null)
                .map(([label, val]) => (
                  <div
                    key={label as string}
                    className="flex items-center justify-between bg-muted/40 rounded px-2 py-1"
                  >
                    <span className="text-muted-foreground">{label as string}</span>
                    <span className="font-medium">{val as number}/5</span>
                  </div>
                ))}
            </div>

            {enc.additionalComments && (
              <div className="flex gap-2 bg-blue-50 rounded-md p-2.5">
                <MessageSquare className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800">{enc.additionalComments}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Modify `PortalClienteNav.tsx`** — ensure 'encuestas' is in the PortalSection union type. Look for the type definition and add if missing:

```typescript
export type PortalSection =
  | "inicio"
  | "rondas"
  | "asistencia"
  | "tickets"
  | "documentos"
  | "encuestas"    // add this if not present
  | "reportes"     // add this if not present
  | "comparativa"; // add this if not present
```

Also add the nav item for 'encuestas' in the nav items array:
```typescript
{ id: "encuestas", label: "Encuestas", icon: ClipboardList },
```

**Wire up in `PortalClienteClient.tsx`:**

```typescript
case "encuestas":
  return <PortalEncuestas session={session} />;
```

Import:
```typescript
import { PortalEncuestas } from "@/components/portal/cliente/PortalEncuestas";
```

**Commit:**
```bash
git add src/app/api/portal/cliente/encuestas/ src/components/portal/cliente/PortalEncuestas.tsx
git commit -m "feat(portal-cliente): add encuestas API and satisfaction survey UI"
```

---

## Task 6: PWA Service Worker

> NOTE: `public/manifest-cliente.json` already exists with correct `name`, `start_url`, and `theme_color`. The portal layout already references it via `manifest: "/manifest-cliente.json"` metadata and includes `appleWebApp` config and apple icons. Only the service worker and its registration are needed.

**Files to create:**
- `public/sw-cliente.js`
- `src/components/portal/cliente/PwaRegistrar.tsx`

**Files to modify:**
- `src/app/portal/cliente/layout.tsx` — add `<PwaRegistrar />`

### `public/sw-cliente.js`

```javascript
const CACHE_NAME = 'portal-cliente-v1';
const STATIC_CACHE = ['/portal/cliente', '/iconos_azul/icon-192x192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network first for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  // Cache first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

### `src/components/portal/cliente/PwaRegistrar.tsx`

```typescript
'use client';

import { useEffect } from 'react';

export function PwaRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-cliente.js')
        .catch(console.error);
    }
  }, []);
  return null;
}
```

### Modification to `src/app/portal/cliente/layout.tsx`

Add dynamic import at top (after existing imports):
```typescript
import dynamic from 'next/dynamic';

const PwaRegistrar = dynamic(
  () => import('@/components/portal/cliente/PwaRegistrar').then((m) => m.PwaRegistrar),
  { ssr: false }
);
```

Add in the layout JSX (inside the body/return):
```tsx
<PwaRegistrar />
```

**Commit:**
```bash
git add public/sw-cliente.js src/components/portal/cliente/PwaRegistrar.tsx src/app/portal/cliente/layout.tsx
git commit -m "feat(portal-cliente): register PWA service worker for offline support"
```

---

## Task 7: Audit Log + Wire Up Remaining Nav Items

**Files to create:**
- `src/app/api/portal/cliente/audit/route.ts`

**Files to modify:**
- `src/app/portal/cliente/PortalClienteClient.tsx` — wire up all remaining sections
- `src/components/portal/cliente/PortalClienteNav.tsx` — finalize section type + nav items

### `src/app/api/portal/cliente/audit/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth"; // existing Gard admin auth
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const accountId = searchParams.get("accountId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const where: Record<string, unknown> = { tenantId: auth.tenantId };
  if (contactId) where.contactId = contactId;
  if (accountId) where.accountId = accountId;

  const logs = await prisma.portalClienteAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      contactId: true,
      accountId: true,
      action: true,
      metadata: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ logs });
}
```

### Final wire-up in `PortalClienteClient.tsx`

Ensure `renderSection` contains all cases:

```typescript
function renderSection(section: PortalSection) {
  switch (section) {
    case "inicio":
      return <PortalInicio session={session} />;
    case "rondas":
      return <PortalRondas session={session} />;
    case "asistencia":
      return <PortalAsistencia session={session} />;
    case "tickets":
      return <PortalTickets session={session} />;
    case "documentos":
      return <PortalDocumentos session={session} />;
    case "encuestas":
      return <PortalEncuestas session={session} />;
    case "reportes":
      return <PortalReportes session={session} />;
    case "comparativa":
      return <PortalComparativa session={session} />;
    default:
      return null;
  }
}
```

Imports to add:
```typescript
import { PortalEncuestas } from "@/components/portal/cliente/PortalEncuestas";
import { PortalReportes } from "@/components/portal/cliente/PortalReportes";
import { PortalComparativa } from "@/components/portal/cliente/PortalComparativa";
```

### TypeScript check

Run after all changes:
```bash
npx tsc --noEmit 2>&1 | head -60
```

Fix any type errors before committing. Common issues to watch for:
- `PortalSection` type not including new values — update the union type in `PortalClienteNav.tsx`
- Missing `session.installations` on `PortalClienteSession` type — ensure the type includes `installations: { id: string; name: string }[]`
- `renderToBuffer` from `@react-pdf/renderer` — may need `React.createElement` instead of JSX in `.ts` files; keep PDF component in `.tsx`

**Commit:**
```bash
git add src/app/api/portal/cliente/audit/ src/app/portal/cliente/PortalClienteClient.tsx src/components/portal/cliente/PortalClienteNav.tsx
git commit -m "feat(portal-cliente): wire up encuestas/reportes/comparativa sections and add admin audit log API"
```

---

## Summary

| Task | Key Files | Status |
|------|-----------|--------|
| 1. Reportes API | `api/portal/cliente/reportes/route.ts`, `…/[id]/download/route.ts` | pending |
| 2. Cron + PDF | `api/cron/portal-reportes/route.ts`, `lib/portal/report-pdf.tsx` | pending |
| 3. Reportes UI | `components/portal/cliente/PortalReportes.tsx` | pending |
| 4. Comparativa | `api/portal/cliente/comparativa/route.ts`, `PortalComparativa.tsx` | pending |
| 5. Encuestas | `api/portal/cliente/encuestas/route.ts`, `PortalEncuestas.tsx` | pending |
| 6. PWA SW | `public/sw-cliente.js`, `PwaRegistrar.tsx`, layout.tsx | pending |
| 7. Audit + Wire-up | `api/portal/cliente/audit/route.ts`, final TS check | pending |
