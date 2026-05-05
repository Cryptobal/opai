"use client";

import { useState, useCallback } from "react";

export interface ResolveTemplateInput {
  slug: string;
  entityId?: string;
  entityType?: "lead" | "deal" | "contact" | "account" | "guardia" | "quote";
  systemTokens?: Record<string, string>;
  phoneOverride?: string;
}

export interface ResolvedTemplate {
  message: string;
  url: string;
  phone: string | null;
}

/**
 * Hook para resolver plantillas WhatsApp desde el cliente.
 *
 * Uso:
 *   const { resolve, loading } = useWaTemplate();
 *   const { url } = await resolve({ slug: "lead_first_contact", entityType: "lead", entityId });
 *   window.open(url, "_blank");
 */
export function useWaTemplate() {
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(async (input: ResolveTemplateInput): Promise<ResolvedTemplate> => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/resolve-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as { success: boolean; data?: ResolvedTemplate; error?: string };
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || "No se pudo resolver la plantilla");
      }
      return data.data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { resolve, loading };
}
