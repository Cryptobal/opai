import { openai } from "@/lib/openai";
import { webSearchSnippets } from "@/lib/web-search";

function isUsableApiKey(): boolean {
  const k = process.env.OPENAI_API_KEY ?? "";
  return !!k.trim() && !k.includes("placeholder");
}

function snippetsFromBullets(raw: string, maxLines = 16): string[] {
  const lines = raw
    .split(/\n+/)
    .map((l) =>
      l
        .trim()
        .replace(/^[*•\-\u2013]+\s*/, "")
        .trim(),
    )
    .filter((l) => l.length > 12);
  const dedup = [...new Set(lines)];
  return dedup.slice(0, maxLines);
}

function unpackResponsesText(response: unknown): string {
  const loose = response as unknown as {
    output_text?: string | null;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    } | null>;
  };
  const top = loose.output_text?.trim();
  if (top) return top;
  for (const item of loose.output ?? []) {
    if (item?.type !== "message" || !item.content) continue;
    for (const block of item.content) {
      if (block.type === "output_text" && typeof block.text === "string") {
        const t = block.text.trim();
        if (t) return t;
      }
    }
  }
  return "";
}

async function hintsFromResponsesWebSearch(name: string, website: string): Promise<string[]> {
  if (!isUsableApiKey()) return [];
  let hostname = "";
  try {
    hostname = new URL(website).hostname;
  } catch {
    // ignore invalid website (still search by name)
  }

  const userPrompt =
    `Investiga en la web (Chile, contenido público) la empresa conocida como "${name}"` +
    (hostname ? ` asociada al sitio ${hostname}.` : ".") +
    ` Encuentra y lista solo hechos verificables o citas cercanas del texto público sobre: razón social, RUT empresa, representante legal, RUT persona, rubro/industria.` +
    ` Formato obligatorio: máximo 14 líneas, cada línea comienza con "- ", sin introducción ni párrafos extras, sin repetir líneas.` +
    ` Si no encuentras algo, puedes omitir esa línea; no inventes.`;

  const model = process.env.COMPANY_ENRICH_WEBSEARCH_MODEL?.trim() || "gpt-4.1-mini";

  try {
    const response = await openai.responses.create(
      {
        model,
        tool_choice: "required",
        tools: [
          {
            type: "web_search",
            search_context_size: "medium",
            user_location: { type: "approximate", country: "CL" },
          },
        ],
        instructions:
          "Ayudante de diligence comercial Chile. Solo fuentes públicas." +
          " No inventes: si algo no aparece en resultados omitirlo.",
        input: userPrompt,
        max_output_tokens: 700,
      },
      { timeout: 120_000 },
    );

    const text = unpackResponsesText(response);
    return snippetsFromBullets(text);
  } catch (err) {
    console.warn("[company-web-hints] OpenAI Responses web_search falló:", err);
    return [];
  }
}

async function hintsFromTavily(name: string, website: string): Promise<string[]> {
  const hostname = (() => {
    try {
      return new URL(website).hostname;
    } catch {
      return "";
    }
  })();
  const q1 = `${name} Chile RUT representante legal`;
  const q2 = hostname ? `${name} razón social site:${hostname}` : `${name} razón social Chile`;

  const [a, b] = await Promise.all([webSearchSnippets(q1, 6), webSearchSnippets(q2, 6)]);
  const lines: string[] = [];
  const seen = new Set<string>();

  function push(snips: typeof a) {
    for (const s of snips) {
      let line = s.content.trim();
      if (s.title) line = `[${s.title}] ${line}`;
      if (s.url && !line.includes("http")) line = `${line} (${s.url})`;
      const key = line.slice(0, 180).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  push(a);
  push(b);
  return lines.slice(0, 14);
}

function extractHostFromText(raw: string): string | null {
  if (!raw) return null;
  // 1) URL explícita
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>)\]]+/i);
  if (urlMatch?.[0]) {
    try {
      return new URL(urlMatch[0]).hostname.replace(/^www\./i, "");
    } catch {
      /* sigue */
    }
  }
  // 2) Dominio suelto (ej: "enap.cl", "www.empresa.com")
  const hostMatch = raw.match(/\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})\b/i);
  if (hostMatch?.[1]) return hostMatch[1].replace(/^www\./i, "").toLowerCase();
  return null;
}

/**
 * Descubre el dominio oficial de una empresa por búsqueda web real cuando la
 * URL ingresada no resuelve (o no se ingresó ninguna). Devuelve solo el host
 * (ej: "enap.cl") o null. Prueba Responses web_search y luego Tavily.
 */
export async function discoverCompanyWebsite(companyName: string): Promise<string | null> {
  const name = companyName.trim();
  if (!name) return null;

  // 1) OpenAI Responses web_search — pide SOLO el dominio oficial.
  if (isUsableApiKey()) {
    const model = process.env.COMPANY_ENRICH_WEBSEARCH_MODEL?.trim() || "gpt-4.1-mini";
    try {
      const response = await openai.responses.create(
        {
          model,
          tool_choice: "required",
          tools: [
            {
              type: "web_search",
              search_context_size: "low",
              user_location: { type: "approximate", country: "CL" },
            },
          ],
          instructions:
            "Encuentras el sitio web oficial de empresas en Chile. Solo fuentes públicas.",
          input:
            `¿Cuál es el dominio del sitio web oficial de la empresa "${name}" (Chile)?` +
            ` Responde EXCLUSIVAMENTE con el dominio, sin protocolo ni rutas (ej: "empresa.cl").` +
            ` Si no estás seguro, responde "ninguno".`,
          max_output_tokens: 120,
        },
        { timeout: 60_000 },
      );
      const host = extractHostFromText(unpackResponsesText(response));
      if (host) return host;
    } catch (err) {
      console.warn("[company-web-hints] discover dominio (Responses) falló:", err);
    }
  }

  // 2) Tavily — primer resultado con dominio plausible.
  try {
    const snips = await webSearchSnippets(`${name} sitio web oficial Chile`, 6);
    for (const s of snips) {
      const host = extractHostFromText(s.url || "") || extractHostFromText(s.content || "");
      if (host) return host;
    }
  } catch (err) {
    console.warn("[company-web-hints] discover dominio (Tavily) falló:", err);
  }
  return null;
}

/**
 * Obtiene párrafos cortos públicos desde búsqueda web real (Responses + Tavily de respaldo).
 */
export async function fetchCompanyWebHints(companyName: string, website: string): Promise<string[]> {
  const name = companyName.trim();
  if (!name) return [];

  let hints = await hintsFromResponsesWebSearch(name, website);
  if (hints.length < 3) {
    const tav = await hintsFromTavily(name, website);
    const merged = [...hints];
    const seen = new Set(merged.map((h) => h.toLowerCase().slice(0, 140)));
    for (const line of tav) {
      const k = line.toLowerCase().slice(0, 140);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(line);
    }
    hints = merged;
  }
  return hints.slice(0, 14);
}
