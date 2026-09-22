/**
 * La máquina de vibraciones CONFIGURADA, derivada del catálogo escrito a mano.
 *
 * ── POR QUÉ ES UN MÓDULO Y NO SÓLO UN GUION (Plan 39 F0) ───────────
 *
 * Hasta el 21-09-2026 esta derivación vivía entera en
 * `generar-configuracion-vibraciones.mjs`, y la única forma de tener una
 * configurada en una prueba era ejecutar ese guion como proceso y leer su
 * JSON (`verificar-vibraciones-configurada.mjs` lo hace así). Servía para
 * comparar las dos entradas, pero no para EJERCITAR las herramientas del
 * asistente sobre una configurada: `verificar-herramientas` y
 * `verificar-chat` no tenían ninguna, y todo lo que el Plan 39 abre se habría
 * probado sólo contra planta.
 *
 * La derivación se saca aquí, pura —sin argv, sin escritura, sin red— y el
 * guion la llama. Los dos verificadores la importan y la registran en el
 * proceso con `registrarSistema`, con lo que el transporte falso le da valores
 * sin cambiar nada: sus puntos son los MISMOS tags que la escrita a mano, y
 * `sistemaDePunto()` los atribuye a ésta, que sí tiene física simulada.
 *
 * ── `verificadasDelCatalogo`: SÓLO PARA EL TRANSPORTE FALSO ─────────
 *
 * `crearVariable()` fuerza `historyVerified: false` a propósito: una serie se
 * promete después de sondearla, nunca por venir en un JSON (ver la cabecera
 * del guion). Contra el transporte FALSO ese sondeo no dice nada —el falso
 * sirve exactamente las series que el catálogo declara historizadas—, así que
 * una prueba puede darlas por verificadas sin heredar ninguna verificación de
 * planta: hereda la del simulador, que es la única que hay ahí. El guion no
 * pasa esta opción; contra planta se sondea (`--sondear`).
 */
import {
  crearMaquina,
  crearVariable,
} from '../../shared/eva/comun/configuracionMaquina.js'
import { SISTEMA } from '../../shared/eva/comun/sistemas.js'
import {
  BANDERAS,
  CALIDADES,
  MEDIDAS,
  VARIADOR,
  VIGILANCIAS,
} from '../../shared/eva/vibraciones/vibraciones.js'
import { rolDe } from '../../shared/eva/tipos/vibraciones.js'

export const ID_ESPEJO = 'vibraciones-configurada'

/**
 * De qué familia es una clave del catálogo, para nombrar su rol.
 *
 * Se busca en los cinco catálogos en vez de deducirlo del nombre, y el orden
 * importa: `aviso` está en BANDERAS y en VARIADOR, y los dos son roles
 * distintos con ámbitos distintos (ver `tipos/vibraciones.js`). Aquí se
 * desempata por el CANAL —una clave con canal es de apoyo, sin canal es de la
 * máquina—, que es el dato que el catálogo ya trae y no hay que adivinar.
 */
function familiaDe(clave, canal) {
  const enApoyo = [
    ['medida', MEDIDAS],
    ['bandera', BANDERAS],
    ['calidad', CALIDADES],
    ['vigilancia', VIGILANCIAS],
  ]

  if (canal) {
    for (const [familia, catalogo] of enApoyo) {
      if (catalogo.some(x => x.key === clave)) return familia
    }
    return null
  }

  return VARIADOR.some(x => x.key === clave) ? 'variador' : null
}

/**
 * La clave de dominio de una variable derivada: `vRMS_S1`, `frecuencia`.
 *
 * Es la misma que usa el catálogo (`clave_canal` para los apoyos, la clave
 * suelta para el variador), para que `etiquetaDe` y `series.punto` del origen
 * se puedan consultar con ella tal cual.
 */
const idDeDominio = (clave, canal) => (canal ? `${clave}_${canal}` : clave)

/**
 * Deriva la configurada espejo.
 *
 * @param {object} [opciones]
 * @param {boolean} [opciones.verificadasDelCatalogo=false]  Marca como
 *   verificadas las series que el catálogo declara historizadas. SÓLO para el
 *   transporte falso; ver la cabecera.
 * @returns {{ configurada: object, sinRol: object[], verificadas: Set<string> }}
 */
export function configuracionEspejo({ verificadasDelCatalogo = false } = {}) {
  const ORIGEN = SISTEMA.vibraciones
  const variables = []
  const sinRol = []

  for (const punto of ORIGEN.puntos()) {
    const d = ORIGEN.parse(punto)
    if (!d) continue

    const id = idDeDominio(d.clave, d.canal)
    const familia = familiaDe(d.clave, d.canal)
    const rol = familia ? rolDe(familia, d.clave) : null

    /*
     * Los contadores de alarma (`ae:`) no tienen rol en el tipo: no son una
     * medida de la máquina, son del servidor de alarmas. Se configuran igual
     * —hay que leerlos— pero sin rol, y por eso se cuentan aparte en vez de
     * inventarles uno.
     */
    if (!rol) sinRol.push({ punto, clave: d.clave, tipo: d.tipo })

    variables.push(
      crearVariable({
        id,
        pointName: punto,
        /* LITERAL, nunca derivado del nombre en vivo: no se deduce por regla
           fija, y deducirlo es el defecto B10 de este proyecto. */
        historyPointName: ORIGEN.series.punto(id),
        rol,
        descripcion: ORIGEN.etiquetaDe(id),
        alias: ORIGEN.aliasDe?.(id) ?? [],
        assetId: d.canal ?? null,
      }),
    )
  }

  const verificadas = new Set(ORIGEN.series.historizadas())

  const configurada = crearMaquina({
    id: ID_ESPEJO,
    nombre: `${ORIGEN.nombre} (configurada)`,
    tipo: 'vibraciones',
    plc: ORIGEN.plc,
    cadenciaMs: ORIGEN.cadenciaMs,
    assets: ORIGEN.raices.map((pointName, i) => ({
      id: pointName,
      pointName,
      rol: i === 0 ? 'raiz' : 'secundario',
    })),
    variables,
    limitaciones: [
      'Configuración DERIVADA del catálogo escrito a mano (Plan 33 F4). Existe para ' +
        'comparar las dos, no para sustituirlo: el módulo original sigue siendo el que ' +
        'sirve esta máquina.',
      /*
       * Este texto cambió con el Plan 34 F2: hasta el 21-09-2026 decía que las
       * series se daban por verificadas «heredando el sondeo del 28-08-2026».
       * Ya no se heredan — y menos mal: aquel sondeo se había hecho contra un
       * grupo del historiador que a día de hoy no existe.
       */
      'Sus series se verifican SONDEÁNDOLAS con `--sondear`: se pide cada una al servidor y se ' +
        'comparan entre sí, porque el historiador puede devolver la serie de otra señal sin dar ' +
        'error. Sin esa bandera ninguna queda verificada, que es el valor seguro.',
    ],
  })

  /* Después de `crearMaquina`, que es quien fuerza `historyVerified: false`:
     ver la cabecera sobre por qué esto sólo vale contra el transporte falso. */
  if (verificadasDelCatalogo) {
    for (const v of configurada.variables) {
      if (verificadas.has(v.id) && v.historyPointName) v.historyVerified = true
    }
  }

  return { configurada, sinRol, verificadas }
}
