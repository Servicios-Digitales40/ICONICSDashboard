/**
 * prototypes/comparativo/scenarios.js
 * ------------------------------------------------------------------
 * Generador de ESCENARIOS para el banco de pruebas del comparativo.
 *
 * Separado del registro de variantes (`variants.js`) a propósito: este
 * archivo es JS puro, sin JSX ni React, y por tanto se puede ejecutar y
 * verificar directamente con `node`. El registro importa componentes y
 * no lo permitiría.
 *
 * Su razón de ser: una disposición solo se puede juzgar viéndola
 * resolver TODOS los estados del veredicto, no solo el caso feliz. Un
 * layout que luce impecable con "+7.2 pts" y se descuadra con "sin
 * cambio significativo" o "sin datos" no sirve — y ese defecto no se
 * detecta mirando la propuesta bonita.
 */
import { addDays, isoDay } from "@/features/machines/lib/compare.js";
import { getMachineSnapshot } from "@/lib/machines.js";

/**
 * Busca, dentro del histórico determinista, pares de fechas REALES que
 * produzcan cada uno de los estados que el veredicto sabe emitir.
 *
 * Se usan fechas reales en vez de snapshots inventados: así las
 * tendencias por hora son coherentes con los valores del resumen y los
 * prototipos se ven con datos que podrían ocurrir de verdad.
 */
export function buildScenarios(machine, todayIso = isoDay(new Date())) {
  const snapB = getMachineSnapshot(machine, todayIso);

  // Candidatas: los últimos 180 días, con su OEE ya resuelto.
  const candidatas = [];
  for (let i = 1; i <= 180; i++) {
    const iso = addDays(todayIso, -i);
    candidatas.push({ iso, oee: getMachineSnapshot(machine, iso).oee });
  }

  const buscar = (test) => candidatas.find((c) => test(snapB.oee - c.oee))?.iso ?? addDays(todayIso, -7);

  return [
    {
      id: "mejora",
      label: "Mejora clara",
      hint: "B muy por encima de A — el caso feliz",
      dateA: buscar((d) => d >= 6),
      dateB: todayIso,
    },
    {
      id: "caida",
      label: "Caída",
      hint: "B por debajo de A — verde y coral invertidos",
      dateA: buscar((d) => d <= -6),
      dateB: todayIso,
    },
    {
      id: "plano",
      label: "Sin cambio significativo",
      hint: "Delta dentro de la zona muerta — no debe pintarse de verde",
      dateA: buscar((d) => Math.abs(d) < 0.6),
      dateB: todayIso,
    },
    {
      id: "mixto",
      label: "Mixto",
      hint: "OEE se mueve poco pero los factores se compensan entre sí",
      dateA: buscar((d) => Math.abs(d) >= 1 && Math.abs(d) <= 2.5),
      dateB: todayIso,
    },
    {
      id: "sindatos",
      label: "Sin datos en B",
      hint: "Estado degradado: el layout no debe romperse",
      dateA: addDays(todayIso, -7),
      dateB: todayIso,
      missingB: true,
    },
  ];
}
