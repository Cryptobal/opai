/** Regla compartida UI + API: solo el creador o owner/admin puede eliminar una tarea. */
export function canDeleteTarea(
  task: { createdBy?: string | null },
  userId: string,
  userRole: string,
): boolean {
  if (userRole === "owner" || userRole === "admin") return true;
  return Boolean(task.createdBy && task.createdBy === userId);
}
