"use client";

import { useState } from "react";
import { PageHeader } from "@/components/opai-ds/PageHeader";
import { ChipTabs } from "@/components/ui/chip-tabs";
import {
  GamificacionDashboard,
  BadgesManagement,
  DesafiosManagement,
  FondosManagement,
  BeneficiosManagement,
} from "@/components/gamification/admin";
import { BarChart3, Award, Target, DollarSign, Gift } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "badges", label: "Badges", icon: Award },
  { id: "desafios", label: "Desafíos", icon: Target },
  { id: "fondos", label: "Fondos", icon: DollarSign },
  { id: "beneficios", label: "Beneficios", icon: Gift },
];

export function GamificacionAdminClient() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Gamificación"
        description="Trust Score, puntos, badges, desafíos, fondos y beneficios"
        backHref="/personas/guardias"
        backLabel="Personas"
      />
      <ChipTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "dashboard" && <GamificacionDashboard />}
      {activeTab === "badges" && <BadgesManagement />}
      {activeTab === "desafios" && <DesafiosManagement />}
      {activeTab === "fondos" && <FondosManagement />}
      {activeTab === "beneficios" && <BeneficiosManagement />}
    </div>
  );
}
