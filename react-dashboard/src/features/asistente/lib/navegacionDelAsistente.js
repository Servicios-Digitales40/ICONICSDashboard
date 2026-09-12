/**
 * A qué pantalla lleva la llamada a una herramienta del asistente
 * (Plan 25 F7 · `NUE-08`, la vuelta).
 *
 * ── QUÉ RESUELVE, Y POR QUÉ NO ES UN INTENTO GENÉRICO ──────────────
 *
 * `contextoDeVista.js` es la IDA: la vista le dice al asistente qué está
 * mirando. Esto es la VUELTA: cuando el asistente LLAMA a una herramienta que
 * ya trae un id de ruta navegable en sus argumentos de entrada —`sistema`,
 * `riesgoId`—, se ofrece un botón para ir a verlo en pantalla.
 *
 * No es un intento de adivinar un destino para CUALQUIER herramienta. Muchas
 * —`analisis_de_senal`, `correlacionar_senales`, `tendencia_multiple`— no
 * corresponden 1:1 a ninguna vista, y fingir que sí sería peor que no
 * ofrecer nada: un botón que aterriza en un sitio que no tiene relación con
 * lo que se preguntó es más confuso que ningún botón.
 *
 * Este archivo es, a propósito, un REGISTRO EXPLÍCITO y corto: sólo las
 * herramientas cuyo destino es inequívoco.
 *
 * ── POR QUÉ NO SE TOCA EL BACKEND PARA ESTO ────────────────────────
 *
 * Porque no hace falta. El canal ya existe: `chat.mjs` emite
 * `{ tipo: 'herramienta', nombre, argumentos }` por SSE cada vez que el
 * modelo llama a una — son los ARGUMENTOS DE ENTRADA que el propio modelo
 * escribió, no el resultado de la herramienta. Y da la casualidad de que las
 * herramientas de riesgo y diagnóstico YA reciben `sistema`+`riesgoId` como
 * entrada (`diagnosticar_falla`, por ejemplo, exige que se le pase el `id`
 * del riesgo activo): ese dato basta para navegar sin necesitar el resultado.
 *
 * Lo que NO se puede hacer con esto es enseñar un riesgo concreto de
 * `riesgos_activos({ sistema })`: esa llamada no dice CUÁL de los riesgos
 * activos citó el modelo después en su texto —eso vive en el resultado, que
 * no viaja—, así que su destino es la vista de Riesgos ENTERA, no una
 * tarjeta. Es una limitación real, dicha aquí y no fingida.
 *
 * ── LA FRONTERA QUE NO SE MUEVE ────────────────────────────────────
 *
 * Igual que `contextoDeVista.js`: sólo identificadores. Lo que viaja de aquí
 * a `navigate()` es un id de ruta y, cuando aplica, un `riesgoId` — nunca un
 * valor medido. La `strict()` de `ChatSchema.contexto` no la toca este
 * archivo: es un canal totalmente distinto, en la dirección opuesta.
 */

/**
 * @param {string} nombre      el nombre de la herramienta llamada
 * @param {object} argumentos  los argumentos CON LOS QUE se llamó
 * @returns {{ ruta: string, params?: object } | null}
 */
export function destinoDeHerramienta(nombre, argumentos) {
  const sistema = typeof argumentos?.sistema === "string" ? argumentos.sistema : null;
  const riesgoId = typeof argumentos?.riesgoId === "string" ? argumentos.riesgoId : null;

  switch (nombre) {
    case "diagnosticar_falla":
    case "cerrar_diagnostico":
      // Las dos exigen `sistema` Y `riesgoId`; sin los dos no hay adónde ir.
      if (!sistema || !riesgoId) return null;
      return { ruta: "cierre-diagnostico", params: { sistema, riesgoId } };

    case "riesgos_activos":
      /*
       * Sin `riesgoId` porque esta llamada no lo trae: `riesgos_activos` se
       * pide con sólo `sistema`, y CUÁL de los riesgos activos mencionó el
       * modelo después en su respuesta vive en el RESULTADO, que no viaja por
       * este canal. Se navega a la vista entera, no a una tarjeta — ver la
       * cabecera para por qué no se finge más precisión de la que hay.
       */
      if (!sistema) return null;
      return { ruta: sistema === "tanque" ? "eva-riesgos" : "eva-riesgos-vibracion" };

    case "estado_del_sistema":
      if (!sistema) return null;
      return { ruta: sistema === "tanque" ? "eva-inicio" : "vib-inicio" };

    case "controlar_bomba":
      // No lleva `sistema` en sus argumentos —sólo hay una bomba controlable
      // hoy—, así que el destino es fijo: la única pantalla de control real.
      return { ruta: "eva-controles" };

    default:
      return null;
  }
}
