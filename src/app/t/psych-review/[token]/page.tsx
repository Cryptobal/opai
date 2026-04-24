import { redirect } from "next/navigation";
import { verifyPsychReviewToken } from "@/lib/psych/review-token";
import { prisma } from "@/lib/prisma";
import PsychReviewClient from "@/components/psych/review/PsychReviewClient";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisión psicolaboral" };

export default async function PsychReviewPage({ params }: PageProps) {
  const { token } = await params;
  try {
    const v = await verifyPsychReviewToken(token);
    const a = await prisma.psychAssessment.findUnique({
      where: { id: v.aid },
      include: { result: { select: { reviewRequestToken: true, reviewRequestExpires: true } } },
    });
    if (!a?.result || a.result.reviewRequestToken !== token) {
      redirect("/t/psych-review/expired");
    }
    if (a.result.reviewRequestExpires && a.result.reviewRequestExpires.getTime() < Date.now()) {
      redirect("/t/psych-review/expired");
    }
  } catch {
    redirect("/t/psych-review/expired");
  }
  return (
    <main className="min-h-screen bg-background">
      <PsychReviewClient token={token} />
    </main>
  );
}
