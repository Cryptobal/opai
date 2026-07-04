/**
 * Configura la política CORS del bucket R2.
 *
 * PORQUÉ: la subida de contratos (AccountContractsSection → /api/storage/
 * presigned-upload) hace un PUT directo del browser a R2 vía URL pre-firmada,
 * para saltarse el límite de body de Vercel (~4.5MB) y permitir PDFs de hasta
 * 25MB. R2 sólo devuelve el header `Access-Control-Allow-Origin` en ese PUT
 * cross-origin si el bucket tiene una política CORS. Sin ella, el browser
 * bloquea el PUT ("blocked by CORS policy: No 'Access-Control-Allow-Origin'").
 *
 * Este script aplica (idempotente) la política que permite el PUT/GET desde
 * los orígenes de la app. Volver a correrlo reemplaza la política completa.
 *
 * Uso:
 *   npx tsx scripts/set-r2-cors.ts            # aplica y verifica
 *   npx tsx scripts/set-r2-cors.ts --print    # sólo muestra la política actual
 *
 * Orígenes extra (además de los default) por env, separados por coma:
 *   R2_CORS_EXTRA_ORIGINS="https://foo.vercel.app,https://bar.opai.cl"
 */
import "dotenv/config";
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";

// La app es multi-tenant: cada cliente entra por su propio subdominio
// (www.opai.cl, opai.gard.cl, y otros a futuro). Enumerarlos es frágil, así
// que por default permitimos cualquier origen. NO debilita la seguridad: el
// PUT sólo funciona con una URL pre-firmada que el server genera tras
// autenticar; sin ella nadie sube nada (y con ella se podría subir por curl
// igual, sin pasar por CORS). Para restringir a orígenes explícitos, pasar
// R2_CORS_EXTRA_ORIGINS y quitar el "*".
const DEFAULT_ORIGINS = ["*"];

function getClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY son requeridos",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME no configurado");
  return bucket;
}

function buildOrigins(): string[] {
  const extra = (process.env.R2_CORS_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Si se pasan orígenes explícitos, usar SÓLO esos (permite restringir sin
  // editar el script). Si no, el default "*".
  const origins = extra.length > 0 ? extra : DEFAULT_ORIGINS;
  // "*" es excluyente: R2 no mezcla wildcard con orígenes específicos.
  return origins.includes("*") ? ["*"] : Array.from(new Set(origins));
}

async function main() {
  const client = getClient();
  const bucket = getBucket();

  if (process.argv.includes("--print")) {
    try {
      const res = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
      console.log(JSON.stringify(res.CORSRules, null, 2));
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name === "NoSuchCORSConfiguration") {
        console.log("(sin política CORS configurada)");
      } else {
        throw e;
      }
    }
    return;
  }

  const origins = buildOrigins();
  const rule: CORSRule = {
    AllowedOrigins: origins,
    AllowedMethods: ["GET", "PUT", "HEAD"],
    // "*" evita cualquier mismatch en el preflight (el browser sólo manda
    // content-type en el PUT firmado, pero "*" cubre variaciones futuras).
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  };

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: [rule] },
    }),
  );
  console.log(`✅ CORS aplicado al bucket "${bucket}" para orígenes:`);
  origins.forEach((o) => console.log(`   · ${o}`));

  const verify = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log("\nPolítica vigente:");
  console.log(JSON.stringify(verify.CORSRules, null, 2));
}

main().catch((e) => {
  console.error("❌ Error configurando CORS:", e);
  process.exit(1);
});
