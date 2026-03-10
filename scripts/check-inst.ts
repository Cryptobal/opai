import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId: "clgard00000000000000001" },
    select: { name: true }
  });
  console.log(installations.map(i => i.name).sort());
}

main().catch(console.error).finally(() => prisma.$disconnect());
