/**
 * Script para probar el envío de emails vía Resend.
 * Uso: npx tsx scripts/test-resend-email.ts [email-destino]
 *
 * Si no se pasa email, intenta usar el del primer admin del tenant gard.
 * Requiere RESEND_API_KEY en .env.local
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FROM = process.env.EMAIL_FROM || "OPAI <opai@gard.cl>";

async function main() {
  const toEmail = process.argv[2];

  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY no está configurada en .env.local");
    process.exit(1);
  }

  let destination = toEmail;
  if (!destination) {
    // Buscar email de un admin del tenant gard para pruebas
    const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" }, select: { id: true } });
    const admin = tenant
      ? await prisma.admin.findFirst({
          where: { tenantId: tenant.id, status: "active" },
          select: { email: true, name: true },
        })
      : null;
    destination = admin?.email;
    if (!destination) {
      console.error("❌ Pasa un email como argumento: npx tsx scripts/test-resend-email.ts tu@email.com");
      process.exit(1);
    }
    console.log(`📧 Usando email de admin: ${admin?.name} <${destination}>`);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #0a0a0f; color: #e2e8f0; padding: 24px; max-width: 600px;">
  <div style="background: #1a1a24; border-radius: 8px; padding: 24px;">
    <h1 style="color: #f97316; margin: 0 0 16px;">OPAI - Email de prueba</h1>
    <p>Este es un correo de prueba del sistema de onboarding/comunicaciones.</p>
    <p>Si recibiste este email, Resend está configurado correctamente.</p>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Enviado desde scripts/test-resend-email.ts</p>
  </div>
</body>
</html>
`.trim();

  console.log(`\n📤 Enviando a: ${destination}`);
  console.log(`   From: ${FROM}\n`);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: destination,
    subject: "OPAI - Email de prueba (Resend)",
    html,
  });

  if (error) {
    console.error("❌ Error al enviar:", error);
    console.error("\nDetalle:", JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log("✅ Email enviado correctamente");
  console.log("   Resend ID:", data?.id);
  console.log("\nRevisa la bandeja de entrada (y spam) de", destination);
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
