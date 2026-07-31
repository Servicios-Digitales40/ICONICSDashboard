/**
 * lib/datasource/types.js
 * ------------------------------------------------------------------
 * EL CONTRATO que cumplen las dos fuentes de datos: `iconicsSource`
 * (servidor real) y `demoSource` (datos hardcodeados).
 *
 * ── POR QUÉ EXISTE ESTA INTERFAZ ───────────────────────────────────
 *
 * El requisito es un botón que desconecte la API y muestre datos fijos,
 * para poder enseñar y probar la UI sin servidor. La forma obvia de
 * implementarlo —un `if (demoMode)` en cada componente— es justo la que
 * hay que evitar: ensucia toda la UI y garantiza que algún camino se
 * olvide y siga pegando al servidor.
 *
 * En su lugar, dos objetos que cumplen esta misma interfaz y un único
 * punto de elección en la raíz de composición (DataSourceProvider).
 * Ningún componente pregunta jamás «¿estoy en demo?».
 *
 * ── FORMA DE LA SUSCRIPCIÓN ────────────────────────────────────────
 *
 * Es push, no pull: la fuente empuja instantáneas cuando las tiene. Así
 * la vista no decide cuándo pedir —eso lo gobierna el motor de polling,
 * que es quien sabe agrupar— y el modo demo puede emitir a su ritmo sin
 * que nadie note la diferencia.
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
 *           Serie histórica. NO se sondea: se pide al abrir la gráfica.
 * @property {(id: string, iso: string) => Promise<{serie: object[], resumen: object|null}>} readDay
 *           Un día completo del historiador: serie horaria de los
 *           factores y resumen del día. `resumen: null` = día sin
 *           historia, que no es lo mismo que un día malo.
 * @property {(id: string, rango: {desde: string, hasta: string}) => Promise<{iso: string, oee: number}[]>} readDailyOee
 *           OEE día a día, para el mapa de calor del calendario.
 * @property {() => void} stop
 *           Detiene toda actividad de red. La llama el provider al
 *           cambiar de modo: en demo el poller debe PARAR de verdad, no
 *           basta con ignorar sus datos.
 */

/** Instantánea vacía, para el primer render antes de cualquier lectura. */
export const SNAPSHOT_INICIAL = {
  machines: [],
  loading: true,
  error: null,
  lastUpdated: null,
};
