import { decryptText, encryptText } from "@/lib/crypto";

export function getCameraCredentialsSecret(): string {
  const secret = process.env.CAMERA_CREDENTIALS_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      "CAMERA_CREDENTIALS_SECRET no está definido. Configura esta variable para cifrar credenciales de cámaras.",
    );
  }
  return secret;
}

export function encryptCameraSecret(plain: string): string {
  return encryptText(plain, getCameraCredentialsSecret());
}

export function decryptCameraSecret(payload: string): string {
  return decryptText(payload, getCameraCredentialsSecret());
}

/** Quita URLs RTSP y claves embebidas de mensajes de error persistidos. */
export function sanitizeCameraError(message: string): string {
  return message
    .replace(/rtsp:\/\/\S+/gi, "rtsp://***")
    .replace(/:[^:@/\s]+@/g, ":***@")
    .slice(0, 300);
}
