/**
 * Script de validación del extractor de leads.
 * Ejecuta las funciones puras (sin IA) y opcionalmente extractLeadFromEmail si hay OPENAI_API_KEY.
 *
 * Uso: npx tsx scripts/validate-email-lead-extractor.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  detectForwardInBody,
  isGarbageEmail,
  parseFromHeader,
  extractLeadFromEmail,
} from "@/lib/email-lead-extractor";

const SICE_FORWARD_BODY = `---------- Forwarded message ----------
From: Muñoz Burgos, Jaime Orlando <jomunozb@sice.com>
Date: Wed, Mar 12, 2025 at 1:06 PM
Subject: Cotización vigilancia
To: comercial@gard.cl

Buenas tardes,

Necesito que nos cotice servicio de vigilancia.
Son 2 direcciones: Dardignac 160 – Recoleta, Brisas del Maipo 0127 – La Cisterna.
Considerar servicio 24/7, 1 guardia por turno, 4 guardias.

Razón Social: SICE AGENCIA CHILE S.A
Rut: 59.090.630-1
Giro: Otros servicios de telecomunicaciones
Contacto: Jaime Muñoz Burgos, jomunozb@sice.com`;

const GARBAGE_BODY =
  "angelica.bruna@polpaicosoluciones.cl. Pulsa el tabulador para insertarlo. El menú de 1Password está disponible.";

const REPLY_BODY = `Cordialmente, Carlos.

On Wed, Mar 12, 2025 at 1:06 PM Muñoz Burgos, Jaime Orlando <jomunozb@sice.com> wrote:
> Buenas tardes,
> Necesito cotización para SICE. 2 direcciones, 24/7, 4 guardias.
> Contacto: Jaime Muñoz, jomunozb@sice.com`;

function run() {
  console.log("\n=== Validación email-lead-extractor ===\n");

  let ok = 0;
  let fail = 0;

  // 1. parseFromHeader
  const p1 = parseFromHeader("Jaime Muñoz <jomunozb@sice.com>");
  if (p1.name === "Jaime Muñoz" && p1.email === "jomunozb@sice.com") {
    console.log("✅ parseFromHeader: OK");
    ok++;
  } else {
    console.log("❌ parseFromHeader: FAIL", p1);
    fail++;
  }

  // 2. detectForwardInBody
  const fwd = detectForwardInBody(SICE_FORWARD_BODY);
  if (fwd) {
    console.log("✅ detectForwardInBody (forward): OK");
    ok++;
  } else {
    console.log("❌ detectForwardInBody (forward): FAIL");
    fail++;
  }

  const noFwd = detectForwardInBody("Hola, necesito cotización.");
  if (!noFwd) {
    console.log("✅ detectForwardInBody (sin forward): OK");
    ok++;
  } else {
    console.log("❌ detectForwardInBody (sin forward): FAIL");
    fail++;
  }

  // 3. isGarbageEmail
  const garbage = isGarbageEmail({ textBody: GARBAGE_BODY });
  if (garbage) {
    console.log("✅ isGarbageEmail (basura): OK");
    ok++;
  } else {
    console.log("❌ isGarbageEmail (basura): FAIL");
    fail++;
  }

  const legit = isGarbageEmail({ textBody: SICE_FORWARD_BODY });
  if (!legit) {
    console.log("✅ isGarbageEmail (legítimo): OK");
    ok++;
  } else {
    console.log("❌ isGarbageEmail (legítimo): FAIL");
    fail++;
  }

  // 4. extractLeadFromEmail (solo si hay API key)
  if (process.env.OPENAI_API_KEY) {
    console.log("\n--- Probando extractLeadFromEmail (IA real) ---");
    return extractLeadFromEmail({
      subject: "Fwd: Cotización vigilancia",
      textBody: SICE_FORWARD_BODY,
      fromEmail: "Carlos Irigoyen <carlos.irigoyen@gard.cl>",
      ownDomain: "gard.cl",
      ownCompanyName: "Gard Security",
    })
      .then((result) => {
        const hasCompany = !!result.companyName?.toLowerCase().includes("sice");
        const hasContact = !!result.contactEmail?.includes("jomunozb");
        const hasRut = !!result.rut?.includes("59");
        if (hasCompany && hasContact) {
          console.log("✅ extractLeadFromEmail: OK");
          console.log("   companyName:", result.companyName);
          console.log("   contactEmail:", result.contactEmail);
          console.log("   rut:", result.rut);
          console.log("   guardsPerShift:", result.guardsPerShift);
          console.log("   numberOfLocations:", result.numberOfLocations);
          ok++;
        } else {
          console.log("❌ extractLeadFromEmail: datos incompletos", {
            companyName: result.companyName,
            contactEmail: result.contactEmail,
            rut: result.rut,
          });
          fail++;
        }
        console.log(`\n=== Resultado: ${ok} OK, ${fail} FAIL ===\n`);
        process.exit(fail > 0 ? 1 : 0);
      })
      .catch((err) => {
        if (err?.status === 401 || err?.code === "invalid_api_key") {
          console.log("⏭️  extractLeadFromEmail: omitido (API key inválida o expirada)");
        } else {
          console.error("❌ extractLeadFromEmail error:", err);
          fail++;
        }
        console.log(`\n=== Resultado: ${ok} OK, ${fail} FAIL ===\n`);
        process.exit(fail > 0 ? 1 : 0);
      });
  } else {
    console.log("\n⏭️  OPENAI_API_KEY no configurada, omitiendo extractLeadFromEmail");
  }

  console.log(`\n=== Resultado: ${ok} OK, ${fail} FAIL ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
