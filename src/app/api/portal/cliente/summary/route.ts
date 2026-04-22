/**
 * GET /api/portal/cliente/summary
 *
 * Métricas del dashboard del portal cliente (PR8).
 *
 * Shape del payload:
 *   - compliance / complianceTrend / completedRounds / totalRounds / trustScore / trustTrend
 *     (compatibilidad con el dashboard previo).
 *   - attentionCount — rondas incompletas + no realizadas del mes (reemplaza
 *     conceptualmente a "alerts" que exponía `OpsAlertaRonda` al cliente).
 *   - missedRounds / incompleteRounds — desglose del total anterior.
 *   - lastRound — última ronda ejecutada (status + fecha + nombre de guardia),
 *     con nombre saneado (`sanitizeGuardName`).
 *   - openTickets — cantidad de tickets del portal cliente abiertos o en curso.
 *   - team — tamaño del equipo activo + conteos de OS-10 (vigente/por_vencer/vencido).
 *
 * Los campos `alerts` / `alertsTrend` se dejaron en 0 para no romper clientes
 * que todavía los lean; conceptualmente fueron reemplazados por
 * `attentionCount`. El cliente NO ve alertas operativas internas (PR2).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalClienteAuth,
  sanitizeGuardName,
} from "@/lib/portal-cliente";
import { computeOs10Estado } from "@/lib/portal-cliente-guardia-doc-estado";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const { tenantId } = session;

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId || !session.installationIds.includes(installationId)) {
      return NextResponse.json(
        { success: false, error: "Sin acceso a esta instalación" },
        { status: 403 }
      );
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      currentRows,
      prevRows,
      lastRound,
      openTickets,
      teamGuardias,
    ] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where: { tenantId, installationId, scheduledAt: { gte: monthStart } },
        select: { status: true, trustScore: true },
      }),
      prisma.opsRondaEjecucion.findMany({
        where: {
          tenantId,
          installationId,
          scheduledAt: { gte: prevMonthStart, lt: monthStart },
        },
        select: { status: true, trustScore: true },
      }),
      prisma.opsRondaEjecucion.findFirst({
        where: {
          tenantId,
          installationId,
          status: { in: ["completada", "incompleta", "no_realizada"] },
        },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          status: true,
          completedAt: true,
          scheduledAt: true,
          porcentajeCompletado: true,
          guardia: {
            select: {
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          installationId,
          source: "portal_cliente",
          status: { in: ["open", "in_progress"] },
        },
      }),
      prisma.opsGuardia.findMany({
        where: {
          tenantId,
          currentInstallationId: installationId,
          status: "active",
        },
        select: { os10: true, os10ExpiresAt: true },
      }),
    ]);

    const curCompleted = currentRows.filter((r) => r.status === "completada").length;
    const curIncomplete = currentRows.filter((r) => r.status === "incompleta").length;
    const curMissed = currentRows.filter((r) => r.status === "no_realizada").length;
    const curTotal = currentRows.length;
    const curCompliance =
      curTotal > 0 ? Math.round((curCompleted / curTotal) * 100) : 0;
    const curScores = currentRows
      .filter((r) => r.trustScore > 0)
      .map((r) => r.trustScore);
    const curTrust =
      curScores.length > 0
        ? Math.round(curScores.reduce((a, b) => a + b, 0) / curScores.length)
        : 0;

    const prevCompleted = prevRows.filter((r) => r.status === "completada").length;
    const prevTotal = prevRows.length;
    const prevCompliance =
      prevTotal > 0 ? Math.round((prevCompleted / prevTotal) * 100) : 0;
    const prevScores = prevRows
      .filter((r) => r.trustScore > 0)
      .map((r) => r.trustScore);
    const prevTrust =
      prevScores.length > 0
        ? Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length)
        : 0;

    const attentionCount = curIncomplete + curMissed;

    // ── Estado del equipo (OS-10) ─────────────────────────────────────
    const team = {
      size: teamGuardias.length,
      os10Vigente: 0,
      os10PorVencer: 0,
      os10Vencido: 0,
    };
    for (const g of teamGuardias) {
      const estado = computeOs10Estado({
        os10: g.os10,
        os10ExpiresAt: g.os10ExpiresAt,
        now,
      });
      if (estado === "vigente" || estado === "no_aplica") team.os10Vigente++;
      else if (estado === "por_vencer") team.os10PorVencer++;
      else team.os10Vencido++; // incluye pendiente / vencido
    }

    // ── Último evento de ronda (para hero de estado) ─────────────────
    let lastRoundPayload: null | {
      id: string;
      status: string;
      timestamp: string;
      guardiaName: string | null;
      porcentaje: number;
    } = null;
    if (lastRound) {
      const ts =
        (lastRound.completedAt ?? lastRound.scheduledAt)?.toISOString() ??
        new Date().toISOString();
      const guardiaName = lastRound.guardia?.persona
        ? sanitizeGuardName(
            lastRound.guardia.persona.firstName,
            lastRound.guardia.persona.lastName
          )
        : null;
      lastRoundPayload = {
        id: lastRound.id,
        status: lastRound.status,
        timestamp: ts,
        guardiaName,
        porcentaje: Math.round(lastRound.porcentajeCompletado ?? 0),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        compliance: curCompliance,
        complianceTrend: curCompliance - prevCompliance,
        completedRounds: curCompleted,
        totalRounds: curTotal,
        trustScore: curTrust,
        trustTrend: curTrust - prevTrust,
        // Campos legacy mantenidos en 0: el cliente no ve alertas operativas (PR2).
        alerts: 0,
        alertsTrend: 0,
        // Nuevos KPIs cliente-friendly (PR8):
        attentionCount,
        missedRounds: curMissed,
        incompleteRounds: curIncomplete,
        lastRound: lastRoundPayload,
        openTickets,
        team,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] summary", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
