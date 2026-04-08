/**
 * Cifrado one-time de datos existentes en OpsPersona (Ley 21.719 Fase 2).
 *
 * USO:
 *   1. Configurar PERSONA_ENCRYPTION_KEY en .env (`openssl rand -hex 32`).
 *   2. Hacer backup de la DB.
 *   3. Ejecutar: `npx tsx scripts/encrypt-existing-persona-data.ts`
 *
 * IMPORTANTE:
 *   - Idempotente: si un valor ya está cifrado, decryptText tendrá éxito y se
 *     omite. Si no, se trata como plaintext y se cifra.
 *   - Procesa en batches de 100 para no saturar la conexión.
 *   - NO ejecutar sin haber probado primero en staging.
 */
import { prisma } from "../src/lib/prisma";
import { encryptText, decryptText } from "../src/lib/crypto";
import { ENCRYPTED_PERSONA_FIELDS } from "../src/lib/persona-encryption";

const SECRET = process.env.PERSONA_ENCRYPTION_KEY || "";

async function main() {
  if (!SECRET) {
    console.error("❌ PERSONA_ENCRYPTION_KEY no está configurada. Aborto.");
    process.exit(1);
  }

  const total = await prisma.opsPersona.count();
  console.log(`▶ Cifrando datos sensibles de ${total} personas...`);

  const BATCH = 100;
  let processed = 0;
  let updated = 0;
  let alreadyEncrypted = 0;

  for (let skip = 0; skip < total; skip += BATCH) {
    const personas = await prisma.opsPersona.findMany({
      skip,
      take: BATCH,
      select: {
        id: true,
        afp: true,
        healthSystem: true,
        isapreName: true,
      },
    });

    for (const p of personas) {
      const updates: Record<string, string> = {};
      for (const field of ENCRYPTED_PERSONA_FIELDS) {
        const value = p[field];
        if (typeof value !== "string" || value.length === 0) continue;
        // Si ya está cifrado, decryptText pasa sin error → omitir.
        try {
          decryptText(value, SECRET);
          alreadyEncrypted++;
          continue;
        } catch {
          // No cifrado → cifrar.
        }
        updates[field] = encryptText(value, SECRET);
      }

      if (Object.keys(updates).length > 0) {
        await prisma.opsPersona.update({ where: { id: p.id }, data: updates });
        updated++;
      }
      processed++;
    }

    console.log(`  ${processed}/${total} procesados (${updated} cifrados, ${alreadyEncrypted} ya estaban cifrados)`);
  }

  console.log(`✅ Listo. Total cifrados: ${updated}. Ya cifrados: ${alreadyEncrypted}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
