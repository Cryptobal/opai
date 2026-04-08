import type { Metadata } from "next";
import { getPortalClientePageMetadata } from "@/lib/portal-cliente-metadata";
import { PortalClienteClient } from "./PortalClienteClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return getPortalClientePageMetadata(sp);
}

export default function PortalClientePage() {
  return <PortalClienteClient />;
}
