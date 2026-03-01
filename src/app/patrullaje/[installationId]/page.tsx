import { prisma } from "@/lib/prisma";
import { PatrullajeClient } from "./PatrullajeClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ installationId: string }>;
}

export default async function PatrullajePage({ params }: Props) {
  const { installationId } = await params;

  const installation = await prisma.crmInstallation.findFirst({
    where: { id: installationId, isActive: true },
    select: {
      id: true,
      name: true,
      address: true,
      commune: true,
      lat: true,
      lng: true,
      geoRadiusM: true,
      tenantId: true,
    },
  });

  if (!installation) return notFound();

  return (
    <PatrullajeClient
      installation={{
        id: installation.id,
        name: installation.name,
        address: installation.address,
        commune: installation.commune,
        lat: installation.lat,
        lng: installation.lng,
        tenantId: installation.tenantId,
      }}
    />
  );
}
