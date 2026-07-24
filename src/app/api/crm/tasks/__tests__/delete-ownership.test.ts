/**
 * RBAC DELETE /api/crm/tasks/[id] — solo creador o admin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const requireTasksAccessMock = vi.fn();
const taskFindFirst = vi.fn();
const taskDelete = vi.fn();
const auditTaskActionMock = vi.fn();

vi.mock("@/lib/api-auth-tareas", () => ({
  requireTasksAccess: requireTasksAccessMock,
  canDeleteTask: (ctx: { userId: string; userRole: string }, task: { createdBy: string | null }) => {
    if (ctx.userRole === "owner" || ctx.userRole === "admin") return true;
    return Boolean(task.createdBy && task.createdBy === ctx.userId);
  },
  taskDeleteForbidden: () =>
    new Response(JSON.stringify({ success: false, error: "Solo el creador de la tarea puede eliminarla" }), {
      status: 403,
    }),
}));

vi.mock("@/lib/audit-productividad", () => ({
  auditTaskAction: auditTaskActionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmTask: {
      findFirst: taskFindFirst,
      delete: taskDelete,
    },
  },
}));

const CTX = {
  userId: "creator-1",
  tenantId: "tenant-1",
  userEmail: "c@test.cl",
  userRole: "supervisor",
};

function req(): NextRequest {
  return new Request("http://x/api/crm/tasks/t1", { method: "DELETE" }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTasksAccessMock.mockResolvedValue({ authorized: true, ctx: CTX });
  taskDelete.mockResolvedValue({});
});

describe("DELETE /api/crm/tasks/[id]", () => {
  it("403 si el usuario no es el creador", async () => {
    taskFindFirst.mockResolvedValue({ id: "t1", createdBy: "other", title: "X" });
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(req(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    expect(taskDelete).not.toHaveBeenCalled();
  });

  it("200 si el usuario es el creador", async () => {
    taskFindFirst.mockResolvedValue({ id: "t1", createdBy: CTX.userId, title: "X" });
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(req(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    expect(taskDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(auditTaskActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deleted", taskId: "t1" }),
    );
  });
});
