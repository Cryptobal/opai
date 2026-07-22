import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { isGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/google-maps-url";
import { gmailClientForAccount } from "./gmail-account-client";
import { prepareThreadAttachments, type PreparedAttachments } from "./email-to-lead-attachments";
import {
  WEEKDAYS_FULL,
  type LeadExtraction,
  type LeadExtractionPuesto,
  type LeadExtractionResult,
} from "./email-to-lead.types";

const SYSTEM = `Eres un asistente que extrae datos de un hilo de correo comercial dirigido a una empresa de seguridad privada en Chile, para crear un LEAD listo para cotizar.
El correo puede venir reenviado; el cliente real está en el cuerpo. Ignora los datos de la empresa receptora o del empleado que reenvía.
Lee TODA la cadena (mensajes anteriores y respuestas): dirección, link de Google Maps y detalles de turnos suelen aparecer en respuestas posteriores.

Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves (usa null si no hay dato):
{
  "empresa": string|null,
  "rut": string|null,
  "contacto": { "nombre": string|null, "cargo": string|null, "email": string|null, "telefono": string|null },
  "requerimiento": string|null,
  "dotacionEstimada": number|null,
  "instalacionNombre": string|null,
  "direccion": string|null,
  "instalacionComuna": string|null,
  "ciudad": string|null,
  "mapsUrl": string|null,
  "nombreCotizacion": string|null,
  "isOngoingService": boolean,
  "mesesContrato": number|null,
  "puestos": [
    {
      "nombre": string|null,
      "rol": string|null,
      "descripcion": string|null,
      "dias": string[],
      "horaInicio": string|null,
      "horaFin": string|null,
      "numGuards": number|null,
      "numPuestos": number|null,
      "sueldoBruto": number|null
    }
  ],
  "fechaLimite": string|null,
  "esLicitacion": boolean,
  "confianza": {
    "empresa": number,
    "contacto": number,
    "requerimiento": number,
    "fechaLimite": number,
    "direccion": number,
    "mapsUrl": number,
    "puestos": number
  }
}

Reglas:
- "fechaLimite" en YYYY-MM-DD. "esLicitacion" true si es licitación/bases/concurso.
- "confianza" de 0 a 1 por campo.
- "mapsUrl": cualquier URL de Google Maps en el hilo (maps.app.goo.gl, goo.gl/maps, google.com/maps). Preferí la más específica del cliente.
- "direccion": dirección escrita (ej. "Oficina Poderosa 175"). Si solo hay Maps, dejá direccion null (se resolverá después).
- "instalacionNombre": nombre del sitio/instalación si se menciona; si no, inventá uno razonable tipo "{empresa} - {comuna}".
- "nombreCotizacion": título corto para la cotización (ej. "Guardias 7x7 Antofagasta").
- "isOngoingService": true si el servicio es continuo/indefinido/sin plazo; false si hay plazo fijo.
- "mesesContrato": solo si isOngoingService=false (ej. 6, 12). Si es indefinido → null.
- "puestos": descomponé la dotación en filas. Si dicen "8 guardias 7x7" o "24/7" sin detalle de turnos, proponé 2 filas (día 08:00-20:00 y noche 20:00-08:00) repartiendo la dotación. "dias" en minúsculas sin acento: lunes,martes,miercoles,jueves,viernes,sabado,domingo. "horaInicio"/"horaFin" en HH:mm 24h.
- "sueldoBruto": solo si el correo lo menciona; si no, null.
- "dotacionEstimada": suma total de guardias (numGuards) si hay puestos; si no, el número mencionado.`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function numOrZero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DAY_MAP: Record<string, string> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miercoles",
  miércoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sabado",
  sábado: "sabado",
  domingo: "domingo",
  lu: "lunes",
  ma: "martes",
  mi: "miercoles",
  ju: "jueves",
  vi: "viernes",
  sa: "sabado",
  do: "domingo",
};

function normalizeDias(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...WEEKDAYS_FULL];
  const out: string[] = [];
  for (const d of raw) {
    if (typeof d !== "string") continue;
    const key = d
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const mapped = DAY_MAP[key] || DAY_MAP[d.trim().toLowerCase()];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out.length > 0 ? out : [...WEEKDAYS_FULL];
}

