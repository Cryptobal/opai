/**
 * AWS Rekognition service for Face ID.
 * Encapsulates all communication with AWS Rekognition for facial recognition.
 *
 * Uses the simplified approach (photo + SearchFacesByImage) without Amplify.
 * Liveness detection can be added in a future sprint if needed.
 */

import {
  RekognitionClient,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";

const COLLECTION_ID =
  process.env.AWS_REKOGNITION_COLLECTION_ID || "gard-guardias";
const FACE_MATCH_THRESHOLD = 95; // Minimum confidence for a match
const MIN_FACE_QUALITY_BRIGHTNESS = 40;
const MIN_FACE_QUALITY_SHARPNESS = 40;

function getClient(): RekognitionClient {
  const region = process.env.AWS_REGION || "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Rekognition"
    );
  }

  return new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export interface FaceDetectionResult {
  hasFace: boolean;
  faceCount: number;
  quality: {
    brightness: number;
    sharpness: number;
  } | null;
  error?: string;
}

export interface FaceRegistrationResult {
  success: boolean;
  faceId?: string;
  error?: string;
}

export interface FaceVerificationResult {
  match: boolean;
  confidence: number;
  guardiaId?: string;
  faceId?: string;
  error?: string;
}

/**
 * Detect faces in an image and validate quality.
 * Used before registration or verification to ensure the image is usable.
 */
export async function detectFace(
  imageBuffer: Buffer
): Promise<FaceDetectionResult> {
  const client = getClient();

  const response = await client.send(
    new DetectFacesCommand({
      Image: { Bytes: imageBuffer },
      Attributes: ["ALL"],
    })
  );

  const faces = response.FaceDetails ?? [];

  if (faces.length === 0) {
    return { hasFace: false, faceCount: 0, quality: null, error: "No se detectó ningún rostro en la imagen" };
  }

  if (faces.length > 1) {
    return { hasFace: true, faceCount: faces.length, quality: null, error: "Se detectaron múltiples rostros. Solo debe aparecer una persona" };
  }

  const face = faces[0];
  const brightness = face.Quality?.Brightness ?? 0;
  const sharpness = face.Quality?.Sharpness ?? 0;

  if (brightness < MIN_FACE_QUALITY_BRIGHTNESS) {
    return {
      hasFace: true,
      faceCount: 1,
      quality: { brightness, sharpness },
      error: "La imagen es muy oscura. Acércate a una fuente de luz",
    };
  }

  if (sharpness < MIN_FACE_QUALITY_SHARPNESS) {
    return {
      hasFace: true,
      faceCount: 1,
      quality: { brightness, sharpness },
      error: "La imagen está borrosa. Mantén la cámara estable",
    };
  }

  return {
    hasFace: true,
    faceCount: 1,
    quality: { brightness, sharpness },
  };
}

/**
 * Register a guard's face in the Rekognition collection.
 * ExternalImageId is set to the guardiaId for lookup.
 */
export async function registerFace(
  guardiaId: string,
  imageBuffer: Buffer
): Promise<FaceRegistrationResult> {
  const client = getClient();

  // First detect face quality
  const detection = await detectFace(imageBuffer);
  if (!detection.hasFace || detection.error) {
    return { success: false, error: detection.error || "No se detectó un rostro válido" };
  }

  const response = await client.send(
    new IndexFacesCommand({
      CollectionId: COLLECTION_ID,
      Image: { Bytes: imageBuffer },
      ExternalImageId: guardiaId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
      DetectionAttributes: ["DEFAULT"],
    })
  );

  const indexedFaces = response.FaceRecords ?? [];

  if (indexedFaces.length === 0) {
    return {
      success: false,
      error: "No se pudo registrar el rostro. La calidad de la imagen es insuficiente",
    };
  }

  const faceId = indexedFaces[0].Face?.FaceId;
  if (!faceId) {
    return { success: false, error: "Error al obtener el ID del rostro" };
  }

  return { success: true, faceId };
}

/**
 * Verify a face against the Rekognition collection.
 * Returns the matched guardiaId if confidence >= threshold.
 */
export async function verifyFace(
  imageBuffer: Buffer
): Promise<FaceVerificationResult> {
  const client = getClient();

  // Detect face quality first
  const detection = await detectFace(imageBuffer);
  if (!detection.hasFace || detection.error) {
    return { match: false, confidence: 0, error: detection.error || "No se detectó un rostro válido" };
  }

  const response = await client.send(
    new SearchFacesByImageCommand({
      CollectionId: COLLECTION_ID,
      Image: { Bytes: imageBuffer },
      MaxFaces: 1,
      FaceMatchThreshold: FACE_MATCH_THRESHOLD,
      QualityFilter: "AUTO",
    })
  );

  const matches = response.FaceMatches ?? [];

  if (matches.length === 0) {
    return { match: false, confidence: 0, error: "Rostro no reconocido" };
  }

  const bestMatch = matches[0];
  const confidence = bestMatch.Similarity ?? 0;
  const guardiaId = bestMatch.Face?.ExternalImageId;
  const faceId = bestMatch.Face?.FaceId;

  return {
    match: confidence >= FACE_MATCH_THRESHOLD,
    confidence,
    guardiaId: guardiaId ?? undefined,
    faceId: faceId ?? undefined,
  };
}

/**
 * Delete a face from the Rekognition collection.
 * Used when deactivating a guard (90-120 days post-termination).
 */
export async function deleteFace(awsFaceId: string): Promise<void> {
  const client = getClient();

  await client.send(
    new DeleteFacesCommand({
      CollectionId: COLLECTION_ID,
      FaceIds: [awsFaceId],
    })
  );
}
