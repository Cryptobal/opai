import { uploadFile } from "@/lib/storage";

const MAX_IMAGE_SIZE = 1_000_000; // 1MB safety limit

/**
 * Sube una foto de evidencia de marcación a R2.
 * @returns URL pública o null si falla
 */
export async function uploadMarcacionPhoto(
  imageBase64: string,
  guardiaId: string,
  tipo: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn("[marcacion-photo] Image exceeds 1MB, skipping upload");
      return null;
    }
    const fileName = `${guardiaId}-${tipo}-${Date.now()}.jpg`;
    const result = await uploadFile(buffer, fileName, "image/jpeg", "marcaciones");
    return result.publicUrl;
  } catch (error) {
    console.error("[marcacion-photo] Error uploading to R2:", error);
    return null;
  }
}
