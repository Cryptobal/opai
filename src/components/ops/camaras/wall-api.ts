export async function createLayout(
  name: string,
  gridSize: number,
  cameraIds: string[],
  reload: () => Promise<void>,
) {
  await fetch("/api/ops/camaras/layouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, gridSize, cameraIds }),
  });
  await reload();
}

export async function deleteLayout(id: string, after: () => void) {
  await fetch(`/api/ops/camaras/layouts/${id}`, { method: "DELETE" });
  after();
}
