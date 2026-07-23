/**
 * Cliente OpenAI por tenant.
 *
 * Devuelve un cliente OpenAI que usa la API key del PROPIO tenant (configurada
 * en `Configuración › Proveedores de IA`), de modo que el consumo lo pague el
 * tenant y no la plataforma. Si el tenant no tiene una key OpenAI propia, cae
 * al cliente de plataforma (env `OPENAI_API_KEY`) y lo registra — ese es el
 * único caso donde la plataforma sigue costeando (embeddings/whisper/etc. son
 * OpenAI-only; sin key del tenant no hay alternativa sin romper la función).
 *
 * Preserva exactamente la misma interfaz del SDK de OpenAI: sólo cambia de
 * dónde sale la API key. Usar en los features que hoy importan el singleton
 * `@/lib/openai` y necesitan que el costo vaya al tenant.
 */

import OpenAI from "openai";
import { openai as platformOpenAI } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "@/lib/ai-encryption";

const cache = new Map<string, { client: OpenAI | null; ts: number }>();
const TTL = 60 * 1000; // 1 min

export function clearTenantOpenAIClientCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/**
 * Cliente OpenAI del tenant (key propia) o, si no tiene, el de plataforma.
 */
export async function getTenantOpenAIClient(tenantId?: string | null): Promise<OpenAI> {
  if (!tenantId) return platformOpenAI;

  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.ts < TTL) return cached.client ?? platformOpenAI;

  let client: OpenAI | null = null;
  try {
    const provider = await prisma.tenantAiProvider.findFirst({
      where: { tenantId, providerType: "openai", apiKey: { not: null } },
    });
    if (provider?.apiKey) {
      client = new OpenAI({ apiKey: decryptApiKey(provider.apiKey) });
    }
  } catch (err) {
    console.warn("[tenant-openai] Error resolviendo key OpenAI del tenant", tenantId, err);
  }

  if (!client) {
    console.warn(
      `[tenant-openai] tenant ${tenantId} sin OpenAI propio; usando key de plataforma (fase 2b pendiente para este tenant)`,
    );
  }

  cache.set(tenantId, { client, ts: Date.now() });
  return client ?? platformOpenAI;
}
