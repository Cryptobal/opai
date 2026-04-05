import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";
import { auth } from "@/lib/auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user.tenantId;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el maximo de 10MB" },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten imagenes (JPEG, PNG, WEBP)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, file.type, "rondas", tenantId);

    return NextResponse.json({ success: true, data: { url: result.publicUrl, key: result.storageKey } });
  } catch (error) {
    console.error("[Portal Rondas] Upload error:", error);
    return NextResponse.json({ success: false, error: "Error al subir archivo" }, { status: 500 });
  }
}
