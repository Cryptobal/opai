/**
 * Resend Email Service
 * 
 * Cliente configurado para envío de emails con Resend
 */

import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY no está configurada en variables de entorno');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

// Configuración de emails
export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'OPAI <opai@gard.cl>',
  replyTo: process.env.EMAIL_REPLY_TO || 'opai@gard.cl',
  companyName: 'Gard Security',
};
