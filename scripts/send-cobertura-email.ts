/**
 * Script para enviar emails de cobertura manualmente.
 * Uso: npx tsx scripts/send-cobertura-email.ts [nocturno|diurno|both]
 *
 * Busca el control nocturno más reciente, construye el snapshot
 * filtrado por turno y envía el email a operaciones@gard.cl.
 * También envía mensaje al chat de Operaciones.
 */

import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";

const prisma = new PrismaClient();

// ─── Types ───

interface CoberturaGuardia {
  nombre: string;
  status: string;
  turno: string;
  horaLlegada: string | null;
  isExtra: boolean;
  notes: string | null;
}

interface CoberturaInstalacion {
  name: string;
  guardiasRequeridos: number;
  coberturaStatus: string;
  guardias: CoberturaGuardia[];
  presentes: number;
  extras: number;
  noViene: { nombre: string; notes: string | null }[];
}

interface CoberturaSnapshot {
  turnoFilter: "nocturno" | "diurno";
  turnoLabel: string;
  instalaciones: CoberturaInstalacion[];
  summary: {
    completas: number;
    parciales: number;
    descubiertas: number;
    pendientes: number;
    total: number;
    totalGuardias: number;
    totalPresentes: number;
    totalNoViene: number;
    totalExtras: number;
  };
}

// ─── Helpers ───

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function statusColor(s: string) { return s === "completa" ? "#15803d" : s === "parcial" ? "#d97706" : s === "descubierta" ? "#dc2626" : "#475569"; }
function statusLabel(s: string) { return s === "completa" ? "Completa" : s === "parcial" ? "Parcial" : s === "descubierta" ? "Descubierta" : "Pendiente"; }
function guardStatusIcon(s: string) { return s === "presente" ? "✅" : s === "reemplazo" ? "🔄" : s === "no_viene" ? "❌" : s === "en_camino" ? "🚗" : "⏳"; }
function guardStatusColor(s: string) { return (s === "presente" || s === "reemplazo") ? "#15803d" : s === "no_viene" ? "#dc2626" : s === "en_camino" ? "#d97706" : "#475569"; }

function calculateCoberturaStatus(req: number, guardias: { status: string }[]): string {
  const p = guardias.filter(g => g.status === "presente" || g.status === "reemplazo").length;
  const nv = guardias.filter(g => g.status === "no_viene").length;
  const pend = guardias.filter(g => g.status === "pendiente" || g.status === "en_camino").length;
  if (p >= req) return "completa";
  if (p > 0 && pend > 0) return "parcial";
  if (nv > 0 && p + pend < req) return "descubierta";
  if (p > 0) return "parcial";
  return "pendiente";
}

function buildSnapshot(instalaciones: any[], turnoFilter: "nocturno" | "diurno"): CoberturaSnapshot {
  const turnoLabel = turnoFilter === "nocturno" ? "Cobertura Nocturna" : "Cobertura Diurna";
  const mapped: CoberturaInstalacion[] = instalaciones.map((inst: any) => {
    const turnoGuardias = inst.guardias.filter((g: any) =>
      turnoFilter === "nocturno" ? g.turno === "nocturno" || !g.turno : g.turno === "diurno",
    );
    const presentes = turnoGuardias.filter((g: any) => g.status === "presente" || g.status === "reemplazo").length;
    const extras = turnoGuardias.filter((g: any) => g.isExtra).length;
    const noViene = turnoGuardias.filter((g: any) => g.status === "no_viene").map((g: any) => ({ nombre: g.guardiaNombre, notes: g.notes }));
    const requeridos = turnoFilter === "nocturno" ? inst.guardiasRequeridos : (turnoGuardias.length || 1);
    const coberturaStatus = calculateCoberturaStatus(requeridos, turnoGuardias);
    return {
      name: inst.installationName, guardiasRequeridos: requeridos, coberturaStatus,
      guardias: turnoGuardias.map((g: any) => ({ nombre: g.guardiaNombre, status: g.status, turno: g.turno, horaLlegada: g.horaLlegada, isExtra: g.isExtra, notes: g.notes })),
      presentes, extras, noViene,
    };
  });
  const withGuards = mapped.filter(i => i.guardias.length > 0);
  return {
    turnoFilter, turnoLabel, instalaciones: withGuards,
    summary: {
      completas: withGuards.filter(i => i.coberturaStatus === "completa").length,
      parciales: withGuards.filter(i => i.coberturaStatus === "parcial").length,
      descubiertas: withGuards.filter(i => i.coberturaStatus === "descubierta").length,
      pendientes: withGuards.filter(i => i.coberturaStatus === "pendiente").length,
      total: withGuards.length,
      totalGuardias: withGuards.reduce((s, i) => s + i.guardias.length, 0),
      totalPresentes: withGuards.reduce((s, i) => s + i.presentes, 0),
      totalNoViene: withGuards.reduce((s, i) => s + i.noViene.length, 0),
      totalExtras: withGuards.reduce((s, i) => s + i.extras, 0),
    },
  };
}

