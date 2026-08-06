"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/opai-ds";
import { FlowRowsConfigPanel } from "./FlowRowsConfigPanel";
import { CashflowConfigParamsPanel } from "./CashflowConfigParamsPanel";
import {
  coerceCashflowConfig,
  type AccountOption,
  type RawCashflowConfig,
} from "./cashflow-config-types";

type ConfigTab = "renglones" | "parametros";

interface Props {
  initialConfig: RawCashflowConfig;
  accountOptions: AccountOption[];
  unpaidReceivedDteCount?: number;
}

export function CashflowConfigClient({
  initialConfig,
  accountOptions,
  unpaidReceivedDteCount = 0,
}: Props) {
  const [config, setConfig] = useState(() => coerceCashflowConfig(initialConfig));
  const [tab, setTab] = useState<ConfigTab>("renglones");

  return (
    <div className="space-y-5">
      <SegmentedControl<ConfigTab>
        ariaLabel="Secciones de configuración de flujo de caja"
        value={tab}
        onChange={setTab}
        size="md"
        items={[
          { id: "renglones", label: "Renglones" },
          { id: "parametros", label: "Parámetros" },
        ]}
      />

      {tab === "renglones" && (
        <FlowRowsConfigPanel accountOptions={accountOptions} />
      )}

      {tab === "parametros" && (
        <CashflowConfigParamsPanel
          config={config}
          onConfigChange={setConfig}
          accountOptions={accountOptions}
          unpaidReceivedDteCount={unpaidReceivedDteCount}
        />
      )}
    </div>
  );
}
