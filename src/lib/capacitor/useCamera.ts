"use client";

import { useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface PhotoResult {
  dataUrl: string;
  format: string;
}

export function useCamera() {
  const takePhoto = useCallback(async (): Promise<PhotoResult | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      if (photo.dataUrl) {
        return { dataUrl: photo.dataUrl, format: photo.format };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async (): Promise<PhotoResult | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });
      if (photo.dataUrl) {
        return { dataUrl: photo.dataUrl, format: photo.format };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return { takePhoto, pickFromGallery };
}