function buildChatSummary(snapshot: CoberturaSnapshot): string {
  const { summary, turnoLabel, instalaciones } = snapshot;
  const lines: string[] = [];
  lines.push(`📊 ${turnoLabel}`);
  lines.push("");
  lines.push(`✅ ${summary.completas} completas · ⚠️ ${summary.parciales} parciales · 🔴 ${summary.descubiertas} descubiertas · ⏳ ${summary.pendientes} pendientes`);
  lines.push(`👥 ${summary.totalPresentes}/${summary.totalGuardias} presentes` +
    (summary.totalExtras > 0 ? ` (${summary.totalExtras} extra${summary.totalExtras !== 1 ? "s" : ""})` : "") +
    (summary.totalNoViene > 0 ? ` · ❌ ${summary.totalNoViene} no viene${summary.totalNoViene !== 1 ? "n" : ""}` : ""));
  const descubiertas = instalaciones.filter(i => i.coberturaStatus === "descubierta");
  if (descubiertas.length > 0) {
    lines.push(""); lines.push("🔴 Puestos descubiertos:");
    for (const inst of descubiertas) {
      const nv = inst.noViene.map(g => `${g.nombre}${g.notes ? ` (${g.notes})` : ""}`).join(", ");
      lines.push(`  • ${inst.name}: ${inst.presentes}/${inst.guardiasRequeridos} — No viene: ${nv || "—"}`);
    }
  }
  return lines.join("\n");
}

