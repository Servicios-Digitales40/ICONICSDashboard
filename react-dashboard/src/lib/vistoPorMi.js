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
 *
 * ── POR QUÉ AVISA A QUIEN ESCUCHE (Plan 31 F1) ──────────────────────
 *
 * Hasta ahora quien marcaba y quien leía eran el mismo componente, así que su
 * propio `useState` bastaba. El badge del sidebar rompe eso: lee la MISMA clave
 * que la Bandeja desde otro árbol de React, y sin aviso seguiría marcando lo
 * que ya se descartó hasta la siguiente recarga.
 *
 * El evento `storage` del navegador no sirve para esto —por estándar sólo se
 * dispara en las OTRAS pestañas, nunca en la que escribió—, así que hace falta
 * un aviso propio. El de `storage` sigue haciendo falta aparte, para la segunda
 * pantalla abierta en el mismo puesto; lo pone quien se suscribe.
 */

/**
 * @param {string} clave  Namespace de almacenamiento, p. ej. `"eva:alarmas"`.
 * @param {number} [tope]  Cuántos ids como máximo se recuerdan.
 */
export function crearVistoPorMi(clave, tope = 500) {
  const claveCompleta = `${clave}:vistos`;
  const oyentes = new Set();

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
    /*
     * Se avisa aunque `guardar` haya fallado (kiosco con almacenamiento
     * bloqueado): quien escuche tiene que releer de todas formas. Si no se
     * guardó nada, releerá lo mismo y no pasa nada; callarse, en cambio,
     * dejaría la pantalla marcando algo que la persona acaba de descartar.
     */
    for (const oyente of oyentes) oyente();
  }

  /**
   * Avisa cuando `marcar` cambia algo. Devuelve la baja.
   *
   * Sólo cubre los cambios de ESTA pestaña, que es lo que `storage` no cubre.
   * Quien quiera enterarse también de las otras, escucha `storage` además de
   * esto — ver `Demo-EVA/data/comunes/hallazgos.js`.
   */
  function suscribir(oyente) {
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
  }

  return { leer, marcar, suscribir, clave: claveCompleta };
}