function normalizeTime(v: unknown, fallback: string | null): string | null {
  if (typeof v !== "string" || !v.trim()) return fallback;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizePuesto(raw: unknown): LeadExtractionPuesto | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    nombre: str(p.nombre),
    tipoPuesto: str(p.tipoPuesto),
    cargo: str(p.cargo),
    rol: str(p.rol),
    descripcion: str(p.descripcion),
    dias: normalizeDias(p.dias),
    horaInicio: normalizeTime(p.horaInicio, "08:00"),
    horaFin: normalizeTime(p.horaFin, "20:00"),
    numGuards: num(p.numGuards),
    numPuestos: num(p.numPuestos) ?? num(p.numGuards) ?? 1,
    sueldoBruto: num(p.sueldoBruto),
  };
}

/** Heurística: 7x7 / 24/7 sin puestos → 2 turnos día/noche. */
function inferPuestosFromDotacion(
  dotacionEstimada: number | null,
  requerimiento: string | null,
): LeadExtractionPuesto[] {
  if (!dotacionEstimada || dotacionEstimada < 1) return [];
  const req = (requerimiento || "").toLowerCase();
  const isContinuousShift = /7\s*[x×]\s*7|24\s*[\/x]\s*7|24x7|24\/7|continuo/.test(req);
  if (isContinuousShift && dotacionEstimada >= 2) {
    const day = Math.ceil(dotacionEstimada / 2);
    const night = Math.max(1, dotacionEstimada - day);
    return [
      {
        nombre: "Turno día",
        tipoPuesto: null,
        cargo: null,
        rol: "Guardia",
        descripcion: null,
        dias: [...WEEKDAYS_FULL],
        horaInicio: "08:00",
        horaFin: "20:00",
        numGuards: day,
        numPuestos: day,
        sueldoBruto: null,
      },
      {
        nombre: "Turno noche",
        tipoPuesto: null,
        cargo: null,
        rol: "Guardia",
        descripcion: null,
        dias: [...WEEKDAYS_FULL],
        horaInicio: "20:00",
        horaFin: "08:00",
        numGuards: night,
        numPuestos: night,
        sueldoBruto: null,
      },
    ];
  }
  return [
    {
      nombre: "Guardias",
      tipoPuesto: null,
      cargo: null,
      rol: "Guardia",
      descripcion: null,
      dias: [...WEEKDAYS_FULL],
      horaInicio: "08:00",
      horaFin: "20:00",
      numGuards: dotacionEstimada,
      numPuestos: dotacionEstimada,
      sueldoBruto: null,
    },
  ];
}

