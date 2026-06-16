/**
 * Generación de contenido AI para Propuesta Técnica
 * Usa aiService (Anthropic/OpenAI/Google según configuración del tenant)
 */

import { aiService } from '@/lib/ai-service';

export interface ProposalAIInput {
  companyName: string;
  companyIndustry?: string;
  companySegment?: string;
  companyDescription?: string;
  contactName: string;
  contactPosition?: string;
  serviceName: string;
  staffingDetails: string;
  coverageSchedule: string;
  monthlyTotal: number;
  installationName?: string;
  installationCity?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    specifications?: string;
  }>;
  existingAiDescription?: string;
  /** Detalle de servicio curado por el usuario (qué incluye el servicio) */
  existingServiceDetail?: string;
  /** Nombre comercial del tenant para usar en el prompt (ej: "Mi Empresa Security") */
  providerName?: string;
  /**
   * Modo institucional: genera contenido para una PRESENTACIÓN DE EMPRESA
   * (sin valores comerciales, sin dotación ni características específicas del
   * servicio cotizado). Habla del cliente y de la propuesta de valor del
   * proveedor. Se usa para el PDF descargable del portal del cliente.
   */
  institutional?: boolean;
}

export interface ProposalAIContent {
  descripcionBreve: string;
  resumenEjecutivo: string;
  analisisNecesidades: string;
  sectoresRelevantes: string[];
}

const SECTORES_DISPONIBLES = [
  'Logística y Bodegas',
  'Manufactura e Industria',
  'Retail y Centros Comerciales',
  'Construcción e Inmobiliaria',
  'Salud y Clínicas',
  'Educación',
  'Corporativo/Oficinas',
  'Energía',
  'Minería',
  'Agroindustria',
];

/**
 * Prompt institucional: presentación de empresa SIN valores comerciales,
 * SIN dotación ni características del servicio cotizado. Habla del cliente
 * (su rubro/contexto) y de la propuesta de valor del proveedor + OPAI.
 */
function buildInstitutionalPrompt(input: ProposalAIInput): string {
  const providerName = input.providerName || 'el proveedor de seguridad';

  return `Eres un asesor comercial senior de ${providerName}, empresa chilena de seguridad privada que opera con OPAI (plataforma tecnológica propietaria desarrollada por LX3.ai).

Estás preparando una PRESENTACIÓN INSTITUCIONAL DE EMPRESA para un potencial cliente. NO es una cotización: NO menciones precios, montos, inversión mensual, número de guardias, horarios ni dotación específica. El objetivo es presentar a ${providerName} y demostrar que entiende el rubro del cliente.

DATOS DEL CLIENTE:
- Empresa: ${input.companyName}
- Industria/Rubro: ${input.companyIndustry || 'No especificada'}
- Segmento: ${input.companySegment || 'No especificado'}
- Contacto: ${input.contactName}, ${input.contactPosition || 'Sin cargo'}
${input.existingAiDescription ? `\nDESCRIPCIÓN CURADA POR EL EJECUTIVO (es la base autorizada; respétala y mejórala sin contradecirla):\n${input.existingAiDescription}` : ''}

GENERA (en español chileno formal, directo, con autoridad pero sin ser pomposo):

1. DESCRIPCION_BREVE (máximo 15 palabras):
   Una línea que describa la empresa del cliente y su operación.
   Ejemplo: 'Centro de diálisis con operación continua 24/7 en Puerto Montt'

2. RESUMEN_EJECUTIVO (3 párrafos, ~200 palabras total):
   Párrafo 1: Contexto del cliente — a qué se dedica, por qué su operación es sensible o crítica, qué riesgos de seguridad enfrenta en su sector.
   Párrafo 2: Quiénes somos como ${providerName} y por qué somos el partner adecuado para una empresa de su rubro. Enfoque en experiencia, seriedad y enfoque preventivo. NO menciones precios ni dotación.
   Párrafo 3: ${providerName} opera con OPAI, su plataforma tecnológica propietaria desarrollada por LX3.ai. Qué significa esto para el cliente: visibilidad total, control en tiempo real, reportes automáticos, portal exclusivo. No es solo vigilancia — es un sistema de seguridad gestionado.

3. ANALISIS_NECESIDADES (2 párrafos, ~150 palabras total):
   Párrafo 1: Riesgos específicos del sector del cliente. No generalidades. SER ESPECÍFICO AL RUBRO (salud, logística, retail, industria, etc.).
   Párrafo 2: Cómo ${providerName}, con personal capacitado, supervisión activa y la trazabilidad de OPAI, cubre esos riesgos mejor que un proveedor tradicional. NO menciones cantidades de guardias ni montos.

4. SECTORES_RELEVANTES (array de 3-4 strings):
   Elegir los sectores más afines al rubro del cliente de esta lista:
   'Salud y Clínicas', 'Manufactura e Industria', 'Logística y Bodegas', 'Retail y Centros Comerciales', 'Construcción e Inmobiliaria', 'Educación', 'Corporativo/Oficinas', 'Energía', 'Minería', 'Agroindustria'
   El primer sector debe ser el del cliente. Los otros complementarios.

REGLAS:
- PROHIBIDO mencionar precios, montos, "$", UF, inversión, número de guardias, horarios o régimen de turnos.
- NO uses markdown (ni **, ni ##, ni bullets). Solo texto plano con saltos de línea.
- NO uses frases genéricas tipo 'en el mundo actual' o 'es fundamental contar con'.
- SÉ directo y específico. El tono es de un ejecutivo que habla de igual a igual con otro ejecutivo.

Responde SOLO con JSON válido:
{
  "descripcionBreve": "...",
  "resumenEjecutivo": "...",
  "analisisNecesidades": "...",
  "sectoresRelevantes": ["...", "...", "...", "..."]
}`;
}

