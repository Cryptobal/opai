import type { Metadata } from "next";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";

export const metadata: Metadata = {
  title: "OPAI - Bienvenido",
  description: "Selecciona tu perfil para continuar",
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return <WelcomeScreen />;
}
