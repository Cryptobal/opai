/**
 * Sistema de reemplazo de tokens dinámicos
 * Permite reemplazar tokens tipo [ACCOUNT_NAME] con valores reales del payload
 */

import { PresentationPayload } from '@/types/presentation';
import { formatCurrency, formatDate, escapeRegExp } from './utils';

/**
 * Mapa de todos los tokens disponibles y sus rutas en el payload
 */
export function buildTokenMap(data: PresentationPayload): Record<string, string> {
  const now = new Date();
  
  return {
    // ===== Cliente =====
    '[ACCOUNT_NAME]': data.client.company_name || '',
    '[COMPANY_NAME]': data.client.company_name || '',
    '[CONTACT_NAME]': data.client.contact_name || '',
    '[CONTACT_FIRST_NAME]': data.client.contact_first_name || '',
    '[CONTACT_LAST_NAME]': data.client.contact_last_name || '',
    '[CONTACT_TITLE]': data.client.contact_title || '',
    '[CONTACT_DEPARTMENT]': data.client.contact_department || '',
    '[CONTACT_EMAIL]': data.client.contact_email || '',
    '[CONTACT_PHONE]': data.client.contact_phone || '',
    '[CONTACT_MOBILE]': data.client.contact_mobile || '',
    '[ACCOUNT_PHONE]': data.client.phone || '',
    '[ACCOUNT_WEBSITE]': data.client.website || '',
    '[ACCOUNT_INDUSTRY]': data.client.industry || '',
    '[ACCOUNT_RUT]': data.client.rut || '',
    '[ACCOUNT_GIRO]': data.client.giro || '',
    '[ACCOUNT_ADDRESS]': data.client.address || '',
    '[ACCOUNT_CITY]': data.client.city || '',
    '[ACCOUNT_STATE]': data.client.state || '',
    '[ACCOUNT_ZIP]': data.client.zip || '',
    
    // ===== Cotización =====
    '[QUOTE_ID]': data.id || '',
    '[QUOTE_NUMBER]': data.quote.number || '',
    '[QUOTE_SUBJECT]': data.quote.subject || '',
    '[QUOTE_DESCRIPTION]': data.quote.description || '',
    '[QUOTE_SUBTOTAL]': data.quote.subtotal
      ? formatCurrency(data.quote.subtotal, data.quote.currency)
      : '',
    '[QUOTE_TAX]': data.quote.tax
      ? formatCurrency(data.quote.tax, data.quote.currency)
      : '',
    '[QUOTE_TOTAL]': formatTotalWithCurrency(data.quote.total, data.quote.currency),
    '[QUOTE_CURRENCY]': data.quote.currency || 'CLP',
    '[QUOTE_VALID_UNTIL]': formatDate(data.quote.valid_until),
    '[QUOTE_CREATED_DATE]': data.quote.created_date ? formatDate(data.quote.created_date) : '',
    '[QUOTE_DATE]': formatDate(data.quote.date),
    
    // ===== Servicios =====
    '[SERVICE_SCOPE]': data.service.scope_summary || '',
    '[SERVICE_SITES_COUNT]': data.service.sites.length.toString(),
    '[SERVICE_POSITIONS_COUNT]': data.service.positions.length.toString(),
    '[SERVICE_COVERAGE_HOURS]': data.service.coverage_hours || '',
    '[SERVICE_START_DATE]': data.service.start_date ? formatDate(data.service.start_date) : '',
    
    // ===== Sistema =====
    '[CURRENT_DATE]': formatDate(now),
    '[CURRENT_YEAR]': now.getFullYear().toString(),
    '[PRESENTATION_ID]': data.id || '',
    '[PRESENTATION_URL]': `https://opai.gard.cl/p/${data.id}`,
    '[TEMPLATE_ID]': data.template_id || '',
    
    // ===== Contacto y CTA =====
    '[CTA_MEETING_LINK]': data.cta.meeting_link || '',
    '[CTA_WHATSAPP_LINK]': data.cta.whatsapp_link || '',
    '[CONTACT_NAME_GARD]': data.contact.name || '',
    '[CONTACT_EMAIL_GARD]': data.contact.email || '',
    '[CONTACT_PHONE_GARD]': data.contact.phone || '',
    '[CONTACT_POSITION_GARD]': data.contact.position || '',
  };
}

/**
 * Reemplaza todos los tokens en un string con sus valores correspondientes
 * @param template - String que contiene tokens tipo [TOKEN_NAME]
 * @param data - Payload completo de la presentación
 * @returns String con todos los tokens reemplazados
 */
export function replaceTokens(template: string, data: PresentationPayload): string {
  const tokenMap = buildTokenMap(data);
  let result = template;
  
  // Reemplazar cada token encontrado
  Object.entries(tokenMap).forEach(([token, value]) => {
    const regex = new RegExp(escapeRegExp(token), 'g');
    result = result.replace(regex, value);
  });
  
  return result;
}

/**
 * Reemplaza tokens en un objeto recursivamente
 * Útil para procesar secciones completas con múltiples strings
 */
export function replaceTokensInObject<T>(obj: T, data: PresentationPayload): T {
  if (typeof obj === 'string') {
    return replaceTokens(obj, data) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => replaceTokensInObject(item, data)) as unknown as T;
  }
  
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(obj).forEach(([key, value]) => {
      result[key] = replaceTokensInObject(value, data);
    });
    return result as T;
  }
  
  return obj;
}

/**
 * Verifica si un string contiene tokens sin reemplazar
 * Útil para debugging
 */
export function hasUnreplacedTokens(text: string): boolean {
  return /\[([A-Z_]+)\]/.test(text);
}

/**
 * Extrae todos los tokens no reemplazados de un string
 * Útil para debugging
 */
export function extractUnreplacedTokens(text: string): string[] {
  const regex = /\[([A-Z_]+)\]/g;
  const matches = text.matchAll(regex);
  return Array.from(matches, match => match[0]);
}

/**
 * Formatea el total con el símbolo de moneda correcto
 */
function formatTotalWithCurrency(value: number, currency: 'CLP' | 'UF' | 'USD'): string {
  return formatCurrency(value, currency);
}

/**
 * Preprocesa tokens en componentes React
 * Permite usar tokens en JSX de forma type-safe
 */
export function useTokens(data: PresentationPayload) {
  const tokenMap = buildTokenMap(data);
  
  return {
    get: (token: string): string => {
      return tokenMap[token] || token;
    },
    replace: (template: string): string => {
      return replaceTokens(template, data);
    },
    replaceInObject: <T>(obj: T): T => {
      return replaceTokensInObject(obj, data);
    },
  };
}
