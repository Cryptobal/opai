/**
 * Tipos base y enums para la aplicación
 */

export type ThemeVariant = 'executive' | 'ops' | 'trust';

export type PricingCurrency = 'CLP' | 'UF' | 'USD';

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  position?: string;
}

export interface CTALinks {
  meeting_link: string;
  whatsapp_link: string;
  phone?: string;
  email?: string;
}

export interface CompanyAssets {
  logo: string;
  guard_photos: string[];
  client_logos?: string[];
  hero_image?: string;
  os10_qr_url?: string;
}
