import { PrismaClient } from "@prisma/client";
import { GROUP_SEEDS } from "../../src/lib/groups";
import { TICKET_TYPE_SEEDS } from "../../src/lib/tickets";

const prisma = new PrismaClient();

export async function seedGroupsAndTicketTypes(tenantId: string) {
  console.log("  Seeding groups...");

  // Upsert each group seed and build slug -> id map
  const groupMap: Record<string, string> = {};

  for (const seed of GROUP_SEEDS) {
    const group = await prisma.adminGroup.upsert({
      where: {
        tenantId_slug: { tenantId, slug: seed.slug },
      },
      update: {
        name: seed.name,
        description: seed.description,
        color: seed.color,
        isSystem: seed.isSystem,
        isActive: seed.isActive,
      },
      create: {
        tenantId,
        slug: seed.slug,
        name: seed.name,
        description: seed.description ?? null,
        color: seed.color,
        isSystem: seed.isSystem,
        isActive: seed.isActive,
      },
    });
    groupMap[seed.slug] = group.id;
    console.log(`    Group "${seed.name}" -> ${group.id}`);
  }

  console.log("  Seeding ticket types...");

  for (const seed of TICKET_TYPE_SEEDS) {
    const ticketType = await prisma.opsTicketType.upsert({
      where: {
        tenantId_slug: { tenantId, slug: seed.slug },
      },
      update: {
        name: seed.name,
        description: seed.description,
        origin: seed.origin,
        requiresApproval: seed.requiresApproval,
        assignedTeam: seed.assignedTeam,
        defaultPriority: seed.defaultPriority,
        slaHours: seed.slaHours,
        icon: seed.icon,
        isActive: true,
      },
      create: {
        tenantId,
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        origin: seed.origin,
        requiresApproval: seed.requiresApproval,
        assignedTeam: seed.assignedTeam,
        defaultPriority: seed.defaultPriority,
        slaHours: seed.slaHours,
        icon: seed.icon,
        isActive: true,
        sortOrder: TICKET_TYPE_SEEDS.indexOf(seed) + 1,
      },
    });

    // Delete existing approval steps and recreate
    await prisma.opsTicketTypeApprovalStep.deleteMany({
      where: { ticketTypeId: ticketType.id },
    });

    for (let i = 0; i < seed.approvalChainGroupSlugs.length; i++) {
      const groupSlug = seed.approvalChainGroupSlugs[i];
      const groupId = groupMap[groupSlug];
      if (!groupId) {
        console.warn(
          `    WARNING: Group slug "${groupSlug}" not found for ticket type "${seed.slug}"`
        );
        continue;
      }
      await prisma.opsTicketTypeApprovalStep.create({
        data: {
          ticketTypeId: ticketType.id,
          stepOrder: i + 1,
          approverType: "group",
          approverGroupId: groupId,
          label: `Aprobacion ${groupSlug}`,
          isRequired: true,
        },
      });
    }

    console.log(
      `    TicketType "${seed.name}" (${seed.approvalChainGroupSlugs.length} approval steps)`
    );
  }

  console.log(
    `  Seeded ${GROUP_SEEDS.length} groups, ${TICKET_TYPE_SEEDS.length} ticket types`
  );
}
