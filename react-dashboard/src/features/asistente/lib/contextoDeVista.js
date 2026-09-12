/**
 * Qué pantalla tiene delante quien pregunta (Plan 24 F7 · `USO-07`).
 *
 * ── POR QUÉ NO ES UN CONTEXTO DE REACT ─────────────────────────────
 *
 * Porque el asistente vive FUERA del árbol de las vistas: `App.jsx` lo monta
 * como hermano del `<main>`, en su propia barrera de errores, para que un fallo
 * suyo no se lleve por delante el tablero. Un contexto de React obligaría a
 * envolver los dos bajo un proveedor común, y con él a que cada vista que
 * quiera declarar su pantalla pase por un hook — el mismo acoplamiento que
 * `preguntaExterna.js` evitó a propósito con un evento.
 *
 * Aquí ni siquiera hace falta un evento: no hay nada que notificar. El
 * asistente lee esto en el momento exacto en que va a preguntar, y entre esos
 * dos instantes nadie necesita enterarse de nada.
 *
 * ── POR QUÉ UN MÓDULO CON ESTADO, Y POR QUÉ ES ACEPTABLE AQUÍ ──────
 *
 * Es una variable de módulo, que normalmente es una mala idea. Es aceptable por
 * tres razones concretas: sólo hay UNA pantalla activa a la vez por definición
 * (el `Shell` monta una ruta), el que escribe es siempre la vista montada y el
 * que lee es exactamente uno, y el dato es desechable — si se pierde, el
 * asistente responde sin contexto, que es como respondía antes de esta fase.
 *
 * Lo que NO puede pasar es que se quede pegado el contexto de una pantalla que
 * ya se cerró: por eso `declararContextoDeVista` devuelve su propia función de
 * limpieza y las vistas la usan desde un `useEffect`.
 *
 * ── LO QUE AQUÍ NUNCA ENTRA ────────────────────────────────────────
 *
 * Ningún VALOR. Ni una medida, ni un promedio, ni un estado calculado. Sólo
 * identificadores: qué sistema, qué activo, qué señal, qué rango. La frontera
 * está escrita en `backend/ia/conversacion/chat.mjs`
 * (`historialAMensajes`) y la hace cumplir `ChatSchema.contexto` con
 * `strict()`, que rechaza cualquier campo que no sea uno de esos cuatro.
 *
 * El motivo, en una frase: una cifra que llegue por aquí es una cifra que el
 * modelo puede citar sin que ninguna herramienta la haya leído — sin calidad,
 * sin frescura y sin poder auditarla (`IA-02`).
 */

/** Los únicos campos que viajan. Debe coincidir con `ChatSchema.contexto`. */
const CAMPOS = ["sistema", "activo", "senal", "rango"];

let actual = null;

/**
 * Declara la pantalla activa. Devuelve la función que la retira.
 *
 * @param {{sistema?: string, activo?: string, senal?: string, rango?: string}} contexto
 * @returns {() => void}
 */
export function declararContextoDeVista(contexto) {
  /*
   * Se filtra a los cuatro campos conocidos en vez de guardar el objeto tal
   * cual: una vista que pasara `{ ...senal }` de más metería su `valor` sin
   * darse cuenta, y el backend lo rechazaría con un `strict()` — dejando la
   * pregunta sin contexto por un descuido silencioso. Mejor recortar aquí.
   */
  const limpio = {};
  for (const campo of CAMPOS) {
    const valor = contexto?.[campo];
    if (typeof valor === "string" && valor.trim()) limpio[campo] = valor.trim();
  }

  const mio = Object.keys(limpio).length ? limpio : null;
  actual = mio;

  return () => {
    /*
     * Sólo se limpia si sigue siendo el nuestro. React puede montar la vista
     * nueva ANTES de desmontar la vieja, así que un `actual = null` a ciegas
     * borraría el contexto que la pantalla entrante acaba de declarar.
     *
     * Se compara por identidad de objeto, y por eso `mio` se captura aquí en vez
     * de mirar `limpio`: cuando no había ningún campo, `mio` es `null` y la
     * comparación seguiría siendo correcta (`actual === null` sólo si nadie
     * declaró nada después).
     */
    if (actual === mio) actual = null;
  };
}

/** La pantalla activa, o `null`. La lee el asistente al preguntar. */
export function contextoDeVista() {
  return actual;
}
