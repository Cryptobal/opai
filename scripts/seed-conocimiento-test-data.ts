/**
 * Seeds a few installations / protocol sections / exams / assignments
 * for manually testing the Personas → Conocimiento module.
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gard \
 *   DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gard \
 *   npx tsx scripts/seed-conocimiento-test-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) throw new Error("tenant gard not found — run prisma db seed first");
  const tenantId = tenant.id;

  // 1. Account
  const account = await prisma.crmAccount.upsert({
    where: { id: "00000000-0000-0000-0000-000000000aa1" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000aa1",
      tenantId,
      name: "Edificio Demo Corp",
      isActive: true,
    },
  });

  // 2. Installations (3)
  const installations: Array<{ id: string; name: string; commune: string; icon: string }> = [
    { id: "00000000-0000-0000-0000-000000000bb1", name: "Edificio Corporativo Central", commune: "Providencia", icon: "🏢" },
    { id: "00000000-0000-0000-0000-000000000bb2", name: "Bodega Industrial Norte", commune: "Quilicura", icon: "🏭" },
    { id: "00000000-0000-0000-0000-000000000bb3", name: "Centro Comercial Plaza Sur", commune: "Las Condes", icon: "🛒" },
  ];

  for (const inst of installations) {
    await prisma.crmInstallation.upsert({
      where: { id: inst.id },
      update: {},
      create: {
        id: inst.id,
        tenantId,
        accountId: account.id,
        name: inst.name,
        commune: inst.commune,
        status: "active",
      },
    });
  }

  // 3. Protocol sections (only first 2 installations). Section IDs are cuid()-ish strings.
  const sectionsByInst: Record<string, Array<{ id: string; title: string; icon: string }>> = {
    [installations[0].id]: [
      { id: "demo-sec-acc1", title: "Control de Acceso", icon: "🚪" },
      { id: "demo-sec-eme1", title: "Emergencias", icon: "🚨" },
      { id: "demo-sec-ron1", title: "Rondas", icon: "🚶" },
    ],
    [installations[1].id]: [
      { id: "demo-sec-acc2", title: "Control de Acceso", icon: "🚪" },
      { id: "demo-sec-eme2", title: "Emergencias", icon: "🚨" },
    ],
    // installations[2] => no protocol
  };

  for (const [instId, sections] of Object.entries(sectionsByInst)) {
    for (const [order, s] of sections.entries()) {
      await prisma.protocolSection.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          installationId: instId,
          title: s.title,
          icon: s.icon,
          order,
        },
      });
      // 1 dummy item per section
      await prisma.protocolItem.upsert({
        where: { id: `${s.id}-itm` },
        update: {},
        create: {
          id: `${s.id}-itm`,
          sectionId: s.id,
          title: `Item base de ${s.title}`,
          description: "Item de prueba.",
          order: 0,
        },
      });
    }
  }

  // 4. Persona + guards (4)
  const guards: Array<{ guardId: string; firstName: string; lastName: string }> = [
    { guardId: "00000000-0000-0000-0000-000000000cc1", firstName: "Carlos", lastName: "Ramirez" },
    { guardId: "00000000-0000-0000-0000-000000000cc2", firstName: "María", lastName: "Soto" },
    { guardId: "00000000-0000-0000-0000-000000000cc3", firstName: "Juan", lastName: "Pérez" },
    { guardId: "00000000-0000-0000-0000-000000000cc4", firstName: "Ana", lastName: "Lopez" },
  ];

  for (const g of guards) {
    const personaId = g.guardId.replace("000000000c", "000000000d");
    await prisma.opsPersona.upsert({
      where: { id: personaId },
      update: {},
      create: {
        id: personaId,
        tenantId,
        firstName: g.firstName,
        lastName: g.lastName,
        status: "active",
      },
    });
    await prisma.opsGuardia.upsert({
      where: { id: g.guardId },
      update: {},
      create: {
        id: g.guardId,
        tenantId,
        personaId,
        status: "active",
        lifecycleStatus: "active",
      },
    });
  }

  // 5. Puestos + asignaciones (3 in inst[0], 2 in inst[1], 0 in inst[2])
  const puestos = [
    { id: "00000000-0000-0000-0000-000000000ee1", instId: installations[0].id, name: "Turno día — Hall principal" },
    { id: "00000000-0000-0000-0000-000000000ee2", instId: installations[1].id, name: "Turno noche — Portería" },
  ];
  for (const p of puestos) {
    await prisma.opsPuestoOperativo.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        tenantId,
        installationId: p.instId,
        name: p.name,
        shiftStart: "08:00",
        shiftEnd: "20:00",
        weekdays: ["mon", "tue", "wed", "thu", "fri"],
        requiredGuards: 2,
        active: true,
      },
    });
  }

  const asigns: Array<{ id: string; guardId: string; instId: string; puestoId: string; slot: number }> = [
    { id: "00000000-0000-0000-0000-000000000aa1", guardId: guards[0].guardId, instId: installations[0].id, puestoId: puestos[0].id, slot: 1 },
    { id: "00000000-0000-0000-0000-000000000aa2", guardId: guards[1].guardId, instId: installations[0].id, puestoId: puestos[0].id, slot: 2 },
    { id: "00000000-0000-0000-0000-000000000aa3", guardId: guards[2].guardId, instId: installations[1].id, puestoId: puestos[1].id, slot: 1 },
    { id: "00000000-0000-0000-0000-000000000aa4", guardId: guards[3].guardId, instId: installations[1].id, puestoId: puestos[1].id, slot: 2 },
  ];
  for (const a of asigns) {
    await prisma.opsAsignacionGuardia.upsert({
      where: { id: a.id },
      update: { isActive: true },
      create: {
        id: a.id,
        tenantId,
        guardiaId: a.guardId,
        installationId: a.instId,
        puestoId: a.puestoId,
        slotNumber: a.slot,
        startDate: new Date("2025-01-01"),
        isActive: true,
      },
    });
  }

  // 6. Exams + questions per (inst with sections)
  for (const [instId, sections] of Object.entries(sectionsByInst)) {
    const examId = `demo-exam-${instId.slice(-3)}`;
    await prisma.exam.upsert({
      where: { id: examId },
      update: {},
      create: {
        id: examId,
        installationId: instId,
        title: `Examen del protocolo`,
        type: "protocol",
        status: "active",
        scheduleType: "manual",
        passingScore: 60,
        createdBy: "system",
      },
    });
    let order = 0;
    for (const s of sections) {
      for (let i = 0; i < 2; i++) {
        const qid = `${s.id}-q${i}`;
        await prisma.examQuestion.upsert({
          where: { id: qid },
          update: {},
          create: {
            id: qid,
            examId,
            questionText: `${s.title} — pregunta ${i + 1}`,
            questionType: "multiple_choice",
            options: ["A", "B", "C", "D"],
            correctAnswer: 0,
            sectionRef: s.id,
            order: order++,
            source: "manual",
          },
        });
      }
    }
  }

  // 7. Assignments + scores
  // inst[0]: Carlos high (90), María borderline (65)
  // inst[1]: Juan low (45) failed, Ana pending
  const assigns: Array<{ id: string; examId: string; guardId: string; status: string; score: number | null; pending?: boolean; answers?: number[] }> = [
    { id: "demo-assign-1", examId: `demo-exam-${installations[0].id.slice(-3)}`, guardId: guards[0].guardId, status: "completed", score: 90, answers: [0, 0, 0, 0, 0, 0] },
    { id: "demo-assign-2", examId: `demo-exam-${installations[0].id.slice(-3)}`, guardId: guards[1].guardId, status: "completed", score: 65, answers: [0, 1, 0, 1, 0, 1] },
    { id: "demo-assign-3", examId: `demo-exam-${installations[1].id.slice(-3)}`, guardId: guards[2].guardId, status: "completed", score: 45, answers: [1, 1, 1, 1] },
    { id: "demo-assign-4", examId: `demo-exam-${installations[1].id.slice(-3)}`, guardId: guards[3].guardId, status: "sent", score: null },
  ];

  for (const a of assigns) {
    await prisma.examAssignment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        examId: a.examId,
        guardId: a.guardId,
        status: a.status,
        score: a.score,
        answers: a.answers as unknown as object | undefined,
        sentAt: new Date(Date.now() - 10 * 86400000),
        completedAt: a.status === "completed" ? new Date(Date.now() - 7 * 86400000) : null,
      },
    });
  }

  // 8. Protocol version (just inst[0])
  await prisma.protocolVersion.upsert({
    where: { id: "demo-pv-1" },
    update: {},
    create: {
      id: "demo-pv-1",
      installationId: installations[0].id,
      versionNumber: 1,
      status: "published",
      snapshot: {} as object,
      publishedAt: new Date(),
      publishedBy: "system",
    },
  });

  console.log("✅ Seed Conocimiento listo");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
