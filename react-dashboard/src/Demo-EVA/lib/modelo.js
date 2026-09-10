/**
 * Derivaciones que necesita la vista de Planta, sobre un `Sistema` ya
 * construido. Funciones puras, sin React y sin tema.
 *
 * El sistema LLEGA POR PARÁMETRO desde `useSistemaAgua()`. Este archivo no sabe
 * si viene de ICONICS o del simulador, y esa ignorancia es el requisito: es lo
 * que permite probarlo entero en node con lecturas fijas.
 *
 * ── QUÉ SUSTITUYE A QUÉ ────────────────────────────────────────────
 *
 * La vista de Planta reutiliza la ARQUITECTURA visual de «Planta · v2», así que
 * cada derivación de aquí ocupa el hueco de una de allá:
 *
 *   `atencion`   ← la franja de atención  · mismo papel, otro criterio
 *   `destacadas` ← la banda de 4 KPIs     · las 4 señales con serie propia
 *   `margenes`   ← el Pareto de rechazos  · dónde está la tensión del sistema
 *
 * Lo que NO tiene equivalente y desaparece: el reparto de producción, el FTY y
 * los tiempos de paro. No es que se hayan simplificado — es que este servidor
 * no publica ni piezas ni tiempos, y rellenarlos sería inventarlos.
 */
import { pideAtencion } from "../domain/estado.js";
import { historizadasMedidas } from "../domain/senales.js";

/**
 * Señales que piden que alguien mire ahora, de peor a mejor y agrupadas por
 * estado. Devuelve `[]` cuando no hay nada, y entonces la franja NO se pinta:
 * una alerta que se enciende siempre deja de leerse en una semana.
 *
 * `sin_dato` no entra a propósito, igual que en la v2 de Resonac: con el
 * servidor caído encendería la franja de forma permanente, y la ausencia de
 * lectura ya tiene su propio tratamiento dentro de cada tarjeta.
 */
export function atencion(sistema) {
  const orden = ["critico", "atencion"];

  return orden
    .map((estado) => ({
      estado,
      severidad: estado === "critico" ? "critico" : "aviso",
      senales: sistema.lista
        .filter((s) => s.estado === estado)
        .map((s) => ({ key: s.key, label: s.label, corto: s.corto, activo: s.activo })),
    }))
    .filter((a) => a.senales.length > 0 && pideAtencion(a.estado));
}

/**
 * La banda de KPIs: las señales con serie propia en el historiador que
 * ADEMÁS son una medida —nunca una alarma, un mando, una consigna, un crudo
 * sin escalar o un estado enumerado, ver `historizadasMedidas`—.
 *
 * No es una elección estética. Un stat tile lleva sparkline y `Cifra` con
 * `.toFixed()` por contrato: son magnitudes continuas, no un 0/1. Eran
 * CUATRO señales, y sólo esas, mientras `esHistorizada` e `historizadasMedidas`
 * fueron la misma lista (hasta el Plan 27 F6, 10-09-2026) — historizar
 * cuarenta y cinco señales más, la mayoría booleanas, separó las dos
 * preguntas. Las que no entran aquí viven en la tarjeta de su activo, donde
 * su propio estado (Manual/Automático, Abierto/Cerrado…) se lee mejor que en
 * un sparkline.
 */
export const destacadas = (sistema) => {
  const medidas = new Set(historizadasMedidas());
  return sistema.lista.filter((s) => medidas.has(s.key));
};

/**
 * Márgenes consumidos, de mayor a menor. Es lo que sustituye al Pareto.
 *
 * ── POR QUÉ NO HAY COLUMNA DE ACUMULADO ────────────────────────────
 *
 * Un Pareto acumula porque sus barras son partes de un total —piezas rechazadas
 * de todas las rechazadas— y la pregunta es «cuántos equipos cubren el 80 %».
 * Un margen consumido **no es parte de nada**: son siete magnitudes distintas
 * comparadas cada una contra SU banda. Sumarlas daría un número sin significado,
 * así que la columna de la derecha dice la banda en la que cae cada señal, que
 * es lo que sí informa.
 *
 * Se excluyen las booleanas (no tienen banda), las que están sin dato —un
 * hueco no consume margen, y ponerlo a 0 lo pintaría como la señal más
 * tranquila del sistema— y las que están en reposo: con la bomba parada,
 * caudal y eficiencia en 0 es lo esperado, no un consumo real de margen (la
 * fórmula pura mide distancia al límite duro sin saber que el sistema está
 * apagado, y las marcaría con el peor valor de toda la lista).
 */
export function margenes(sistema) {
  return sistema.lista
    .filter(
      (s) =>
        s.tipo !== "booleano" &&
        s.margen !== null &&
        s.estado !== "sin_dato" &&
        s.estado !== "reposo",
    )
    .map((s) => ({
      key: s.key,
      nombre: s.corto,
      activo: s.activo,
      estado: s.estado,
      valor: s.margen,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Variación entre las dos últimas muestras de una serie. `null` si no hay dos.
 * Alimenta el delta de los stat tiles.
 */
export const delta = (serie) => (serie?.length >= 2 ? serie.at(-1) - serie.at(-2) : null);

/**
 * Punto de entrada único: todo lo que la vista necesita, en una llamada
 * memoizable sobre el sistema activo.
 */
export function buildModeloEva(sistema) {
  return {
    atencion: atencion(sistema),
    destacadas: destacadas(sistema),
    margenes: margenes(sistema),
  };
}
