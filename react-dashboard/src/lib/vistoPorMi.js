/**
 * Lo que ESTE operador, en ESTE dispositivo, ya ha visto — extraído de
 * `AlarmasEva.jsx` (Plan 24 F5) al necesitarlo una segunda vista (Plan 25 F6).
 *
 * ── POR QUÉ `localStorage` Y NO EL SERVIDOR (la razón no cambia) ───
 *
 * Porque «visto» y «reconocido»/«accionado» son dos cosas distintas y
 * confundirlas sería grave. Un acuse o un accionamiento son hechos de la
 * instalación: quedan con nombre, en el servidor o en el diario, y los ve
 * cualquiera. «Visto» es una conveniencia de ESTA pantalla para ESTA persona
 * —qué ha mirado ya— y mandarlo al servidor lo convertiría en una afirmación
 * sobre el turno que nadie ha hecho.
 *
 * Por eso vive en el navegador, es por dispositivo, y se pierde al limpiar el
 * almacenamiento — todo aceptable para lo que es.
 *
 * ── POR QUÉ NO PUEDE TIRAR LA VISTA ─────────────────────────────────
 *
 * En un kiosco con el almacenamiento bloqueado, `localStorage` LANZA al
 * tocarlo. Sin memoria de lo visto se ve todo como nuevo, que es el lado
 * seguro: enseña de más, nunca de menos — nunca al revés, que escondería un
 * hallazgo real detrás de un fallo de almacenamiento.
 *
 * ── POR QUÉ SE PARAMETRIZA POR CLAVE ────────────────────────────────
 *
 * Alarmas y la bandeja de hallazgos (Plan 25 F6) necesitan la MISMA mecánica
 * sobre conjuntos de ids DISTINTOS, y no pueden compartir clave de
 * almacenamiento: si la compartieran, marcar como visto un evento de alarma
 * marcaría también como visto un hallazgo con el mismo id por casualidad.
 */

/**
 * @param {string} clave  Namespace de almacenamiento, p. ej. `"eva:alarmas"`.
 * @param {number} [tope]  Cuántos ids como máximo se recuerdan.
 */
export function crearVistoPorMi(clave, tope = 500) {
  const claveCompleta = `${clave}:vistos`;

  function leer() {
    try {
      const crudo = globalThis.localStorage?.getItem(claveCompleta);
      const lista = crudo ? JSON.parse(crudo) : [];
      return new Set(Array.isArray(lista) ? lista : []);
    } catch {
      return new Set();
    }
  }

  function guardar(vistos) {
    try {
      /*
       * Se guardan como máximo los últimos `tope`. Sin límite, la lista crece
       * para siempre — y lo que importa es no volver a marcar como nuevo algo
       * reciente, no llevar el registro de un año.
       */
      const lista = [...vistos].slice(-tope);
      globalThis.localStorage?.setItem(claveCompleta, JSON.stringify(lista));
    } catch {
      // Un kiosco con el almacenamiento bloqueado sigue funcionando: pierde la
      // memoria de lo visto, no la pantalla.
    }
  }

  /** Marca `ids` como vistos, sumándolos a los que ya había. */
  function marcar(ids) {
    guardar(new Set([...leer(), ...ids]));
  }

  return { leer, marcar };
}