function buildHtml(snapshot: CoberturaSnapshot, operatorName: string, turnoStartedAt: Date): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const turnoStart = turnoStartedAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const { summary, turnoLabel } = snapshot;
  const headerBg = snapshot.turnoFilter === "nocturno" ? "#0f172a" : "#1e3a5f";

  const instalacionRows = snapshot.instalaciones.map((inst) => {
    const color = statusColor(inst.coberturaStatus);
    const isDesc = inst.coberturaStatus === "descubierta";
    const bgColor = isDesc ? "#fef2f2" : "#ffffff";
    const borderLeft = isDesc ? "border-left:4px solid #dc2626;" : "";
    const guardLines = inst.guardias.map((g) => {
      const gColor = guardStatusColor(g.status);
      const icon = guardStatusIcon(g.status);
      const arrival = g.horaLlegada ? ` · ${escapeHtml(g.horaLlegada)}` : "";
      const extraBadge = g.isExtra
        ? ' <span style="background:#7c3aed;color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;margin-left:4px">EXTRA</span>'
        : ' <span style="background:#e2e8f0;color:#475569;font-size:9px;padding:1px 4px;border-radius:3px;margin-left:4px">PAUTA</span>';
      const notesStr = g.notes && g.status === "no_viene" ? `<br/><span style="color:#94a3b8;font-size:10px;padding-left:16px">↳ ${escapeHtml(g.notes)}</span>` : "";
      return `<span style="color:${gColor};font-size:11px">${icon} ${escapeHtml(g.nombre)}${extraBadge}${arrival}</span>${notesStr}`;
    }).join("<br/>");
    const noVieneStr = inst.noViene.length > 0
      ? inst.noViene.map(g => {
          const noteStr = g.notes ? `<br/><span style="color:#94a3b8;font-size:10px">↳ ${escapeHtml(g.notes)}</span>` : "";
          return `<span style="color:#dc2626;font-size:11px;font-weight:600">❌ ${escapeHtml(g.nombre)}</span>${noteStr}`;
        }).join("<br/>")
      : '<span style="color:#94a3b8;font-size:11px">—</span>';
    return `<tr style="background:${bgColor}">
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;font-weight:500;${borderLeft}">${escapeHtml(inst.name)}${isDesc ? '<br/><span style="color:#dc2626;font-size:10px;font-weight:700">⚠️ PUESTO DESCUBIERTO</span>' : ""}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:center;font-weight:600"><span style="color:${inst.presentes >= inst.guardiasRequeridos ? "#15803d" : inst.presentes > 0 ? "#d97706" : "#dc2626"}">${inst.presentes}</span>/${inst.guardiasRequeridos}${inst.extras > 0 ? `<br/><span style="font-size:10px;color:#7c3aed">+${inst.extras} extra</span>` : ""}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center"><span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:700;color:#fff;background:${color}">${statusLabel(inst.coberturaStatus)}</span></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${guardLines || '<span style="color:#94a3b8;font-size:11px">—</span>'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${noVieneStr}</td>
    </tr>`;
  }).join("\n");

  const descBanner = summary.descubiertas > 0
    ? `<tr><td style="padding:0 32px 16px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #dc2626;border-radius:6px"><tr><td style="padding:14px 16px;text-align:center"><p style="margin:0;font-size:14px;font-weight:700;color:#dc2626">⚠️ ${summary.descubiertas} instalacion${summary.descubiertas !== 1 ? "es" : ""} con puesto descubierto</p><p style="margin:4px 0 0;font-size:12px;color:#991b1b">${snapshot.instalaciones.filter(i => i.coberturaStatus === "descubierta").map(i => escapeHtml(i.name)).join(" · ")}</p></td></tr></table></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px"><tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:${headerBg};padding:24px 32px"><p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">${escapeHtml(turnoLabel)}</p><p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff">${escapeHtml(dateStr)} · ${timeStr}</p></td></tr>
<tr><td style="padding:20px 32px 16px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0;font-size:13px;color:#64748b;width:140px">Operador</td><td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${escapeHtml(operatorName)}</td></tr><tr><td style="padding:4px 0;font-size:13px;color:#64748b">Inicio turno</td><td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${turnoStart}</td></tr><tr><td style="padding:4px 0;font-size:13px;color:#64748b">Hora reporte</td><td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${timeStr}</td></tr></table></td></tr>
${descBanner}
<tr><td style="padding:0 32px 16px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px"><tr>
<td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%"><p style="margin:0;font-size:22px;font-weight:700;color:#15803d">${summary.completas}</p><p style="margin:2px 0 0;font-size:10px;color:#64748b">Completas</p></td>
<td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%"><p style="margin:0;font-size:22px;font-weight:700;color:#d97706">${summary.parciales}</p><p style="margin:2px 0 0;font-size:10px;color:#64748b">Parciales</p></td>
<td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%"><p style="margin:0;font-size:22px;font-weight:700;color:#dc2626">${summary.descubiertas}</p><p style="margin:2px 0 0;font-size:10px;color:#64748b">Descubiertas</p></td>
<td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%"><p style="margin:0;font-size:22px;font-weight:700;color:#475569">${summary.pendientes}</p><p style="margin:2px 0 0;font-size:10px;color:#64748b">Pendientes</p></td>
<td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:18%"><p style="margin:0;font-size:22px;font-weight:700;color:#1e293b">${summary.totalPresentes}/${summary.totalGuardias}</p><p style="margin:2px 0 0;font-size:10px;color:#64748b">Presentes</p></td>
<td style="padding:12px 12px;text-align:center;width:18%"><p style="margin:0;font-size:22px;font-weight:700;color:#dc2626">${summary.totalNoViene}</p><p style="margin:2px 0 0;font-size:10px;color:#64748b">No vienen</p></td>
</tr></table></td></tr>
<tr><td style="padding:0 32px 24px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
<tr style="background:#f1f5f9"><th style="padding:10px 12px;font-size:11px;color:#475569;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0">Instalación</th><th style="padding:10px 12px;font-size:11px;color:#475569;text-align:center;font-weight:700;border-bottom:2px solid #e2e8f0">Guardias</th><th style="padding:10px 12px;font-size:11px;color:#475569;text-align:center;font-weight:700;border-bottom:2px solid #e2e8f0">Estado</th><th style="padding:10px 12px;font-size:11px;color:#475569;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0">Detalle</th><th style="padding:10px 12px;font-size:11px;color:#475569;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0">No viene</th></tr>
${instalacionRows}
</table></td></tr>
<tr><td style="padding:0 32px 24px" align="center"><a href="https://opai.gard.cl/ops/rondas/monitoreo" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${headerBg};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px">Ver en OPAI</a></td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0"><p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">Sistema OPAI — Snapshot generado automáticamente</p></td></tr>
</table></td></tr></table></body></html>`;
}

// ─── Send chat message to Operaciones ───

