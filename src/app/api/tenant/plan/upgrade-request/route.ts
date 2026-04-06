import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { resend } from '@/lib/resend';

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { tenantId, userEmail } = ctx;

  const body = await request.json();
  const { requestedPlan, requestedAddons, message } = body as {
    requestedPlan?: string;
    requestedAddons?: string[];
    message?: string;
  };

  if (!requestedPlan && (!requestedAddons || requestedAddons.length === 0)) {
    return NextResponse.json(
      { error: 'Debe solicitar un plan o al menos un add-on' },
      { status: 400 },
    );
  }

  const [tenant, currentPlan] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    prisma.tenantPlan.findUnique({ where: { tenantId }, select: { plan: true } }),
  ]);

  const platformAdmins = await prisma.platformAdmin.findMany({
    where: { status: 'active' },
    select: { email: true },
  });

  const adminEmails = platformAdmins.map((a) => a.email);
  if (adminEmails.length === 0) {
    console.error('[UPGRADE-REQUEST] No platform admins found to notify');
    return NextResponse.json({ success: true });
  }

  await resend.emails.send({
    from: 'OPAI Platform <noreply@opai.cl>',
    to: adminEmails,
    subject: `Solicitud de upgrade: ${tenant?.name ?? tenantId}`,
    html: `
      <h2>Solicitud de upgrade</h2>
      <p><strong>Tenant:</strong> ${tenant?.name} (${tenant?.slug})</p>
      <p><strong>Plan actual:</strong> ${currentPlan?.plan ?? 'sin plan'}</p>
      ${requestedPlan ? `<p><strong>Plan solicitado:</strong> ${requestedPlan}</p>` : ''}
      ${requestedAddons?.length ? `<p><strong>Add-ons solicitados:</strong> ${requestedAddons.join(', ')}</p>` : ''}
      ${message ? `<p><strong>Mensaje:</strong> ${message}</p>` : ''}
      <p><strong>Solicitado por:</strong> ${userEmail}</p>
      <hr>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.opai.cl'}/platform/tenants/${tenantId}">Ver tenant en Platform Admin</a></p>
    `,
  });

  return NextResponse.json({ success: true });
}
