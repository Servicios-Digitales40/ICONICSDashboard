/**
 * El CATÁLOGO de vibraciones con la forma que tenía la entrada escrita a mano.
 * Referencia de prueba, no una máquina del registro.
 *
 * ── PARA QUÉ EXISTE (Plan 40 F3) ───────────────────────────────────
 *
 * Tres verificadores comparaban una máquina CONFIGURADA con la entrada
 * escrita a mano `SISTEMA.vibraciones` («la configuración reproduce el
 * catálogo»). Esa entrada se retiró; el catálogo que la definía —tags,
 * nombres del historiador, lista blanca de series, etiquetas, física— sigue
 * en `shared/eva/vibraciones/`, porque es la definición del TIPO y de la
 * instalación de la demo. Aquí se vuelve a armar con la misma forma que tenía
 * la entrada, para que esas comparaciones sigan diciendo lo mismo: que una
 * configurada derivada del catálogo no se distingue de él en nada de lo que
 * el registro consume.
 *
 * NO se registra en `SISTEMAS`: es un objeto de comparación. Registrarlo
 * volvería a tener la máquina dos veces, que es lo que el Plan 40 deshizo.
 * Las funciones de etiqueta son copia literal de las que tenía la entrada;
 * cambiar aquí sin cambiar la configuración espejo haría fallar las
 * comparaciones, que es lo que se quiere.
 */
import { estadoDeVibraciones } from './estadoVibraciones.js'
import { valorVibracionEn } from './simuladorVibraciones.js'
import {
  AREA_ALARMAS,
  BANDERAS,
  CALIDADES,
  CANALES,
  MEDIDAS,
  RAIZ_VIB,
  VARIADOR,
  esHistorizada,
  historizadas,
  parsePunto,
  puntoHistorico,
  todosLosPuntos,
} from './vibraciones.js'

function familiaDeClave(base) {
  return (
    MEDIDAS.find((x) => x.key === base) ??
    BANDERAS.find((x) => x.key === base) ??
    CALIDADES.find((x) => x.key === base) ??
    null
  )
}

function partir(clave) {
  const corte = clave.lastIndexOf('_')
  const base = clave.slice(0, corte)
  const canal = CANALES.find((x) => x.id === clave.slice(corte + 1)) ?? null
  return { base, canal }
}

export const CATALOGO_VIBRACIONES = Object.freeze({
  id: 'catalogo-vibraciones',
  nombre: 'Catálogo de vibraciones (referencia)',
  maquina: 'Motor WEG W22 143/5T vigilado por un SIPLUS CMS1200 SM 1281',
  plc: 'PLC_2 · ua:DEMO3',
  limitaciones: [],
  cadenciaMs: 5_000,

  raices: [RAIZ_VIB, AREA_ALARMAS],
  puntos: todosLosPuntos,
  parse: parsePunto,
  modelo: valorVibracionEn,

  /* Las TRES familias que tienen serie: medidas, banderas y calidades por
     apoyo, más el variador. Vigilancias y sensor se quedan fuera, como en la
     entrada original. */
  claves: () => [
    ...CANALES.flatMap((c) => [
      ...MEDIDAS.map((m) => `${m.key}_${c.id}`),
      ...BANDERAS.map((b) => `${b.key}_${c.id}`),
      ...CALIDADES.map((q) => `${q.key}_${c.id}`),
    ]),
    ...VARIADOR.map((v) => v.key),
  ],

  aliasDe: (clave) => {
    const v = VARIADOR.find((x) => x.key === clave)
    if (v) return [v.key, v.label]
    const { base, canal: c } = partir(clave)
    if (!c) return []
    const f = familiaDeClave(base)
    if (!f) return []
    const numero = c.sufijo.replace(/\D/g, '')
    const apoyos = [c.id, c.label, `sensor ${numero}`, `apoyo ${numero}`]
    const nombres = [f.corto, f.label].filter(Boolean)
    return nombres.flatMap((nom) => apoyos.map((ap) => `${nom} ${ap}`))
  },

  etiquetaDe: (clave) => {
    const v = VARIADOR.find((x) => x.key === clave)
    if (v) return v.label
    const { base, canal: c } = partir(clave)
    if (!c) return null
    const f = familiaDeClave(base)
    return f ? `${f.label} · ${c.label}` : null
  },

  metaDe: (clave) => {
    const v = VARIADOR.find((x) => x.key === clave)
    if (v) return { label: v.label, unidad: v.unidad ?? '', decimales: v.decimales ?? 3, naturaleza: 'medida' }
    const { base, canal: c } = partir(clave)
    if (!c) return null
    const m = MEDIDAS.find((x) => x.key === base)
    if (m) return { label: `${m.label} · ${c.label}`, unidad: m.unidad ?? '', decimales: m.decimales ?? 3, naturaleza: 'medida' }
    const b = BANDERAS.find((x) => x.key === base)
    if (b) {
      return {
        label: `${b.label} · ${c.label}`,
        unidad: '',
        decimales: b.tipo === 'real' ? 3 : 0,
        naturaleza: b.tipo === 'booleano' ? 'alarma' : 'medida',
      }
    }
    const q = CALIDADES.find((x) => x.key === base)
    if (q) return { label: `${q.label} · ${c.label}`, unidad: '', decimales: 0, naturaleza: 'medida' }
    return null
  },

  esHistorizada,
  series: { historizadas, punto: puntoHistorico, ruta: 'hda:\\Configuration\\DEMO_VIBRACIONES\\', agregado: 'Average' },

  /** El estado en la forma común, con la física de la escrita a mano. */
  estado: (valorDe, _registro, leidoA = null) => estadoDeVibraciones(valorDe, CATALOGO_VIBRACIONES, leidoA),
})
