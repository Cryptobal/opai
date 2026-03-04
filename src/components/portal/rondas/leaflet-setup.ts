"use client";

// Import Leaflet CSS — must be loaded before any map renders
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon path issue with bundlers
import L from "leaflet";

// Fix default marker icons (bundlers break the default asset paths)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export { L };
