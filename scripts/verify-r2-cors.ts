/**
 * Verifica que la CORS del bucket R2 quedó bien para la subida de contratos.
 * NO deja basura: sube un objeto de prueba y lo borra.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/verify-r2-cors.ts
 */
import "dotenv/config";
import { getPresignedUploadUrl, deleteFile } from "../src/lib/storage";

const ORIGIN = process.env.TEST_ORIGIN ?? "https://www.opai.cl";

async function main() {
  const { uploadUrl, storageKey } = await getPresignedUploadUrl({
    fileName: "cors-test.pdf",
    mimeType: "application/pdf",
    prefix: "contracts",
    tenantId: "clgard00000000000000001",
  });
  console.log(`Origin de prueba: ${ORIGIN}`);
  console.log(`storageKey:       ${storageKey}\n`);

  // 1) Preflight CORS (lo que el browser hace antes del PUT)
  const pre = await fetch(uploadUrl, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const acao = pre.headers.get("access-control-allow-origin");
  const acam = pre.headers.get("access-control-allow-methods");
  console.log(`[1] Preflight OPTIONS → ${pre.status}`);
  console.log(`    Access-Control-Allow-Origin:  ${acao ?? "(ausente)"}`);
  console.log(`    Access-Control-Allow-Methods: ${acam ?? "(ausente)"}`);
  const preflightOk = acao === ORIGIN || acao === "*";

  // 2) PUT real del PDF (mínimo PDF válido)
  const pdf = Buffer.from("%PDF-1.4\n%%EOF\n", "utf8");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", Origin: ORIGIN },
    body: pdf,
  });
  const putAcao = put.headers.get("access-control-allow-origin");
  console.log(`\n[2] PUT real → ${put.status}`);
  console.log(`    Access-Control-Allow-Origin:  ${putAcao ?? "(ausente)"}`);
  const putOk = put.ok;

  // 3) Limpieza
  try {
    await deleteFile(storageKey);
    console.log(`\n[3] Objeto de prueba borrado ✅`);
  } catch (e) {
    console.log(`\n[3] ⚠️ No se pudo borrar el objeto de prueba (${storageKey}):`, e);
  }

  console.log("\n──────────────────────────────");
  if (preflightOk && putOk) {
    console.log("✅ CORS OK — la subida de contratos desde el browser va a funcionar.");
  } else {
    console.log("❌ CORS NO está bien configurada todavía:");
    if (!preflightOk)
      console.log("   · El preflight no devolvió Access-Control-Allow-Origin para el origen.");
    if (!putOk) console.log(`   · El PUT falló con status ${put.status}.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("❌ Error en la verificación:", e);
  process.exit(1);
});
