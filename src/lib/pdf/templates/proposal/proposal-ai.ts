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

function buildPrompt(input: ProposalAIInput): string {
  const itemsText = input.items
    .map(
      (i) =>
        `- ${i.description}: ${i.quantity} x $${i.unitPrice}${i.specifications ? ` (${i.specifications})` : ''}`
    )
    .join('\n');

  return `Eres un asesor comercial senior de Gard Security, empresa chilena de seguridad privada.
Genera contenido para una propuesta técnica profesional.

DATOS DEL CLIENTE:
- Empresa: ${input.companyName}
- Industria: ${input.companyIndustry || 'No especificada'}
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
${input.existingAiDescription ? `\nCONTEXTO ADICIONAL (descripción existente de la cotización):\n${input.existingAiDescription}` : ''}

GENERA (en español chileno formal, profesional, sin ser pomposo):

1. DESCRIPCION_BREVE: Una línea que describa la empresa y su operación crítica.
Ejemplo: "Centro de diálisis con operación continua 24/7 en Puerto Montt"

2. RESUMEN_EJECUTIVO: 3-4 párrafos que cubran:
- Contexto de la empresa y por qué la seguridad es crítica para su operación
- Qué servicio propone Gard y por qué es la dotación adecuada
- Mencionar que Gard opera con OPAI, su plataforma tecnológica propietaria desarrollada por LX3.ai
- Cerrar con la inversión mensual y el valor que representa

3. ANALISIS_NECESIDADES: 1-2 párrafos analizando:
- Riesgos específicos del sector/industria del cliente
- Puntos críticos que la dotación propuesta cubre
- Por qué un proveedor tradicional no cubriría estos riesgos

4. SECTORES_RELEVANTES: Lista de 3-4 sectores industriales donde Gard tiene experiencia
que sean más afines al rubro del cliente. Elegir de: ${SECTORES_DISPONIBLES.join(', ')}.

Responde ÚNICAMENTE con un JSON válido con las keys: descripcionBreve, resumenEjecutivo, analisisNecesidades, sectoresRelevantes.
NO uses markdown dentro de los textos. Solo texto plano con saltos de línea (\\n).
sectoresRelevantes debe ser un array de strings.`;
}

export async function generateProposalAIContent(
  input: ProposalAIInput
): Promise<ProposalAIContent> {
  const prompt = buildPrompt(input);
  const raw = await aiService.generateJSON(prompt, 4096);

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