function extractMapsUrlFromText(text: string): string | null {
  const match = text.match(
    /https?:\/\/(?:maps\.app\.goo\.gl\/[^\s<>"']+|goo\.gl\/maps\/[^\s<>"']+|www\.google\.com\/maps[^\s<>"']+|maps\.google\.com[^\s<>"']+)/i,
  );
  if (!match) return null;
  const url = match[0].replace(/[),.;]+$/, "");
  return isGoogleMapsUrl(url) ? url : null;
}

/** Normaliza el JSON de la IA a LeadExtraction (exportado para tests). */
export function normalizeLeadExtraction(
  raw: Record<string, unknown>,
  extras?: { bodyText?: string },
): LeadExtraction {
  const c = (raw.contacto ?? {}) as Record<string, unknown>;
  const confianza: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw.confianza ?? {}) as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) confianza[k] = Math.max(0, Math.min(1, n));
  }

  let puestos = Array.isArray(raw.puestos)
    ? (raw.puestos.map(normalizePuesto).filter(Boolean) as LeadExtractionPuesto[])
    : [];

  const requerimiento = str(raw.requerimiento);
  let dotacionEstimada = num(raw.dotacionEstimada);
  if (!dotacionEstimada && puestos.length > 0) {
    const sum = puestos.reduce((acc, p) => acc + (p.numGuards ?? 0), 0);
    if (sum > 0) dotacionEstimada = sum;
  }
  if (puestos.length === 0) {
    puestos = inferPuestosFromDotacion(dotacionEstimada, requerimiento);
  }

  let mapsUrl = str(raw.mapsUrl);
  if (mapsUrl && !isGoogleMapsUrl(mapsUrl)) mapsUrl = null;
  if (!mapsUrl && extras?.bodyText) {
    mapsUrl = extractMapsUrlFromText(extras.bodyText);
    if (mapsUrl && confianza.mapsUrl == null) confianza.mapsUrl = 0.7;
  }

  let lat = numOrZero(raw.lat);
  let lng = numOrZero(raw.lng);
  if ((lat == null || lng == null) && mapsUrl) {
    const coords = parseGoogleMapsUrl(mapsUrl);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  const isOngoing =
    raw.isOngoingService === false
      ? false
      : raw.isOngoingService === true
        ? true
        : !num(raw.mesesContrato);

  const instalacionComuna = str(raw.instalacionComuna) ?? str(raw.commune);
  const empresa = str(raw.empresa);
  let instalacionNombre = str(raw.instalacionNombre);
  if (!instalacionNombre && empresa) {
    instalacionNombre = instalacionComuna ? `${empresa} - ${instalacionComuna}` : empresa;
  }

  return {
    empresa,
    rut: str(raw.rut),
    contacto: {
      nombre: str(c.nombre),
      cargo: str(c.cargo),
      email: str(c.email),
      telefono: str(c.telefono),
    },
    requerimiento,
    dotacionEstimada,
    instalacionComuna,
    instalacionNombre,
    direccion: str(raw.direccion) ?? str(raw.address),
    ciudad: str(raw.ciudad) ?? str(raw.city),
    mapsUrl,
    lat,
    lng,
    nombreCotizacion: str(raw.nombreCotizacion),
    isOngoingService: isOngoing,
    mesesContrato: isOngoing ? null : num(raw.mesesContrato),
    puestos,
    fechaLimite: str(raw.fechaLimite),
    esLicitacion: Boolean(raw.esLicitacion),
    confianza,
  };
}

/** Extrae una propuesta de lead del hilo (texto + adjuntos). NO crea nada. */
export async function extractLeadFromThread(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
}): Promise<LeadExtractionResult | null> {
  const { tenantId, emailAccountId, threadId } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, subject: true, providerThreadId: true },
  });
  if (!thread) return null;

  const [messages, account] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { sentAt: "asc" },
      select: { fromEmail: true, textBody: true, htmlBody: true },
    }),
    prisma.crmEmailAccount.findUnique({
      where: { id: emailAccountId },
      select: { accessTokenEncrypted: true, refreshTokenEncrypted: true },
    }),
  ]);

  const bodyText = messages
    .map((m) => `De: ${m.fromEmail}\n${(m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "").trim()}`)
    .join("\n\n---\n\n")
    .slice(0, 12000);

  let att: PreparedAttachments = { stagedFiles: [], docText: "", images: [], imageMimes: [], sources: [] };
  const gmail = account ? gmailClientForAccount(account) : null;
  if (gmail && thread.providerThreadId) {
    att = await prepareThreadAttachments(gmail, thread.providerThreadId, tenantId).catch(() => att);
  }

  const prompt = `${SYSTEM}\n\n--- ASUNTO ---\n${thread.subject}\n\n--- CORREO ---\n${bodyText}${att.docText ? `\n\n--- ADJUNTOS (texto) ---${att.docText}` : ""}`;

  let raw: Record<string, unknown>;
  try {
    raw = (att.images.length
      ? await aiService.generateFromImages(att.images, att.imageMimes, prompt, { maxTokens: 2800 }, { tenantId })
      : await aiService.generateJSON(prompt, 2800, { tenantId })) as Record<string, unknown>;
  } catch (err) {
    console.error("[email-to-lead] IA falló:", err);
    throw new Error("La IA no pudo procesar el correo. Intentá de nuevo.");
  }

  return {
    proposal: normalizeLeadExtraction(raw, { bodyText }),
    stagedFiles: att.stagedFiles,
    sources: att.sources,
  };
}
