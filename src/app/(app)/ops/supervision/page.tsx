import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { currentYearMonthInChile } from "@/lib/dates-cl";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { SupervisionGrilla } from "@/components/supervision/SupervisionGrilla";

export default async function OpsSupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const params = await searchParams;
  const chileNow = currentYearMonthInChile();
  const year = params.year ? parseInt(params.year) : chileNow.year;
  const month = params.month ? parseInt(params.month) : chileNow.month;

  return (
    <div className="min-w-0">
      <SupervisionGrilla year={year} month={month} />
    </div>
  );
}
