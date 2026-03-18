/**
 * Envía un email de ejemplo de invitación al portal del cliente.
 * Usa el template PortalClienteInviteEmail (mismo que el botón Invitar).
 * Uso: npx tsx scripts/send-portal-invite-sample.ts
 *
 * Requiere RESEND_API_KEY en .env.local
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";
import { render } from "@react-email/render";
import { PortalClienteInviteEmail } from "../src/emails/PortalClienteInviteEmail";

const FROM = process.env.EMAIL_FROM || "OPAI <opai@gard.cl>";
const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";

async function main() {
  const toEmail = "carlos.irigoyen@gmail.com";

  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY no está configurada en .env.local");
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = await render(
    PortalClienteInviteEmail({
      contactName: "Carlos",
      companyName: "Polpaico",
      email: toEmail,
      pin: "1234",
      portalUrl: `${PORTAL_URL}/portal/cliente`,
      ejecutivoName: "Carlos Irigoyen",
    })
  );

  console.log(`\n📤 Enviando invitación de ejemplo a: ${toEmail}`);
  console.log(`   From: ${FROM}`);
  console.log(`   Template: PortalClienteInviteEmail (con beneficios del portal)\n`);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Acceso al Portal de Seguridad — Polpaico",
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
