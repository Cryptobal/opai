import { permanentRedirect } from "next/navigation";

export default function PricingRedirect() {
  permanentRedirect("/platform/catalog");
}
