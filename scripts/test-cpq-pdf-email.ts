/**
 * Script para enviar un email de prueba del template CpqPdfEmail.
 * Uso: npx tsx scripts/test-cpq-pdf-email.ts [email-destino]
 *
 * Requiere RESEND_API_KEY en .env.local
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";
import { render } from "@react-email/render";
import { CpqPdfEmail } from "../src/emails/CpqPdfEmail";

const FROM = process.env.EMAIL_FROM || "Gard Security <comercial@gard.cl>";

const SAMPLE_BODY = `Te adjunto la propuesta económica para los servicios de seguridad en Emin - CCP, que incluye 3 guardias para los puestos de Control de Acceso con todas las especificaciones técnicas y operacionales requeridas.

El detalle completo con valores y condiciones comerciales está en el PDF adjunto.

Quedo disponible para cualquier consulta.`;

async function main() {
  const toEmail = process.argv[2] || "carlos.irigoyen@gmail.com";

  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY no está configurada en .env.local");
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = await render(
    CpqPdfEmail({
      recipientFirstName: "Mario",
      recipientEmail: toEmail,
      companyName: "Emin",
      quoteCode: "CPQ-2026-030-ABF2",
      installationName: "Emin - CCP",
      bodyText: SAMPLE_BODY,
      senderName: "Carlos Irigoyen Garcés",
      senderCargo: "Director Comercial",
      brandName: "Gard Security",
      brandPhone: "+56 98 230 7771",
      brandEmail: "comercial@gard.cl",
      portalUrl: "https://opai.gard.cl/portal/cliente",
      portalPin: "3832",
    })
  );

  console.log(`\n📤 Enviando email de prueba a: ${toEmail}`);
  console.log(`   From: ${FROM}\n`);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Propuesta económica CPQ-2026-030-ABF2 - Gard Security (prueba)",
    html,
  });

  if (error) {
    console.error("❌ Error al enviar:", error);
    process.exit(1);
  }

  console.log("✅ Email enviado correctamente");
  console.log("   Resend ID:", data?.id);
  console.log("\nRevisa la bandeja de entrada (y spam) de", toEmail);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
