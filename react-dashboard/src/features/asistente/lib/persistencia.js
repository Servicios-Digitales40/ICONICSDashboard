/**
 * La conversación sobrevive a cerrar el panel, recargar y cerrar el navegador.
 *
 * ── POR QUÉ HACE FALTA ─────────────────────────────────────────────
 *
 * Una respuesta cuesta entre uno y dos minutos. Perder el hilo por recargar la
 * página, o por cerrar el panel y volver, significa volver a pagar ese tiempo
 * para recuperar algo que ya se había preguntado. Y el caso más habitual no es
 * ni siquiera recargar: es abrir el tablero en otra pestaña.
 *
 * ── POR QUÉ `localStorage` Y NO EL SERVIDOR ────────────────────────
 *
 * Porque aquí no hay sesión de usuario. El backend no sabe quién pregunta —el
 * contexto de `/api/context` es un usuario fijo de configuración— así que
 * guardar el hilo en el servidor lo compartiría entre todas las pantallas de
 * la planta: el operador de la sala vería las preguntas del de mantenimiento
 * mezcladas con las suyas. Con `localStorage` el hilo es de ESE navegador, que
 * es exactamente el alcance que la gente espera de un chat sin login.
 *
 * La contrapartida —que el hilo no te sigue de un equipo a otro— es la
 * correcta mientras no haya sesiones de verdad.
 */

/**
 * La clave lleva versión.
 *
 * Si mañana cambia la forma de un turno —como ya pasó al convertir
 * `herramienta` en la lista `consultas`— lo guardado con la forma vieja no se
 * puede pintar con el código nuevo. Subiendo el número, lo viejo se ignora y
 * el usuario empieza con el hilo vacío, que es feo pero inofensivo; sin
 * versión, el panel intentaría pintarlo y reventaría al arrancar.
 */
const CLAVE = "tdconcito.conversacion.v1";

/**
 * Cuántos turnos se guardan.
 *
 * `localStorage` tiene unos 5 MB por origen para TODO lo que guarde la
 * aplicación, así que un hilo sin tope acabaría desalojando lo demás. Cuarenta
 * turnos son veinte preguntas con sus respuestas: mucho más de lo que nadie
 * repasa hacia atrás, y el servidor sólo recuerda los ocho últimos de todos
 * modos.
 */
const MAX_TURNOS = 40;

/** Recorte por turno. Un gráfico adjunto puede pesar; el texto no debería. */
const MAX_CARACTERES = 4000;

/**
 * Qué se guarda de cada turno.
 *
 * Se guarda lo que hace falta para PINTARLO otra vez, incluidas las consultas
 * —de dónde salió el dato— porque esa línea es lo que permite creerse una cifra
 * y sin ella el hilo recuperado sería menos fiable que el original.
 *
 * Los adjuntos (los SVG de los gráficos) se guardan también: son unos pocos
 * kilobytes y sin ellos el texto quedaría hablando de un gráfico que no está.
 */
function paraGuardar(mensajes) {
  return mensajes
    /*
     * Fuera los turnos que no llegaron a ser nada.
     *
     * El caso real es cerrar la pestaña mientras el modelo escribe: queda un
     * turno de asistente vacío o a medias. Restaurarlo pintaría una burbuja
     * con media frase que parece una respuesta y no lo es — y peor, esa media
     * frase suele cortarse dentro de una cifra.
     */
    .filter((m) => m.rol === "usuario" || (m.texto?.trim() && !m.cancelado))
    .slice(-MAX_TURNOS)
    .map((m) => ({
      rol: m.rol,
      texto: String(m.texto ?? "").slice(0, MAX_CARACTERES),
      ...(m.consultas?.length ? { consultas: m.consultas } : {}),
      ...(m.adjuntos?.length ? { adjuntos: m.adjuntos } : {}),
      ...(m.bloqueada ? { bloqueada: true } : {}),
      ...(m.error ? { error: m.error } : {}),
    }));
}

/** Guarda el hilo. Nunca lanza: un fallo aquí no puede tumbar el chat. */
export function guardar(mensajes) {
  try {
    const utiles = paraGuardar(mensajes);
    if (!utiles.length) return borrar();
    window.localStorage.setItem(CLAVE, JSON.stringify(utiles));
  } catch {
    /*
     * Se traga el error a propósito, y son dos errores distintos:
     *
     *  - `QuotaExceededError` si el almacenamiento está lleno.
     *  - Un `SecurityError` en navegación privada de algunos navegadores, o
     *    con las cookies de terceros bloqueadas dentro de un iframe.
     *
     * En los dos casos la consecuencia correcta es la misma: el chat funciona
     * igual, sólo que no recuerda. Lanzar aquí rompería una consulta en curso
     * por no poder guardar el historial, que es cambiar un inconveniente por
     * una avería.
     */
  }
}

/**
 * El hilo guardado, o una lista vacía.
 *
 * Se rellenan los campos que `nuevoTurno` da por hechos —`consultas`,
 * `adjuntos`— porque el componente los recorre sin comprobar, y un turno
 * restaurado sin ellos reventaría al pintarse. Es el precio de guardar sólo lo
 * necesario, y es más barato que guardar el objeto entero.
 */
export function cargar() {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];

    const guardado = JSON.parse(crudo);
    if (!Array.isArray(guardado)) return [];

    return guardado
      .filter((m) => m && (m.rol === "usuario" || m.rol === "asistente"))
      .map((m) => ({
        rol: m.rol,
        texto: String(m.texto ?? ""),
        consultas: Array.isArray(m.consultas) ? m.consultas : [],
        adjuntos: Array.isArray(m.adjuntos) ? m.adjuntos : [],
        bloqueada: Boolean(m.bloqueada),
        sinRespuesta: false,
        // Un turno restaurado NO se puede reintentar: la pregunta original ya
        // no está en vuelo y el botón prometería algo que no puede cumplir.
        cancelado: false,
        error: m.error ?? null,
      }));
  } catch {
    // JSON corrupto —una escritura cortada a la mitad al cerrar el navegador—
    // se descarta entero. Es preferible empezar en blanco a pintar basura.
    return [];
  }
}

export function borrar() {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // Ver `guardar`.
  }
}
