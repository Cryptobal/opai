/**
 * Batch geocoding script for existing guards with address but no coordinates.
 *
 * Usage:  npx tsx prisma/scripts/geocode-guardias.ts
 *
 * Requires GOOGLE_MAPS_API_KEY in .env with Geocoding API enabled.
 * Rate-limited to ~10 req/s (100ms delay) to stay well within the 50 req/s quota.
 * Idempotent: skips guards that already have lat/lng.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DELAY_MS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const encoded = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&components=country:CL&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "OK" && data.results.length > 0) {
    return data.results[0].geometry.location as { lat: number; lng: number };
  }
  if (data.status !== "ZERO_RESULTS") {
    console.warn(`[Geocode] API status: ${data.status}`, data.error_message ?? "");
  }
  return null;
}

async function main() {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("[Geocode] GOOGLE_MAPS_API_KEY no está definida en .env");
    process.exit(1);
  }

  const personas = await prisma.opsPersona.findMany({
    where: {
      addressFormatted: { not: null },
      lat: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      addressFormatted: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    `[Geocode] ${personas.length} guardias con dirección sin coordenadas`,
  );

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const persona of personas) {
    const addr = persona.addressFormatted?.trim();
    if (!addr || addr.length < 5) {
      skipped++;
      continue;
    }

    try {
      const coords = await geocodeAddress(addr);

      if (coords) {
        await prisma.opsPersona.update({
          where: { id: persona.id },
          data: {
            lat: new Prisma.Decimal(coords.lat),
            lng: new Prisma.Decimal(coords.lng),
            addressSource: "batch_geocode",
          },
        });
        success++;
        console.log(
          `[✓] ${persona.firstName} ${persona.lastName}: ${coords.lat}, ${coords.lng}`,
        );
      } else {
        failed++;
        console.log(
          `[✗] ${persona.firstName} ${persona.lastName}: No se pudo geocodificar "${addr}"`,
        );
      }
    } catch (error) {
      failed++;
      console.error(
        `[!] ${persona.firstName} ${persona.lastName}: Error`,
        error,
      );
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\n[Geocode] Completado: ${success} éxito, ${failed} fallidos, ${skipped} saltados`,
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