async function sendToChatOperaciones(tenantId: string, chatSummary: string, snapshot: CoberturaSnapshot, operatorName: string | null) {
  // Find the Operaciones group channel
  const group = await prisma.adminGroup.findFirst({
    where: { tenantId, slug: "operaciones" },
    select: { id: true },
  });
  if (!group) { console.log("  [Chat] No se encontró grupo 'operaciones'"); return; }

  const channel = await prisma.chatChannel.findFirst({
    where: { tenantId, channelType: "GROUP", groupId: group.id },
    select: { id: true },
  });
  if (!channel) { console.log("  [Chat] No se encontró canal del grupo 'operaciones'"); return; }

  // Create system message
  const message = await prisma.chatMessage.create({
    data: {
      tenantId,
      channelId: channel.id,
      senderType: "SYSTEM",
      senderName: "Sistema OPAI",
      content: chatSummary,
      systemEventType: "cobertura_snapshot",
      systemEventData: {
        turnoFilter: snapshot.turnoFilter,
        summary: snapshot.summary as any,
        operatorName,
      },
    },
  });

  // Update channel metadata
  await prisma.chatChannel.update({
    where: { id: channel.id },
    data: {
      lastMessageAt: message.createdAt,
      lastMessagePreview: chatSummary.slice(0, 100),
      messageCount: { increment: 1 },
    },
  });

  console.log(`  [Chat] Mensaje enviado al canal ${channel.id}`);
}

// ─── Main ───

async function main() {
  const arg = process.argv[2] || "both";
  const filters: ("nocturno" | "diurno")[] =
    arg === "both" ? ["nocturno", "diurno"]
    : arg === "nocturno" ? ["nocturno"]
    : arg === "diurno" ? ["diurno"]
    : ["nocturno", "diurno"];

  // Find most recent turno with controlNocturnoId
  const turno = await prisma.opsMonitoreoTurno.findFirst({
    where: { controlNocturnoId: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, operatorName: true, controlNocturnoId: true, status: true, tenantId: true },
  });

  if (!turno?.controlNocturnoId) { console.error("No se encontró turno con control nocturno"); process.exit(1); }

  console.log(`Turno: ${turno.id} (${turno.status})`);
  console.log(`Operador: ${turno.operatorName}`);
  console.log(`Inicio: ${turno.startedAt}`);

  const cn = await prisma.opsControlNocturno.findUnique({
    where: { id: turno.controlNocturnoId },
    include: { instalaciones: { include: { guardias: { orderBy: { createdAt: "asc" } } }, orderBy: { orderIndex: "asc" } } },
  });

  if (!cn) { console.error("Control nocturno no encontrado"); process.exit(1); }
  console.log(`Instalaciones: ${cn.instalaciones.length}\n`);

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) { console.error("RESEND_API_KEY no configurada"); process.exit(1); }
  const resendClient = new Resend(resendApiKey);

  for (const turnoFilter of filters) {
    console.log(`\n═══ ${turnoFilter.toUpperCase()} ═══`);
    const snapshot = buildSnapshot(cn.instalaciones, turnoFilter);

    if (snapshot.instalaciones.length === 0) {
      console.log(`  No hay guardias ${turnoFilter}s registrados — omitido`);
      continue;
    }

    console.log(`  Instalaciones: ${snapshot.summary.total}`);
    console.log(`  Completas: ${snapshot.summary.completas} | Parciales: ${snapshot.summary.parciales} | Descubiertas: ${snapshot.summary.descubiertas} | Pendientes: ${snapshot.summary.pendientes}`);
    console.log(`  Guardias: ${snapshot.summary.totalPresentes}/${snapshot.summary.totalGuardias} presentes, ${snapshot.summary.totalNoViene} no vienen, ${snapshot.summary.totalExtras} extras`);

    const html = buildHtml(snapshot, turno.operatorName ?? "Operador", turno.startedAt);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const turnoLabel = turnoFilter === "nocturno" ? "Nocturna" : "Diurna";

    console.log(`  Enviando email...`);
    const response = await resendClient.emails.send({
      from: "OPAI <opai@gard.cl>",
      to: "operaciones@gard.cl",
      subject: `Cobertura ${turnoLabel} ${timeStr} - Monitoreo`,
      html,
      tags: [{ name: "type", value: "cobertura_snapshot" }],
    });

    if (response.error) {
      console.error("  Error de Resend:", response.error);
    } else {
      console.log(`  Email enviado! ID: ${response.data?.id}`);
    }

    // Send to chat
    const chatSummary = buildChatSummary(snapshot);
    console.log(`  Enviando al chat de Operaciones...`);
    await sendToChatOperaciones(turno.tenantId, chatSummary, snapshot, turno.operatorName);

    // Print chat summary for preview
    console.log(`\n  --- Chat preview ---`);
    console.log(chatSummary.split("\n").map(l => `  ${l}`).join("\n"));
    console.log(`  ---`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Listo!");
}

main().catch((err) => { console.error(err); process.exit(1); });
