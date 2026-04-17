import { p, t, bold, tk, hClause } from "./helpers";

export const CLAUSE_5_QUINTA = [
  hClause(2, "quinta", [bold("QUINTA: Reajuste del Precio")]),
  // CASO 1: UF
  p([t('{{#if quote.currency=="UF"}}')]),
  p([
    t("Atendido que el precio del presente contrato se encuentra expresado en "),
    bold("Unidades de Fomento (UF)"),
    t(", las partes dejan constancia que el componente inflacionario del IPC queda "),
    bold("implícito en la variación diaria del valor de la UF"),
    t(" publicada por el Banco Central de Chile, no siendo necesario aplicar un reajuste adicional por dicho concepto. Sin perjuicio de lo anterior, el precio del servicio se reajustará conforme al siguiente mecanismo acumulativo:"),
  ]),
  p([
    bold("a) Incremento real anual: "),
    t("El precio mensual expresado en UF y el valor de la hora adicional se incrementarán cada 12 meses de contrato en un "),
    bold("3% real anual"),
    t(", destinado a cubrir los incrementos reales y beneficios del personal asignado que superen la variación cubierta por la UF."),
  ]),
  p([t('{{#if quote.adjustmentType=="POLYNOMIAL"}}')]),
  p([
    bold("b) Ajuste por polinomio IPC/IMO: "),
    t("Adicionalmente, el precio se reajustará "), tk("quote.adjustmentFreq"),
    t("mente mediante la aplicación de un polinomio compuesto por "),
    tk("quote.ipcWeight"),
    t(" de la variación del Índice de Precios al Consumidor (IPC) más "),
    tk("quote.imoWeight"),
    t(" de la variación del Índice de Mano de Obra (IMO), ambos publicados por el Instituto Nacional de Estadísticas (INE), aplicado sobre el precio UF vigente al inicio de cada período de reajuste."),
  ]),
  p([t("{{/if}}")]),
  p([
    bold("c) Reajuste por modificaciones legales y regulatorias: "),
    t("Se incluirá en carácter de reajuste sobre la tarifa el "),
    bold("100% de la variación"),
    t(" que imponga el Gobierno de Chile, el Congreso u otra autoridad competente en materia de costos remunerativos, cuyas normas se pongan en vigencia con posterioridad a la fecha del presente contrato. A modo enunciativo y no taxativo: "),
    bold("incrementos del salario mínimo"),
    t(", modificaciones al sistema de descanso, jornada, gratificación legal, seguros obligatorios, cotizaciones previsionales o de salud, o cualquier otra remuneración o beneficio que implique aumento de costos remunerativos."),
  ]),
  // CASO 2: CLP + POLINOMIO
  p([t('{{else}}{{#if quote.adjustmentType=="POLYNOMIAL"}}')]),
  p([
    t("Las partes acuerdan que el precio del servicio, expresado en pesos chilenos, se reajustará "),
    tk("quote.adjustmentFreq"),
    t("mente mediante la aplicación de un polinomio mixto compuesto por "),
    tk("quote.ipcWeight"),
    t(" de la variación del "), bold("Índice de Precios al Consumidor (IPC)"),
    t(" más "), tk("quote.imoWeight"),
    t(" de la variación del "), bold("Índice de Mano de Obra (IMO)"),
    t(", ambos publicados por el Instituto Nacional de Estadísticas (INE), aplicados sobre el precio base vigente al inicio de cada período de reajuste."),
  ]),
  p([
    bold("Incremento real anual: "),
    t("Adicionalmente, el precio y el valor de la hora adicional se incrementarán cada 12 meses de contrato en un "),
    bold("3% real anual"),
    t(", destinado a cubrir los incrementos reales y beneficios del personal."),
  ]),
  p([
    bold("Reajuste por modificaciones legales y regulatorias: "),
    t("Se incluirá en carácter de reajuste sobre la tarifa el "),
    bold("100% de la variación"),
    t(" que imponga el Gobierno u otra autoridad competente en materia de costos remunerativos (incrementos del salario mínimo, modificaciones de jornada, gratificación, cotizaciones, etc.), cuyas normas se pongan en vigencia con posterioridad a la fecha del presente contrato."),
  ]),
  // CASO 3: CLP + otro tipo
  p([t("{{else}}")]),
  p([
    t("Las partes acuerdan que el precio del servicio, expresado en pesos chilenos, se reajustará conforme al mecanismo acumulativo siguiente:"),
  ]),
  p([
    bold("a) Reajuste periódico: "),
    t("El precio se reajustará "), tk("quote.adjustmentFreq"),
    t("mente, de acuerdo a la variación del "), tk("quote.adjustmentType"),
    t(" publicado por el Instituto Nacional de Estadísticas (INE) en el período inmediatamente anterior."),
  ]),
  p([
    bold("b) Incremento real anual: "),
    t("Adicionalmente, el precio y el valor de la hora adicional se incrementarán cada 12 meses de contrato en un "),
    bold("3% real anual"),
    t(", destinado a cubrir los incrementos reales y beneficios del personal."),
  ]),
  p([
    bold("c) Reajuste por modificaciones legales y regulatorias: "),
    t("Se incluirá en carácter de reajuste sobre la tarifa el "),
    bold("100% de la variación"),
    t(" que imponga el Gobierno u otra autoridad competente en materia de costos remunerativos (incrementos del salario mínimo, modificaciones de jornada, gratificación, cotizaciones, etc.), cuyas normas se pongan en vigencia con posterioridad a la fecha del presente contrato."),
  ]),
  p([t("{{/if}}{{/if}}")]),
  p([
    t("En todos los casos, LA EMPRESA notificará a EL CLIENTE el nuevo precio reajustado con al menos "),
    bold("15 días"),
    t(" de anticipación a su entrada en vigencia, adjuntando el respaldo correspondiente. El reajuste se aplicará de pleno derecho, sin necesidad de acuerdo adicional."),
  ]),
];
