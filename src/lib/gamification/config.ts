import { prisma } from "@/lib/prisma";
import type { GamificacionConfig } from "@prisma/client";
import type { NivelDefinition } from "./types";

const configCache = new Map<string, { data: GamificacionConfig; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getGamificacionConfig(tenantId: string): Promise<GamificacionConfig | null> {
  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const config = await prisma.gamificacionConfig.findUnique({
    where: { tenantId },
  });

  if (config) {
    configCache.set(tenantId, { data: config, fetchedAt: Date.now() });
  }

  return config;
}

export function clearConfigCache(tenantId?: string): void {
  if (tenantId) {
    configCache.delete(tenantId);
  } else {
    configCache.clear();
  }
}

export function getNiveles(config: GamificacionConfig): NivelDefinition[] {
  return [
    { nombre: config.nivel1Nombre, puntosMinimos: config.nivel1Puntos },
    { nombre: config.nivel2Nombre, puntosMinimos: config.nivel2Puntos },
    { nombre: config.nivel3Nombre, puntosMinimos: config.nivel3Puntos },
    { nombre: config.nivel4Nombre, puntosMinimos: config.nivel4Puntos },
    { nombre: config.nivel5Nombre, puntosMinimos: config.nivel5Puntos },
  ].sort((a, b) => b.puntosMinimos - a.puntosMinimos);
}

export function getNivelActual(config: GamificacionConfig, puntosAcumulados: number): string {
  const niveles = getNiveles(config);
  for (const nivel of niveles) {
    if (puntosAcumulados >= nivel.puntosMinimos) {
      return nivel.nombre;
    }
  }
  return config.nivel1Nombre;
}

export function getNextNivel(
  config: GamificacionConfig,
  puntosAcumulados: number,
): { nombre: string; puntosRequeridos: number; puntosFaltantes: number } | null {
  const niveles = getNiveles(config).reverse();
  for (const nivel of niveles) {
    if (puntosAcumulados < nivel.puntosMinimos) {
      return {
        nombre: nivel.nombre,
        puntosRequeridos: nivel.puntosMinimos,
        puntosFaltantes: nivel.puntosMinimos - puntosAcumulados,
      };
    }
  }
  return null;
}
