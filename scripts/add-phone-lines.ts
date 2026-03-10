import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATA = [
  { instName: "Embajada Brasil", phone: "+56931906580" },
  { instName: "Polpaico Mejillones", phone: "+56953675548" },
  { instName: "Metropolitan", phone: "+56953675562" },
  { instName: "Bodega Santa Amalia", phone: "+56958255919" },
  { instName: "No reconocido", phone: "+56958257089" },
  { instName: "Jugabet", phone: "+56958258717" },
  { instName: "Polpaico coronel", phone: "+56962913871" },
  { instName: "Chañaral", phone: "+56983496903" },
  { instName: "Chañaral", phone: "+56983775976" },
  { instName: "Polpaico el bosque", phone: "+56987842836" },
  { instName: "Paper requinoa", phone: "+56971540108" },
  { instName: "Scrb san bernardo", phone: "+56971540211" },
  { instName: "Paper graneros", phone: "+56958098914" },
  { instName: "Paper graneros", phone: "+56971539815" },
  { instName: "Transmat", phone: "+56973056019" },
  { instName: "Cims", phone: "+56971539887" },
  { instName: "Polpaico quilicura", phone: "+56953675646" },
];

async function main() {
  const tenantId = "clgard00000000000000001";

  for (const item of DATA) {
    const { instName, phone } = item;
    const cleanPhone = phone.replace(/\s+/g, "");

    // look for installation
    const installations = await prisma.crmInstallation.findMany({
      where: {
        tenantId,
        name: { contains: instName, mode: "insensitive" }
      }
    });

    let installationId = null;
    if (installations.length >= 1) {
      installationId = installations[0].id;
    }

    try {
      const line = await prisma.inventoryPhoneLine.upsert({
        where: { tenantId_phoneNumber: { tenantId, phoneNumber: cleanPhone } },
        update: { carrier: "Movistar", planType: "Contrato", status: "active" },
        create: { tenantId, phoneNumber: cleanPhone, carrier: "Movistar", planType: "Contrato", status: "active" }
      });

      if (installationId) {
        // check existing
        const existingAssignments = await prisma.inventoryPhoneLineAssignment.findMany({
          where: { tenantId, phoneLineId: line.id, returnedAt: null }
        });
        const isAssigned = existingAssignments.some(a => a.installationId === installationId);
        if (!isAssigned) {
          for (const a of existingAssignments) {
            await prisma.inventoryPhoneLineAssignment.update({
              where: { id: a.id },
              data: { returnedAt: new Date() }
            });
          }
          await prisma.inventoryPhoneLineAssignment.create({
            data: { tenantId, phoneLineId: line.id, installationId, assignedBy: "admin" }
          });
        }
      }
    } catch (e) {
      console.error(`Error processing ${cleanPhone}:`, e);
    }
  }

  console.log("Done adding missing lines.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
