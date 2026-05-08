/**
 * Tipos compartidos para presentaciones comerciales y generación de PDF
 * (`/api/pdf/generate-pricing-v2`, webhooks Zoho, etc.).
 */

export interface PricingLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface PricingData {
  currency: string;
  items: PricingLineItem[];
  subtotal: number;
  payment_terms?: string;
  adjustment_terms?: string;
  notes?: string[];
}
