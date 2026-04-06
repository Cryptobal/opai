/**
 * Script para enviar un email de prueba a leads@inbound.gard.cl
 *
 * Simula un correo que Carlos (Gard) reenvía a Leads: contiene la cadena
 * de mensajes (original de SICE + posible respuesta de Carlos) para que
 * la IA extraiga correctamente el cliente, empresa, datos y solicitud.
 *
 * Uso: npx tsx scripts/test-inbound-lead-email.ts
 *
 * Requiere: RESEND_API_KEY, EMAIL_FROM (o usa opai@gard.cl)
 * El FROM debe ser un dominio verificado en Resend (ej. gard.cl)
 *
 * Tras enviar, el webhook de Resend llamará a /api/webhook/inbound-email
 * y se creará un lead en CRM. Revisa en opai.gard.cl/crm/leads
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";

const INBOUND_DOMAIN = process.env.INBOUND_DOMAIN || "inbound.opai.cl";
const INBOUND_LEADS = `gard@${INBOUND_DOMAIN}`;
const FROM = process.env.EMAIL_FROM || "OPAI <opai@gard.cl>";

const EMAIL_BODY = `---------- Forwarded message ----------
From: Muñoz Burgos, Jaime Orlando <jomunozb@sice.com>
Date: Wed, Mar 12, 2025 at 1:06 PM
Subject: Cotización servicio de vigilancia
To: comercial@gard.cl

Buenas tardes,

Necesito que nos cotice servicio de vigilancia.

Son 2 direcciones:

Dardignac 160 – Recoleta
Brisas del Maipo 0127 – La Cisterna

Considerar servicio 24/7, 1 guardia por turno, 4 guardias.

Datos de la Empresa

Razón Social: SICE AGENCIA CHILE S.A
Rut: 59.090.630-1
Giro: Otros servicios de telecomunicaciones
Dirección Comercial: Dardignac #160
Recoleta-Santiago de Chile.

Atentamente,

Jaime Muñoz Burgos
Adquisiciones
SICE AGENCIA CHILE S.A.
Dardignac #160, Recoleta, Santiago (Chile), CP 8420509
Contact: (+56) 9 6237 3606
E-mail: jomunozb@sice.com | www.sice.com`;

const EMAIL_BODY_HTML = `
<div style="font-family: Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; max-width: 600px;">
  <div style="background: white; border-radius: 8px; padding: 24px; border: 1px solid #e2e8f0;">
    <p style="color: #64748b; font-size: 12px; margin-bottom: 16px;">---------- Forwarded message ----------<br>
    From: Muñoz Burgos, Jaime Orlando &lt;jomunozb@sice.com&gt;<br>
    Date: Wed, Mar 12, 2025 at 1:06 PM<br>
    Subject: Cotización servicio de vigilancia<br>
    To: comercial@gard.cl</p>

    <p>Buenas tardes,</p>
    <p>Necesito que nos cotice servicio de vigilancia.</p>
    <p>Son 2 direcciones:</p>
    <ul>
      <li>Dardignac 160 – Recoleta</li>
      <li>Brisas del Maipo 0127 – La Cisterna</li>
    </ul>
    <p>Considerar servicio 24/7, 1 guardia por turno, 4 guardias.</p>
    <p><strong>Datos de la Empresa</strong></p>
    <p>Razón Social: SICE AGENCIA CHILE S.A<br>
    Rut: 59.090.630-1<br>
    Giro: Otros servicios de telecomunicaciones<br>
    Dirección Comercial: Dardignac #160, Recoleta-Santiago de Chile.</p>
    <p>Atentamente,</p>
    <p>Jaime Muñoz Burgos<br>
    Adquisiciones<br>
    SICE AGENCIA CHILE S.A.<br>
    Contact: (+56) 9 6237 3606<br>
    E-mail: jomunozb@sice.com | www.sice.com</p>
  </div>
  <p style="color: #94a3b8; font-size: 11px; margin-top: 16px;">[TEST] Enviado desde scripts/test-inbound-lead-email.ts</p>
</div>
`.trim();

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY no está configurada en .env.local");
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log("\n📤 Enviando email de prueba a leads@inbound");
  console.log("   To:", INBOUND_LEADS);
  console.log("   From:", FROM);
  console.log("   Subject: [TEST] Cotización SICE - vigilancia 2 direcciones\n");

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: INBOUND_LEADS,
    subject: "[TEST] Cotización SICE - vigilancia 2 direcciones",
    text: EMAIL_BODY,
    html: EMAIL_BODY_HTML,
  });

  if (error) {
    console.error("❌ Error al enviar:", error);
    process.exit(1);
  }

  console.log("✅ Email enviado correctamente");
  console.log("   Resend ID:", data?.id);
  console.log("\n📋 Datos esperados en el lead:");
  console.log("   - Empresa: SICE AGENCIA CHILE S.A");
  console.log("   - RUT: 59.090.630-1");
  console.log("   - Contacto: Jaime Muñoz Burgos (jomunozb@sice.com)");
  console.log("   - Cargo: Adquisiciones");
  console.log("   - 2 direcciones, 24/7, 1 guardia/turno, 4 guardias");
  console.log("\nRevisa en opai.gard.cl/crm/leads en unos segundos.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
