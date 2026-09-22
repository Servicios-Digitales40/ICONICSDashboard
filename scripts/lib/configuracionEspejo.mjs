/**
 * La máquina de vibraciones CONFIGURADA de prueba: la «espejo».
 *
 * ── DE DÓNDE SALE, Y POR QUÉ YA NO SE DERIVA (Plan 40 F3) ──────────
 *
 * Hasta el 21-09-2026 se DERIVABA en cada arranque del catálogo escrito a mano
 * (`SISTEMA.vibraciones`): sus puntos, sus etiquetas, sus nombres en el
 * historiador. Ese catálogo se retira con el Plan 40 —la máquina de
 * vibraciones existe sólo configurada— así que la derivación se congeló UNA
 * vez en `vibraciones-espejo.json`, con el conocimiento que el catálogo llevaba
 * dentro: las 36 series que estaban verificadas por sondeo van en
 * `seriesVerificadasPorCatalogo`, y el transporte falso sirve exactamente
 * esas. Es una fixture, no una derivación: si cambia, cambia a la vista.
 *
 * La usan `verificar-herramientas`, `verificar-chat`, `verificar-transporte-
 * falso` y `verificar-vibraciones-configurada`, que la registran en su proceso
 * con `registrarSistema`; y `sembrar-espejo.mjs`, que la escribe en
 * `MAQUINAS_RUTA` para quien arranque el tablero sin planta.
 *
 * ── `verificadasDelCatalogo`: SÓLO PARA EL TRANSPORTE FALSO ─────────
 *
 * En planta una serie se promete después de sondearla, nunca por venir en un
 * JSON (`crearVariable` fuerza `historyVerified: false`, y el tablero sondea).
 * Contra el transporte FALSO ese sondeo no dice nada: el falso sirve las
 * series de la lista. Con la opción se marcan verificadas; sin ella, ninguna
 * —que es como llega una máquina recién configurada—.
 */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'vibraciones-espejo.json'), 'utf8'))

export const ID_ESPEJO = FIXTURE.maquina.id

/**
 * La espejo, como una máquina recién leída de `maquinas.json`.
 *
 * @param {object} [opciones]
 * @param {boolean} [opciones.verificadasDelCatalogo=false]  Marca como
 *   verificadas las series que el catálogo tenía sondeadas. SÓLO para el
 *   transporte falso; ver la cabecera.
 * @returns {{ configurada: object, sinRol: object[], verificadas: Set<string> }}
 */
export function configuracionEspejo({ verificadasDelCatalogo = false } = {}) {
  const configurada = structuredClone(FIXTURE.maquina)
  configurada.creada = new Date().toISOString()
  configurada.revisada = null

  const verificadas = new Set(FIXTURE.seriesVerificadasPorCatalogo)
  for (const v of configurada.variables) {
    v.historyVerified = Boolean(verificadasDelCatalogo && verificadas.has(v.id) && v.historyPointName)
  }

  const sinRol = configurada.variables
    .filter((v) => !v.rol)
    .map((v) => ({ punto: v.pointName, clave: v.id, tipo: v.pointName.startsWith('ae:') ? 'alarma' : 'sensor' }))

  return { configurada, sinRol, verificadas }
}

/**
 * Escribe un `maquinas.json` con la espejo, para un backend que arranca con
 * `MAQUINAS_RUTA` apuntando ahí (los verificadores que montan la app entera:
 * el registro de arranque QUITA toda configurada registrada a mano y vuelve a
 * leer el archivo, así que registrar en el proceso no basta).
 *
 * @param {string} ruta
 * @param {object} [opciones]  las de `configuracionEspejo`
 * @returns {Promise<object>} la configurada escrita
 */
export async function escribirEspejoEn(ruta, opciones = { verificadasDelCatalogo: true }) {
  const { configurada } = configuracionEspejo(opciones)
  configurada.estado = 'VALID'
  configurada.revisada = new Date().toISOString()
  await mkdir(dirname(ruta), { recursive: true })
  await writeFile(ruta, `${JSON.stringify({ version: 1, maquinas: [configurada] }, null, 2)}\n`, 'utf8')
  return configurada
}
