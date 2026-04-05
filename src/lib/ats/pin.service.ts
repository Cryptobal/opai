import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export function generarPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function asignarPin(guardiaId: string): Promise<string> {
  const pin = generarPin();
  const hash = await bcrypt.hash(pin, 10);
  await prisma.opsGuardia.update({
    where: { id: guardiaId },
    data: {
      marcacionPin: hash,
      marcacionPinVisible: pin,
    },
  });
  return pin;
}

export async function cambiarPin(guardiaId: string, nuevoPin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(nuevoPin)) throw new Error("El PIN debe tener entre 4 y 6 dígitos");
  const hash = await bcrypt.hash(nuevoPin, 10);
  await prisma.opsGuardia.update({
    where: { id: guardiaId },
    data: { marcacionPin: hash, marcacionPinVisible: nuevoPin },
  });
}

export async function verificarPin(guardiaId: string, pin: string): Promise<boolean> {
  const g = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: { marcacionPin: true, marcacionPinVisible: true },
  });
  if (!g) return false;

  if (g.marcacionPin?.startsWith("$2")) {
    return bcrypt.compare(pin, g.marcacionPin);
  }
  return g.marcacionPinVisible === pin || g.marcacionPin === pin;
}
