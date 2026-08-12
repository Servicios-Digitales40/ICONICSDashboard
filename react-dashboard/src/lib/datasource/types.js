/**
 * Contrato que cumple la fuente de datos, `iconicsSource`.
 *
 * ── POR QUÉ SIGUE SIENDO UNA INTERFAZ CON UNA SOLA IMPLEMENTACIÓN ──
 *
 * Hasta el Plan 5 había dos: `iconicsSource` y un `demoSource` que entregaba
 * `Machine` ya construidas saltándose el motor de polling. Se retiró porque
 * evitaba justo lo que había que ejercitar; lo que varía ahora es el
 * TRANSPORTE, una capa más abajo.
 *
 * El contrato se conserva porque sigue siendo la frontera entre las vistas y
 * la maquinaria: es lo que permite que `hooks.js` no sepa nada de puntos, de
 * lotes ni de calidad OPC. Que hoy sólo haya un implementador no lo hace menos
 * frontera.
 *
 * La suscripción es push, no pull: la fuente empuja instantáneas cuando las
 * tiene. Así la vista no decide cuándo pedir — eso lo gobierna el motor de
 * polling, que es quien sabe agrupar.
 *
 * @typedef {object} Snapshot
 * @property {import("../domain/machine.js").Machine[]} machines
 * @property {boolean} loading    primera carga en curso, aún sin datos
 * @property {string|null} error  último error, o null
 * @property {Date|null} lastUpdated  cuándo llegó la última lectura buena
 *
 * @typedef {object} DataSource
 * @property {(cb: (s: Snapshot) => void) => () => void} subscribePlant
 *           Todas las máquinas. Devuelve la función para darse de baja.
 * @property {(id: string, cb: (s: Snapshot) => void) => () => void} subscribeMachine
 *           Una sola máquina, con su juego completo de propiedades.
 * @property {(id: string, range: object) => Promise<object[]>} readHistory
 *           Serie histórica. No se sondea: se pide al abrir la gráfica.
 * @property {(id: string, iso: string) => Promise<{serie: object[], resumen: object|null}>} readDay
 *           Un día completo del historiador: serie horaria de los factores y
 *           resumen del día. `resumen: null` es un día sin historia, que no
 *           es lo mismo que un día malo.
 * @property {(id: string, rango: {desde: string, hasta: string}) => Promise<{iso: string, oee: number}[]>} readDailyOee
 *           OEE día a día, para el mapa de calor del calendario.
 * @property {() => void} stop
 *           Detiene toda actividad de red. La llama el provider al cambiar de
 *           transporte: el poller tiene que parar de verdad, no basta con
 *           ignorar sus datos.
 */

/** Instantánea vacía, para el primer render antes de cualquier lectura. */
export const SNAPSHOT_INICIAL = {
  machines: [],
  loading: true,
  error: null,
  lastUpdated: null,
};
