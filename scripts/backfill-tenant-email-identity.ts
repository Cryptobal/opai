/**
 * Congela la identidad de correo efectiva actual de cada tenant en Setting.
 *
 * Idempotente y aditivo: si el tenant ya tiene cualquiera de
 * empresa.emailFrom / emailFromName / emailReplyTo (formato nuevo o legado),
 * se omite (skip). Nunca sobrescribe valores existentes.
 *
 * Uso:
 *   npx tsx scripts/backfill-tenant-email-identity.ts          # dry-run
 *   npx tsx scripts/backfill-tenant-email-identity.ts --apply   # escribe
 *
 * NO ejecutar --apply contra producción sin dry-run previo y aprobación.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL_KEYS = [
  "empresa.emailFrom",
  "empresa.emailFromName",
  "empresa.emailReplyTo",
] as const;

const APPLY = process.argv.includes("--apply");

/** Parsea "Nombre <dir@dom>" — espejo de splitEmailFrom en platform-email.ts. */
function splitEmailFrom(value: string): { name: string; address: string } {
  const trimmed = (value || "").trim();
  if (!trimmed) return { name: "", address: "" };
  const match = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      address: match[2].trim(),
    };
  }
  if (trimmed.includes("@")) return { name: "", address: trimmed };
  return { name: trimmed, address: "" };
}

/** Remitente efectivo HOY (misma lógica pre-Bloque 2: env EMAIL_FROM). */
function resolveCurrentEffectiveFrom(): {
  emailFrom: string;
  emailFromName: string;
  emailFromAddress: string;
  emailReplyTo: string;
} {
  const emailFrom = process.env.EMAIL_FROM || "OPAI <noreply@opai.cl>";
  const emailFromAddress = process.env.EMAIL_FROM_ADDRESS || "";
  const emailFromName = "OPAI";
  const emailReplyTo = process.env.EMAIL_REPLY_TO || "";

  if (emailFromAddress) {
    const name = emailFromName || splitEmailFrom(emailFrom).name || "OPAI";
    return {
      emailFrom: `${name} <${emailFromAddress}>`,
      emailFromName: name,
      emailFromAddress,
      emailReplyTo,
    };
  }

  const parsed = splitEmailFrom(emailFrom);
  return {
    emailFrom,
    emailFromName: parsed.name || emailFromName,
    emailFromAddress: parsed.address,
    emailReplyTo,
  };
}

function shortKey(key: string, tenantId: string): string {
  const prefix = `empresa:${tenantId}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true, active: true },
    orderBy: { slug: "asc" },
  });

  const effective = resolveCurrentEffectiveFrom();
  console.log(
    `\n[backfill-tenant-email-identity] mode=${APPLY ? "APPLY" : "DRY-RUN"}`,
  );
  console.log(
    `[backfill-tenant-email-identity] effective fallback: ${effective.emailFrom}`,
  );
  console.log(
    `[backfill-tenant-email-identity] tenants: ${tenants.length}\n`,
  );

  let skipped = 0;
  let written = 0;

  console.log(
    [
      "slug".padEnd(24),
      "status".padEnd(8),
      "action".padEnd(8),
      "emailFrom",
      "emailFromName",
      "emailReplyTo",
    ].join(" | "),
  );
  console.log("-".repeat(120));

  for (const tenant of tenants) {
    const newKeys = EMAIL_KEYS.map((k) => `empresa:${tenant.id}:${k}`);
    const settings = await prisma.setting.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { key: { in: newKeys } },
          { key: { in: [...EMAIL_KEYS] } },
        ],
      },
      select: { key: true, value: true },
    });

    const present = new Set(
      settings.map((s) => shortKey(s.key, tenant.id)).filter((k) =>
        (EMAIL_KEYS as readonly string[]).includes(k)
      ),
    );

    if (present.size > 0) {
      skipped += 1;
      const existingFrom =
        settings.find((s) => shortKey(s.key, tenant.id) === "empresa.emailFrom")
          ?.value ?? "";
      const existingName =
        settings.find(
          (s) => shortKey(s.key, tenant.id) === "empresa.emailFromName",
        )?.value ?? "";
      const existingReply =
        settings.find(
          (s) => shortKey(s.key, tenant.id) === "empresa.emailReplyTo",
        )?.value ?? "";
      console.log(
        [
          tenant.slug.padEnd(24),
          (tenant.active ? "active" : "susp").padEnd(8),
          "skip".padEnd(8),
          existingFrom || "(present)",
          existingName,
          existingReply,
        ].join(" | "),
      );
      continue;
    }

    const rows = [
      {
        key: "empresa.emailFrom",
        value: effective.emailFromAddress,
      },
      {
        key: "empresa.emailFromName",
        value: effective.emailFromName,
      },
      {
        key: "empresa.emailReplyTo",
        value: effective.emailReplyTo,
      },
    ];

    console.log(
      [
        tenant.slug.padEnd(24),
        (tenant.active ? "active" : "susp").padEnd(8),
        (APPLY ? "write" : "would").padEnd(8),
        rows[0].value,
        rows[1].value,
        rows[2].value || "(empty)",
      ].join(" | "),
    );

    if (APPLY) {
      for (const row of rows) {
        const fullKey = `empresa:${tenant.id}:${row.key}`;
        await prisma.setting.upsert({
          where: {
            tenantId_key: { tenantId: tenant.id, key: fullKey },
          },
          create: {
            tenantId: tenant.id,
            key: fullKey,
            value: row.value,
            type: "string",
            category: "empresa",
          },
          update: {
            // Idempotente: no sobrescribir si apareció entre dry-run y apply
            // (el skip ya cubre presencia; update no-op con mismo value).
            value: row.value,
            type: "string",
            category: "empresa",
          },
        });
      }
      try {
        const { clearTenantCompanyConfigCache } = await import(
          "../src/lib/tenant-config"
        );
        clearTenantCompanyConfigCache(tenant.id);
      } catch {
        // clearTenantCompanyConfigCache usa next/cache; en CLI puede fallar.
      }
    }

    written += 1;
  }

  console.log("\n--- summary ---");
  console.log(`total:   ${tenants.length}`);
  console.log(`skip:    ${skipped}`);
  console.log(`${APPLY ? "written" : "would write"}: ${written}`);
  console.log(
    `resulting from (frozen): "${effective.emailFromName} <${effective.emailFromAddress}>"`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-tenant-email-identity] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
