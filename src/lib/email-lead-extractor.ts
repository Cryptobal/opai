/**
 * Extracción estructurada de datos de lead desde el contenido de un email
 * (solicitudes de servicio de seguridad en Chile).
 */

import { openai } from "@/lib/openai";

export type ExtractedLeadData = {
  companyName: string | null;
  rut: string | null;
  legalName: string | null;
  businessActivity: string | null;
  legalRepresentativeName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactRole: string | null;
  address: string | null;
  city: string | null;
  commune: string | null;
  serviceType: string | null;
  serviceDuration: string | null;
  coverageDetails: string | null;
  guardsPerShift: string | null;
  numberOfLocations: string | null;
  startDate: string | null;
  summary: string | null;
  industry: string | null;
  website: string | null;
};

const EXTRACTOR_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "extracted_lead_data",
    strict: true,
    schema: {
      type: "object",
      properties: {
        companyName: { type: "string", description: "Nombre comercial de la empresa solicitante" },
        rut: { type: "string", description: "RUT de la empresa (formato XX.XXX.XXX-X o sin puntos)" },
        legalName: { type: "string", description: "Razón social / nombre legal de la empresa" },
        businessActivity: { type: "string", description: "Giro o actividad comercial de la empresa" },
        legalRepresentativeName: { type: "string", description: "Nombre del representante legal" },
        contactFirstName: { type: "string", description: "Nombre de pila del contacto que solicita" },
        contactLastName: { type: "string", description: "Apellido del contacto que solicita" },
        contactEmail: { type: "string", description: "Email del contacto" },
        contactPhone: { type: "string", description: "Teléfono o celular del contacto" },
        contactRole: { type: "string", description: "Cargo o rol del contacto (ej. Encargado de Adquisiciones, Jefe de Prevención)" },
        address: { type: "string", description: "Dirección de la instalación o sede donde se requiere el servicio" },
        city: { type: "string", description: "Ciudad" },
        commune: { type: "string", description: "Comuna (Chile)" },
        serviceType: { type: "string", description: "Tipo de servicio (ej. guardias, seguridad 24x7, resguardo de obra)" },
        serviceDuration: { type: "string", description: "Duración estimada del servicio (ej. 6 meses, indefinido)" },
        coverageDetails: { type: "string", description: "Detalles de cobertura (turnos, 24x7, fines de semana, festivos)" },
        guardsPerShift: { type: "string", description: "Cantidad de guardias por turno o total solicitados" },
        numberOfLocations: { type: "string", description: "Cantidad de puntos/instalaciones a cubrir" },
        startDate: { type: "string", description: "Fecha estimada de inicio del servicio (ej. 02 de marzo, inmediato)" },
        summary: { type: "string", description: "Resumen ejecutivo de la solicitud en 2-4 oraciones" },
        industry: { type: "string", description: "Industria o rubro del cliente (construcción, minería, retail, inmobiliaria, etc.)" },
        website: { type: "string", description: "Sitio web de la empresa solicitante (URL encontrada en firma, cuerpo del correo o datos de contacto, ej. www.empresa.cl)" },
      },
      required: [
        "companyName",
        "rut",
        "legalName",
        "businessActivity",
        "legalRepresentativeName",
        "contactFirstName",
        "contactLastName",
        "contactEmail",
        "contactPhone",
        "contactRole",
        "address",
        "city",
        "commune",
        "serviceType",
        "serviceDuration",
        "coverageDetails",
        "guardsPerShift",
        "numberOfLocations",
        "startDate",
        "summary",
        "industry",
        "website",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Eres un asistente que extrae datos estructurados de correos electrónicos dirigidos a una empresa de seguridad privada en Chile (Gard Security).

CONTEXTO CRÍTICO:
- Gard Security (gard.cl) es la empresa que RECIBE estas solicitudes. NUNCA extraigas "Gard Security" ni datos de empleados de gard.cl como la empresa o contacto solicitante.
- Estos correos suelen ser REENVIADOS por un empleado de Gard (ej. carlos.irigoyen@gard.cl) a un buzón interno. El cliente real que solicita el servicio está en el CUERPO del correo (dentro del mensaje reenviado).
- Busca patrones de reenvío como "---------- Forwarded message ----------", "De:", "From:", "Mensaje reenviado", firmas con logos de otras empresas, etc.
- Si ves datos de Gard Security / gard.cl (nombre, dirección, teléfono, firma), IGNÓRALOS completamente; son del empleado que reenvía, no del cliente.

El correo suele contener solicitudes de servicio de seguridad (guardias, vigilancia, resguardo de obras/instalaciones). Puede incluir datos de la empresa solicitante, del contacto, datos legales/facturación, y requerimientos del servicio.

Extrae TODO lo que encuentres DEL CLIENTE SOLICITANTE (no de Gard). Si un dato no aparece en el texto, usa una cadena vacía "" para ese campo.

Campos a extraer:
- companyName: nombre comercial de la empresa SOLICITANTE (la que pide el servicio, NUNCA "Gard Security")
- rut: RUT de la empresa solicitante (formato chileno, ej. 77.985.438-8)
- legalName: razón social de la empresa solicitante
- businessActivity: giro o actividad comercial de la empresa solicitante
- legalRepresentativeName: nombre del representante legal de la empresa solicitante
- contactFirstName/contactLastName: nombre de la persona que SOLICITA el servicio (no del empleado de Gard que reenvía)
- contactEmail: email del contacto solicitante (NO usar emails @gard.cl)
- contactPhone: teléfono del contacto solicitante (NO usar teléfonos de empleados Gard)
- contactRole: cargo del contacto solicitante
- address: dirección de la instalación o sede donde se requiere el servicio
- city: ciudad
- commune: comuna (contexto Chile)
- serviceType: tipo de servicio (ej. "Guardias de seguridad 24/7", "Resguardo de obra", "Control de acceso")
- serviceDuration: duración estimada (ej. "6 meses", "indefinido")
- coverageDetails: detalles de cobertura (turnos, horarios, 24x7, fines de semana, festivos)
- guardsPerShift: cantidad de guardias por turno o total solicitados
- numberOfLocations: cantidad de puntos/instalaciones/sedes a cubrir
- startDate: fecha estimada de inicio (ej. "02 de marzo", "inmediato", "a definir")
- summary: resumen ejecutivo en 2-4 oraciones con lo más relevante de la solicitud
- industry: rubro del cliente solicitante (construcción, minería, retail, inmobiliaria, energía, etc.)
- website: sitio web de la empresa solicitante. Buscar URLs en la firma del contacto, cuerpo del correo o datos de la empresa (ej. www.empresa.cl, https://empresa.cl). NO usar sitios de Gard (gard.cl). Si encuentras una URL sin protocolo (ej. "www.empresa.cl"), devuélvela con https:// (ej. "https://www.empresa.cl")`;

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Extrae datos de lead desde el contenido de un email (asunto + cuerpo).
 * Acepta HTML o texto plano.
 */
export async function extractLeadFromEmail(params: {
  subject: string;
  htmlBody?: string | null;
  textBody?: string | null;
  fromEmail?: string | null;
  /** Dominio propio de Gard (ej. "gard.cl") para que la IA lo ignore como empresa solicitante */
  ownDomain?: string | null;
}): Promise<ExtractedLeadData> {
  const textBody = params.textBody?.trim() || stripHtml(params.htmlBody || "");

  // Detectar si el remitente es interno (reenvío desde Gard)
  const ownDomain = params.ownDomain || "gard.cl";
  const isForwarded = params.fromEmail
    ? params.fromEmail.toLowerCase().includes(`@${ownDomain.toLowerCase()}`)
    : false;

  const content = [
    `Asunto: ${params.subject || "(sin asunto)"}`,
    // Solo incluir "De:" si NO es un reenvío interno; si es reenvío, la IA debe buscar al cliente en el cuerpo
    !isForwarded && params.fromEmail ? `De: ${params.fromEmail}` : "",
    isForwarded
      ? "[NOTA: Este correo fue REENVIADO por un empleado de Gard Security. El remitente real (el cliente que solicita el servicio) está en el cuerpo del correo. IGNORA los datos de Gard Security, gard.cl y del empleado que reenvía.]"
      : "",
    textBody,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!content.trim()) {
    return emptyResult(params.fromEmail || null, "Correo sin contenido extraíble.");
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: EXTRACTOR_SCHEMA,
    max_tokens: 800,
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return emptyResult(params.fromEmail || null, "No se pudo extraer información.");
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const str = (key: string) => parsed[key]?.trim() || null;
    return {
      companyName: str("companyName"),
      rut: str("rut"),
      legalName: str("legalName"),
      businessActivity: str("businessActivity"),
      legalRepresentativeName: str("legalRepresentativeName"),
      contactFirstName: str("contactFirstName"),
      contactLastName: str("contactLastName"),
      contactEmail: str("contactEmail") ?? (isForwarded ? null : params.fromEmail) ?? null,
      contactPhone: str("contactPhone"),
      contactRole: str("contactRole"),
      address: str("address"),
      city: str("city"),
      commune: str("commune"),
      serviceType: str("serviceType"),
      serviceDuration: str("serviceDuration"),
      coverageDetails: str("coverageDetails"),
      guardsPerShift: str("guardsPerShift"),
      numberOfLocations: str("numberOfLocations"),
      startDate: str("startDate"),
      summary: str("summary"),
      industry: str("industry"),
      website: str("website"),
    };
  } catch {
    return emptyResult(params.fromEmail || null, raw.slice(0, 500));
  }
}

function emptyResult(email: string | null, summary: string): ExtractedLeadData {
  return {
    companyName: null,
    rut: null,
    legalName: null,
    businessActivity: null,
    legalRepresentativeName: null,
    contactFirstName: null,
    contactLastName: null,
    contactEmail: email,
    contactPhone: null,
    contactRole: null,
    address: null,
    city: null,
    commune: null,
    serviceType: null,
    serviceDuration: null,
    coverageDetails: null,
    guardsPerShift: null,
    numberOfLocations: null,
    startDate: null,
    summary,
    industry: null,
    website: null,
  };
}
