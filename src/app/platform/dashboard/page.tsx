import { permanentRedirect } from "next/navigation";

export default function PlatformDashboardRedirect() {
  permanentRedirect("/platform");
}
