import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.crmContact.findMany({
    where: {
      portalPinVisible: { not: null },
      portalPin: null,
      portalEnabled: true,
    },
    select: { id: true, email: true, portalPinVisible: true },
  });

  console.log(`Found ${candidates.length} contacts with plaintext PIN to migrate`);

  let migrated = 0;
  for (const c of candidates) {
    if (!c.portalPinVisible) continue;
    const hashed = await bcrypt.hash(c.portalPinVisible, 10);
    await prisma.crmContact.update({
      where: { id: c.id },
      data: { portalPin: hashed, portalPinVisible: null },
    });
    migrated++;
    if (migrated % 50 === 0) console.log(`  ${migrated}/${candidates.length}`);
  }

  console.log(`✅ Migrated ${migrated} contacts. portalPinVisible cleared.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
