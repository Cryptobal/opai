/**
 * Zoho Data Mapper
 * 
 * Convierte datos de Zoho CRM al formato PresentationPayload
 */

import { PresentationPayload } from '@/types/presentation';
import { getMockPresentationPayload } from './mock-data';

interface ZohoWebhookData {
  quote?: any;
  account?: any;
  contact?: any;
  deal?: any;
  product_details?: any[];
  quote_id?: string;
  timestamp?: string;
}

/**
 * Mapea datos de Zoho CRM a PresentationPayload
 */
export function mapZohoDataToPresentation(
  zohoData: ZohoWebhookData,
  sessionId: string,
  templateId: string = 'commercial'
): PresentationPayload {
  // Usar mock data como base y sobrescribir con datos de Zoho
  const base = getMockPresentationPayload();

  return {
    ...base,
    id: sessionId,
    template_id: templateId,
    
    // Client data
    client: {
      ...base.client,
      company_name: zohoData.account?.Account_Name || base.client.company_name,
      contact_name: zohoData.contact?.Full_Name || base.client.contact_name,
      industry: zohoData.account?.Industry || base.client.industry,
      rut: zohoData.account?.RUT__c || base.client.rut,
      city: zohoData.account?.Billing_City || base.client.city,
      state: zohoData.account?.Billing_State || base.client.state,
      address: zohoData.account?.Billing_Street || base.client.address,
      zip: zohoData.account?.Billing_Code || base.client.zip,
      phone: zohoData.account?.Phone || base.client.phone,
      website: zohoData.account?.Website || base.client.website,
      giro: zohoData.account?.Giro__c || base.client.giro,
      contact_first_name: zohoData.contact?.First_Name || base.client.contact_first_name,
      contact_last_name: zohoData.contact?.Last_Name || base.client.contact_last_name,
      contact_title: zohoData.contact?.Title || base.client.contact_title,
      contact_department: zohoData.contact?.Department || base.client.contact_department,
      contact_email: zohoData.contact?.Email || base.client.contact_email,
      contact_phone: zohoData.contact?.Phone || base.client.contact_phone,
      contact_mobile: zohoData.contact?.Mobile || base.client.contact_mobile,
    },
    
    // Quote data
    quote: {
      ...base.quote,
      number: zohoData.quote?.Quote_Number || base.quote.number,
      date: zohoData.quote?.Created_Time 
        ? new Date(zohoData.quote.Created_Time).toLocaleDateString('es-CL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : base.quote.date,
      valid_until: zohoData.quote?.Valid_Till
        ? new Date(zohoData.quote.Valid_Till).toLocaleDateString('es-CL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : base.quote.valid_until,
      subject: zohoData.quote?.Subject || base.quote.subject,
      description: zohoData.quote?.Descripcion_AI || base.quote.description, // Campo correcto de Zoho
      total: zohoData.quote?.Grand_Total || base.quote.total,
      subtotal: zohoData.quote?.Sub_Total || base.quote.subtotal,
      tax: zohoData.quote?.Tax || base.quote.tax,
      currency: (zohoData.quote?.Currency || base.quote.currency) as any,
    },
    
    // Contact data
    contact: {
      ...base.contact,
      name: zohoData.contact?.Full_Name || base.contact.name,
      email: zohoData.contact?.Email || base.contact.email,
      phone: zohoData.contact?.Mobile || zohoData.contact?.Phone || base.contact.phone,
      position: zohoData.contact?.Title || base.contact.position,
    },
    
    // CTA links
    cta: {
      ...base.cta,
      // Usar WhatsApp del contacto si existe
      whatsapp_link: zohoData.contact?.Mobile 
        ? `https://wa.me/${zohoData.contact.Mobile.replace(/[^0-9]/g, '')}?text=Hola%20${encodeURIComponent(zohoData.contact?.First_Name || '')},%20te%20env%C3%ADo%20nuestra%20propuesta%20comercial`
        : base.cta.whatsapp_link,
      email: zohoData.contact?.Email || base.cta.email,
      phone: zohoData.contact?.Mobile || zohoData.contact?.Phone || base.cta.phone,
    },
    
    // Mapear secciones con datos reales de Zoho
    sections: {
      ...base.sections,
      
      // S01 - Hero: Personalizar con asunto de la cotización
      s01_hero: {
        ...base.sections.s01_hero,
        personalization: zohoData.quote?.Subject && zohoData.quote?.Quote_Number
          ? `${zohoData.quote.Subject} — ${zohoData.quote.Quote_Number}`
          : `Propuesta para ${zohoData.account?.Account_Name || 'Cliente'} — ${zohoData.quote?.Quote_Number || ''}`,
      },
      
      // S23 - Propuesta Económica: Mapear productos reales
      s23_propuesta_economica: {
        ...base.sections.s23_propuesta_economica,
        pricing: {
          ...base.sections.s23_propuesta_economica.pricing,
          // Mapear productos de Zoho si existen
          items: zohoData.product_details && zohoData.product_details.length > 0
            ? zohoData.product_details.map((product: any) => {
                return {
                  name: product.product_name || undefined, // Nombre del producto
                  description: product.description && product.description.trim() !== '' 
                    ? product.description 
                    : product.product_name || 'Servicio', // Descripción detallada
                  quantity: product.quantity || 1,
                  unit_price: product.unit_price || 0,
                  subtotal: product.subtotal || (product.quantity * product.unit_price) || 0,
                  currency: (zohoData.quote?.Currency || 'CLP') as any,
                  notes: undefined, // Las notas adicionales si se necesitan
                };
              })
            : base.sections.s23_propuesta_economica.pricing.items,
          // Usar totales de Zoho
          subtotal: zohoData.quote?.Sub_Total || base.sections.s23_propuesta_economica.pricing.subtotal,
          tax: zohoData.quote?.Tax || base.sections.s23_propuesta_economica.pricing.tax,
          total: zohoData.quote?.Grand_Total || base.sections.s23_propuesta_economica.pricing.total,
          currency: (zohoData.quote?.Currency || base.sections.s23_propuesta_economica.pricing.currency) as any,
        },
      },
    },
  };
}

/**
 * Extrae información resumida de datos de Zoho
 */
export function extractZohoSummary(zohoData: ZohoWebhookData) {
  return {
    quoteId: zohoData.quote_id || zohoData.quote?.id,
    quoteNumber: zohoData.quote?.Quote_Number,
    accountName: zohoData.account?.Account_Name,
    contactName: zohoData.contact?.Full_Name,
    contactEmail: zohoData.contact?.Email,
    total: zohoData.quote?.Grand_Total,
    currency: zohoData.quote?.Currency || 'CLP',
    timestamp: zohoData.timestamp,
  };
}

/**
 * Valida que los datos de Zoho tengan los campos mínimos requeridos
 */
export function validateZohoData(zohoData: ZohoWebhookData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validar Quote
  if (!zohoData.quote) {
    errors.push('Missing quote data');
  } else {
    if (!zohoData.quote.Quote_Number) errors.push('Missing Quote_Number');
    if (!zohoData.quote.Grand_Total) errors.push('Missing Grand_Total');
  }

  // Validar Account
  if (!zohoData.account) {
    errors.push('Missing account data');
  } else {
    if (!zohoData.account.Account_Name) errors.push('Missing Account_Name');
  }

  // Validar Contact
  if (!zohoData.contact) {
    errors.push('Missing contact data');
  } else {
    if (!zohoData.contact.Full_Name) errors.push('Missing Contact Full_Name');
    if (!zohoData.contact.Email) errors.push('Missing Contact Email');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