function buildPrompt(input: ProposalAIInput): string {
  const itemsText = input.items
    .map(
      (i) =>
        `- ${i.description}: ${i.quantity} x $${i.unitPrice}${i.specifications ? ` (${i.specifications})` : ''}`
    )
    .join('\n');

  const providerName = input.providerName || 'el proveedor de seguridad';

  return `Eres un asesor comercial senior de ${providerName}, empresa chilena de seguridad privada que opera con OPAI (plataforma tecnológica propietaria desarrollada por LX3.ai).

DATOS DEL CLIENTE:
- Empresa: ${input.companyName}
- Industria/Rubro: ${input.companyIndustry || 'No especificada'}
- Segmento: ${input.companySegment || 'No especificado'}
- Instalación: ${input.installationName || '-'}, ${input.installationCity || '-'}
- Contacto: ${input.contactName}, ${input.contactPosition || 'Sin cargo'}

SERVICIO COTIZADO:
- Tipo: ${input.serviceName}
- Dotación: ${input.staffingDetails}
- Cobertura: ${input.coverageSchedule}
- Inversión mensual: $${input.monthlyTotal} neto

ITEMS COTIZADOS:
${itemsText}
${input.existingAiDescription ? `\nDESCRIPCIÓN CURADA POR EL EJECUTIVO (es la base autorizada; respétala y mejórala sin contradecirla, no la reemplaces con texto genérico):\n${input.existingAiDescription}` : ''}
${input.existingServiceDetail ? `\nDETALLE DE SERVICIO CURADO POR EL EJECUTIVO (qué incluye; úsalo como insumo principal para el análisis de necesidades y el resumen):\n${input.existingServiceDetail}` : ''}

GENERA (en español chileno formal, directo, con autoridad pero sin ser pomposo):

1. DESCRIPCION_BREVE (máximo 15 palabras):
   Una línea que describa la empresa y su operación.
   Ejemplo: 'Centro de diálisis con operación continua 24/7 en Puerto Montt'

2. RESUMEN_EJECUTIVO (4 párrafos, ~250 palabras total):
   Párrafo 1: Contexto de la empresa — a qué se dedica, por qué su operación es sensible o crítica, qué riesgos específicos enfrenta en su sector.
   Párrafo 2: Qué servicio propone ${providerName} — dotación, horarios, por qué este esquema es el adecuado para sus necesidades específicas. Ser concreto.
   Párrafo 3: Mencionar que ${providerName} opera con OPAI, su plataforma tecnológica propietaria desarrollada por LX3.ai. Qué significa esto para el cliente: visibilidad total, control en tiempo real, reportes automáticos, portal exclusivo. No es solo vigilancia — es un sistema de seguridad gestionado.
   Párrafo 4: Cierre con la inversión mensual y el valor que representa. Posicionar como inversión (no gasto), comparar implícitamente con el costo de no tenerlo (incidentes, pérdidas, multas DT).

3. ANALISIS_NECESIDADES (2 párrafos, ~150 palabras total):
   Párrafo 1: Riesgos específicos del sector del cliente. No generalidades. Si es salud: acceso no autorizado a áreas restringidas, protección de equipos médicos, manejo de situaciones con pacientes/familiares, regulaciones sanitarias que exigen control de acceso. Si es logística: sustracción, control de carga/descarga, acceso de contratistas. Si es retail: hurto, seguridad de clientes, manejo de dinero. SER ESPECÍFICO AL RUBRO.
   Párrafo 2: Cómo la dotación propuesta cubre estos riesgos, y por qué un proveedor tradicional (sin tecnología, sin supervisión activa, sin trazabilidad) no puede cubrirlos adecuadamente.

4. SECTORES_RELEVANTES (array de 3-4 strings):
   Elegir los sectores más afines al rubro del cliente de esta lista:
   'Salud y Clínicas', 'Manufactura e Industria', 'Logística y Bodegas', 'Retail y Centros Comerciales', 'Construcción e Inmobiliaria', 'Educación', 'Corporativo/Oficinas', 'Energía', 'Minería', 'Agroindustria'
   El primer sector debe ser el del cliente. Los otros 3 complementarios.

REGLAS:
- NO uses markdown (ni **, ni ##, ni bullets). Solo texto plano con saltos de línea.
- NO uses frases genéricas tipo 'en el mundo actual' o 'es fundamental contar con'.
- SÉ directo y específico. Cada frase debe aportar información concreta.
- Cuando menciones cifras o datos, usa los datos reales proporcionados.
- El tono es de un ejecutivo que habla de igual a igual con otro ejecutivo.

Responde SOLO con JSON válido:
{
  "descripcionBreve": "...",
  "resumenEjecutivo": "...",
  "analisisNecesidades": "...",
  "sectoresRelevantes": ["...", "...", "...", "..."]
}`;
}

export async function generateProposalAIContent(
  input: ProposalAIInput,
  tenantId?: string,
): Promise<ProposalAIContent> {
  const prompt = input.institutional ? buildInstitutionalPrompt(input) : buildPrompt(input);
  const raw = await aiService.generateJSON(prompt, 4096, tenantId ? { tenantId } : undefined);

  const obj = raw as Record<string, unknown>;
  const descripcionBreve = String(obj.descripcionBreve ?? '').trim();
  const resumenEjecutivo = String(obj.resumenEjecutivo ?? '').trim();
  const analisisNecesidades = String(obj.analisisNecesidades ?? '').trim();
  const sectoresRelevantes = Array.isArray(obj.sectoresRelevantes)
    ? (obj.sectoresRelevantes as string[]).filter((s) => typeof s === 'string')
    : [];

  return {
    descripcionBreve: descripcionBreve || input.companyName,
    resumenEjecutivo: resumenEjecutivo || 'Propuesta de servicio de seguridad integral.',
    analisisNecesidades: analisisNecesidades || 'Análisis de necesidades según el sector.',
    sectoresRelevantes: sectoresRelevantes.length > 0 ? sectoresRelevantes : ['Corporativo/Oficinas'],
  };
}
