"use client";

import { useCallback, useEffect, useState } from "react";

export interface ReplyTemplate {
  id: string;
  name: string;
  body: string; // Plantilla con macros: {{ticket.code}}, {{ticket.title}},
  // {{guardia.nombre}}, {{user.nombre}}, {{installation.name}}.
  scope: "internal" | "email" | "both";
  createdAt: number;
}

const STORAGE_KEY = "opai.tickets.replyTemplates.v1";
const MAX_TEMPLATES = 30;

function readStorage(): ReplyTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

function writeStorage(items: ReplyTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // QuotaExceeded — silente.
  }
}

function isValid(v: unknown): v is ReplyTemplate {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.body === "string" &&
    typeof x.createdAt === "number"
  );
}

export interface RenderContext {
  ticket?: {
    code?: string;
    title?: string;
  } | null;
  guardia?: {
    nombre?: string | null;
  } | null;
  user?: {
    nombre?: string | null;
  } | null;
  installation?: {
    name?: string | null;
  } | null;
}

/**
 * Reemplaza las macros en el body de una plantilla. Las macros sin valor
 * se reemplazan por una cadena vacía. Es deliberadamente permisivo: no
 * tira error si una variable no existe, solo la deja vacía.
 */
export function renderTemplate(body: string, ctx: RenderContext): string {
  return body.replace(/{{\s*([\w.]+)\s*}}/g, (_, path: string) => {
    const segments = path.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = ctx;
    for (const seg of segments) {
      if (cursor == null || typeof cursor !== "object") return "";
      cursor = cursor[seg];
    }
    return cursor == null ? "" : String(cursor);
  });
}

const SEED_TEMPLATES: Array<Omit<ReplyTemplate, "id" | "createdAt">> = [
  {
    name: "Recibido — investigando",
    scope: "both",
    body: "Hola {{guardia.nombre}}, recibimos tu solicitud {{ticket.code}}. Estamos revisando y te avisamos en cuanto tengamos novedades.",
  },
  {
    name: "Cierre estándar",
    scope: "both",
    body: "Cerramos el ticket {{ticket.code}}. Si necesitas algo más, responde aquí mismo.\n\nSaludos,\n{{user.nombre}}",
  },
  {
    name: "Pidiendo más info",
    scope: "internal",
    body: "Para avanzar con {{ticket.code}} necesitamos un poco más de contexto: ¿podrías indicar fecha, hora aproximada y guardia involucrado?",
  },
];

export function useReplyTemplates() {
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);

  useEffect(() => {
    setTemplates(readStorage());
  }, []);

  const seedIfEmpty = useCallback(() => {
    setTemplates((prev) => {
      if (prev.length > 0) return prev;
      const now = Date.now();
      const seeded: ReplyTemplate[] = SEED_TEMPLATES.map((t, i) => ({
        ...t,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `t_${now}_${i}`,
        createdAt: now,
      }));
      writeStorage(seeded);
      return seeded;
    });
  }, []);

  const save = useCallback(
    (
      input: { name: string; body: string; scope?: ReplyTemplate["scope"] },
      replaceId?: string,
    ): ReplyTemplate | null => {
      const name = input.name.trim().slice(0, 60);
      const body = input.body.trim();
      if (!name || !body) return null;
      const newItem: ReplyTemplate = {
        id:
          replaceId ??
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        name,
        body,
        scope: input.scope ?? "both",
        createdAt: Date.now(),
      };
      setTemplates((prev) => {
        const filtered = replaceId
          ? prev.filter((t) => t.id !== replaceId)
          : prev.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
        const next = [newItem, ...filtered].slice(0, MAX_TEMPLATES);
        writeStorage(next);
        return next;
      });
      return newItem;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  return { templates, save, remove, seedIfEmpty };
}
