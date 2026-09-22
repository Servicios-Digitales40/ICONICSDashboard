/**
 * Los NOMBRES con que un servidor puede publicar cada rol del tipo
 * `vibraciones`, además del suyo propio.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque el tipo describe QUÉ mide una máquina —velocidad eficaz, aceleración
 * de pico, valor de daño— y eso vale para cualquier motor vigilado por
 * acelerómetros. Lo que NO vale para cualquiera es cómo se llaman esos tags en
 * el servidor: `vRMS` y `SPEED_BMS` son los nombres que publica el SIPLUS CMS
 * SM 1281 de esta instalación, no los de un equipo de otro fabricante.
 *
 * Hasta el 22-09-2026 cada rol tenía UN tag literal y la comparación era una
 * igualdad exacta, así que el reconocimiento automático sólo funcionaba contra
 * ese módulo y con esa grafía. Medido ese día: pasar los tags a MAYÚSCULAS
 * —una decisión de nomenclatura de planta, razonable— dejaba sin rol a nueve
 * de doce señales, y con ellas la máquina se quedaba sin reglas de riesgo, sin
 * estado y sin catálogo para el asistente.
 *
 * ── QUÉ RESUELVE Y QUÉ NO ──────────────────────────────────────────
 *
 * Resuelve que el mismo CONCEPTO se llame distinto. NO resuelve que un equipo
 * mida cosas distintas: si un servidor no publica el valor de daño, ese rol no
 * existe en esa máquina, y las reglas que lo necesitan no se evalúan. Eso se
 * declara en las limitaciones de la máquina (`construirSistema`), no se
 * inventa aquí.
 *
 * ── CÓMO SE AÑADE UN ALIAS ─────────────────────────────────────────
 *
 * Se escribe el nombre nuevo en la lista del rol que le corresponde. No hace
 * falta tocar nada más: el índice del tipo lo recoge al cargarse.
 *
 * **La comparación ya ignora mayúsculas, guiones bajos y espacios**, así que
 * NO hay que declarar `VRMS`, `v_rms` ni `v rms` como alias de `vRMS`: los
 * tres se reconocen solos. Un alias es para un nombre DISTINTO —`VEL_RMS`,
 * `VELOCITY_RMS`—, no para otra grafía del mismo.
 *
 * ── LA GARANTÍA QUE LO HACE SEGURO ─────────────────────────────────
 *
 * Un alias mal puesto no es un error que se vea: es una señal reconocida como
 * lo que no es, con su rótulo correcto. Por eso `tipos/vibraciones.js`
 * comprueba al cargarse que ningún nombre —propio o alias— reclame dos roles
 * distintos, y si lo hace el backend **no arranca**. Es el mismo criterio que
 * ya protege `DESAMBIGUA`, y por el mismo motivo: la primera tabla escrita a
 * mano de este proyecto estaba mal.
 */

/**
 * Alias por rol. La clave es el id del rol (`familia:clave`), y el valor los
 * nombres ADICIONALES con que un servidor puede publicarlo.
 *
 * Vacío no es un descuido: hoy sólo se conoce un fabricante, y escribir alias
 * de equipos que nadie ha visto sería adivinar. Se llena cuando llegue una
 * instalación con otra nomenclatura, con los nombres que de verdad publique.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const ALIAS_DE_ROL = Object.freeze({
  /*
   * Ejemplo de la forma, comentado a propósito para no afirmar que un equipo
   * publica esto sin haberlo visto:
   *
   *   "medida:vRMS": ["VEL_RMS", "VELOCITY_RMS"],
   *   "variador:velocidad": ["MOTOR_SPEED"],
   */
});

/**
 * La forma canónica de un nombre de tag, para compararlo con otro.
 *
 * Tres normalizaciones, y las tres salen de nombres REALES de esta planta
 * (medidos el 22-09-2026):
 *
 *   mayúsculas   `actual_Speed` en vivo contra `actual_speed` en el
 *                historiador. La misma señal, y no emparejaban.
 *   separadores  `FREQ OUTPUT_BMS` lleva un espacio donde otros llevan guión
 *                bajo; al normalizar la nomenclatura de planta a guiones
 *                bajos, ese nombre cambiaría y dejaría de reconocerse.
 *   bordes       un separador al principio o al final no distingue nada.
 *
 * Lo que NO hace: quitar separadores del todo. `MonState_vRMS` y
 * `MonStatevRMS` son nombres distintos, y colapsarlos acercaría tags que el
 * servidor distingue —justo el riesgo que este archivo existe para no correr—.
 *
 * @param {string} nombre
 * @returns {string} la forma comparable, o cadena vacía si no hay nombre
 */
export function formaComparable(nombre) {
  if (typeof nombre !== "string") return "";
  return nombre
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
