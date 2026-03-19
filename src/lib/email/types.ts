/**
 * Tipos para el sistema de plantillas de email (Onboarding y Comunicaciones)
 */

export type EmailBlockType =
  | "header"
  | "texto"
  | "boton"
  | "imagen"
  | "separador"
  | "portales"
  | "caracteristicas"
  | "pin"
  | "footer";

export interface EmailFeatureItem {
  emoji: string;
  titulo: string;
  descripcion: string;
}

export interface EmailBlockContent {
  titulo?: string;
  subtitulo?: string;
  texto?: string;
  label?: string;
  url?: string;
  color?: string;
  src?: string;
  alt?: string;
  width?: number;
  mostrarGuardia?: boolean;
  mostrarRondas?: boolean;
  mostrarAcceso?: boolean;
  textoAntes?: string;
  textoDespues?: string;
  items?: EmailFeatureItem[];
}

export interface EmailBlock {
  id: string;
  tipo: EmailBlockType;
  contenido: EmailBlockContent;
  orden: number;
}

export const EMAIL_VARIABLES = [
  "nombre",
  "primerNombre",
  "pin",
  "email",
  "rut",
  "cargo",
  "sitio",
  "cliente",
  "supervisor",
  "fechaInicio",
  "portalGuardia",
  "portalRondas",
  "portalAcceso",
] as const;

export type EmailVariable = (typeof EMAIL_VARIABLES)[number];
