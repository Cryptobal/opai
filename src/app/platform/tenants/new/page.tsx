"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlatformUi } from "@/components/platform/PlatformUiProvider";

export default function NewTenantFallbackPage() {
  const { openCreateTenant } = usePlatformUi();
  const router = useRouter();
  useEffect(() => {
    openCreateTenant();
    router.replace("/platform/tenants");
  }, [openCreateTenant, router]);
  return null;
}
