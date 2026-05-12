/**
 * Prueba end-to-end de presigned PUT a R2.
 * Replica exactamente lo que hace el browser:
 *   1. Pide presigned URL con la función del server.
 *   2. fetch(uploadUrl, { method: 'PUT', headers: {'Content-Type': ...}, body })
 * Si R2 devuelve 200 → el flujo del browser también va a funcionar.
 *
 * Uso: npx tsx scripts/test-r2-presigned.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getPresignedUploadUrl, deleteFile } from "../src/lib/storage";

async function main() {
  console.log("→ Pidiendo presigned URL…");
  const presign = await getPresignedUploadUrl({
    fileName: "test-r2-presigned.pdf",
    mimeType: "application/pdf",
    prefix: "contracts",
    tenantId: "clgard00000000000000001",
  });
  console.log("  storageKey:", presign.storageKey);
  console.log("  uploadUrl (params):");
  const url = new URL(presign.uploadUrl);
  for (const [k, v] of url.searchParams.entries()) {
    console.log(`    ${k}=${k === "X-Amz-Signature" ? v.slice(0, 10) + "…" : v}`);
  }

  const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
  console.log("\n  SignedHeaders:", signedHeaders);
  if (signedHeaders.includes("content-disposition")) {
    console.error("  ⚠️  content-disposition está firmado — el browser tendrá que mandarlo");
  }

  // Body dummy de PDF (~1KB)
  const body = Buffer.from("%PDF-1.4\n%test\n" + "A".repeat(1024));

  console.log("\n→ Haciendo PUT como lo hace el browser (sólo Content-Type)…");
  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body,
  });
  console.log("  status:", putRes.status, putRes.statusText);
  const text = await putRes.text();
  if (text) console.log("  body:", text.slice(0, 500));

  if (putRes.ok) {
    console.log("\n✓ Upload OK. Limpiando…");
    await deleteFile(presign.storageKey);
    console.log("✓ Archivo borrado.");
  } else {
    console.error("\n✗ Upload falló.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
