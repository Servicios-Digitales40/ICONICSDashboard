/**
 * Qué máquina entra en un reporte cuando nadie la nombra (Plan 44 F3.4).
 *
 * ── POR QUÉ LO DECIDE EL CÓDIGO Y NO EL MODELO ──────────────────────
 *
 * Medido el 23-09-2026 con el modelo real (`scripts/medir-tipo-de-reporte.mjs`):
 * en 7 de 14 frases sin máquina el modelo escribía `sistema: "tanque"` porque
 * la descripción de la herramienta decía «por omisión "tanque"», y el tanque
 * está cerrado. El reporte se negaba por una máquina que el usuario nunca
 * nombró. La omisión la resuelve esto: la ÚNICA configurada en servicio, si
 * la hay; con varias, `null` y la herramienta pregunta; sin ninguna, `null`.
 *
 * En módulo propio y sin importar nada de `reportes/` porque lo usa también el
 * catálogo de siempre (`historicos/index.mjs`) al arrancar, y todo lo demás de
 * esta carpeta carga pdfkit, que sólo se importa de forma diferida.
 */
import { SISTEMA } from '../../../shared/eva/comun/sistemas.js'

/** Las máquinas configuradas en servicio, ahora (el registro cambia en caliente). */
export function configuradasEnServicio() {
  return Object.values(SISTEMA).filter((s) => s?.configurada && !s.cerrado)
}

/** La única configurada en servicio, o `null`. */
export function sistemaPorOmision() {
  const candidatas = configuradasEnServicio()
  return candidatas.length === 1 ? candidatas[0] : null
}
