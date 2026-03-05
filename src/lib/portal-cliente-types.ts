// Client-safe types and constants for Portal Cliente
// This file has NO server-side imports and is safe to import in 'use client' components

export type PortalConfig = {
  dashboard: boolean
  guardias: boolean
  liquidaciones: boolean
  asistencia: boolean
  pautas: boolean
  examenes: boolean
  rondas: boolean
  posta: boolean
  documentacion: boolean
  cotizaciones: boolean
  chat_instalacion: boolean
  chat_grupos: boolean
  tickets: boolean
  encuestas: boolean
  reportes: boolean
  comparativa: boolean
  alertas: boolean
}

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  dashboard: true,
  guardias: true,
  liquidaciones: false,
  asistencia: true,
  pautas: false,
  examenes: false,
  rondas: true,
  posta: true,
  documentacion: true,
  cotizaciones: true,
  chat_instalacion: true,
  chat_grupos: true,
  tickets: true,
  encuestas: false,
  reportes: true,
  comparativa: true,
  alertas: true,
}

export interface ClienteSession {
  contactId: string;
  tenantId: string;
  accountId: string;
  accountName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  installations: Array<{ id: string; name: string }>;
  authenticatedAt: string;
  portalConfig: PortalConfig;
  isProspect: boolean;
  hasDemoData: boolean;
  portalTourShown: boolean;
  ejecutivoId: string | null;
  ejecutivoName: string | null;
}
