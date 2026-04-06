/**
 * API Route: /api/crm/users
 * GET - List mention options (special + groups + users)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

export async function GET() {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx);
  if (forbidden) return forbidden;

  const users = await prisma.admin.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "active",
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: { name: "asc" },
  });

  const groups = await prisma.adminGroup.findMany({
    where: {
      tenantId: ctx.tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      memberships: {
        where: {
          admin: {
            tenantId: ctx.tenantId,
            status: "active",
          },
        },
        select: {
          adminId: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: {
      special: [
        {
          id: "special_all",
          key: "all",
          label: "Todos",
          aliases: ["todos", "all"],
          token: "Todos",
        },
      ],
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        slug: group.slug,
        color: group.color,
        memberIds: group.memberships.map((membership) => membership.adminId),
        memberCount: group.memberships.length,
      })),
      users,
    },
  });
}
