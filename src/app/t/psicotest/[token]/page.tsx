import { verifyPsychInvitation } from "@/lib/psych/invitation-token";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import PsychWizard from "@/components/psych/public/PsychWizard";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export default async function PsychPublicPage({ params }: PageProps) {
  const { token } = await params;

  try {
    const verified = await verifyPsychInvitation(token);
    const a = await prisma.psychAssessment.findUnique({
      where: { id: verified.aid },
      select: { id: true, status: true, expiresAt: true, invitationToken: true },
    });
    if (!a || a.invitationToken !== token) redirect("/t/psicotest/expired");
    if (a.status === "EXPIRED" || a.expiresAt.getTime() < Date.now()) {
      redirect("/t/psicotest/expired");
    }
    if (a.status === "SUBMITTED" || a.status === "SCORED" || a.status === "REVIEWED") {
      redirect("/t/psicotest/thanks");
    }
  } catch {
    redirect("/t/psicotest/expired");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <PsychWizard token={token} />
    </main>
  );
}
