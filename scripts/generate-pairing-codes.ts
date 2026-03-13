import { PrismaClient } from "@prisma/client";

const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const installations = await prisma.crmInstallation.findMany({
      where: { status: 'ACTIVE', pairingCode: null },
      select: { id: true, name: true },
    });

    console.log(`Found ${installations.length} active installations without pairing code`);

    let generated = 0;
    for (const inst of installations) {
      let code: string;
      let attempts = 0;
      while (true) {
        code = generatePairingCode();
        const existing = await prisma.crmInstallation.findUnique({
          where: { pairingCode: code },
        });
        if (!existing) break;
        attempts++;
        if (attempts > 10) throw new Error(`Too many collisions for ${inst.id}`);
      }

      await prisma.crmInstallation.update({
        where: { id: inst.id },
        data: { pairingCode: code },
      });
      generated++;
      console.log(`  [${generated}/${installations.length}] ${inst.name} → ${code}`);
    }

    console.log(`Done. Generated ${generated} pairing codes.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
