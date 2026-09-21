/**
 * Los ROLES del tablero, y quién puede más que quién. Plan 35 F1.
 *
 * ── POR QUÉ ESTO ES DOMINIO Y NO UNA PIEZA DE HTTP ─────────────────
 *
 * Porque «un administrador puede lo que puede un operador» es una regla de
 * negocio, no una decisión de Fastify. Y la necesitan los DOS programas:
 *
 *   el backend   para negar una ruta a quien no alcanza el rol mínimo
 *   el frontend  para no ofrecer un botón que el servidor va a rechazar
 *
 * Si cada uno la escribiera por su cuenta serían dos versiones de la misma
 * verdad, y la segunda se quedaría vieja — el incidente que `shared/README.md`
 * documenta y que `CLAUDE.md` §2.6 existe para no repetir.
 *
 * Aquí no se sabe de tokens, de cabeceras ni de rutas. Se contesta una sola
 * pregunta: **¿este rol alcanza a este otro?**
 *
 * ── LA JERARQUÍA, Y POR QUÉ ES PURA ────────────────────────────────
 *
 *   administrador  >  operador  >  visualizador
 *
 * Decidido por el usuario el 21-09-2026. Se consideró la alternativa —que
 * gestionar máquinas y accionar la planta fueran competencias separadas, de
 * modo que un administrador NO pudiera mover una bomba— y se descartó: quien
 * lee «acceso completo» espera poder hacer lo que hace su subordinado, y un
 * administrador que no puede sorprende en el peor momento.
 *
 * La consecuencia hay que tenerla delante: **un administrador puede accionar
 * la planta**, desde el tablero y desde el asistente.
 *
 * ── POR QUÉ SE RESUELVE AL COMPROBAR Y NO AL FIRMAR ────────────────
 *
 * La tentación es expandir los roles heredados al emitir el token: firmar
 * `["administrador","operador","visualizador"]` y que la guarda se limite a un
 * `includes`. Es más rápido y está mal.
 *
 * Un token lleva dentro la jerarquía **del día en que se firmó**. Cambiarla
 * —añadir un rol, mover un permiso— no afectaría a las sesiones ya abiertas,
 * y para que el cambio surtiera efecto habría que echar a todo el mundo. Peor:
 * el sistema se comportaría distinto para dos personas con el mismo rol según
 * cuándo entraron, sin que nada lo indique.
 *
 * Así que el token guarda los roles **tal como se le asignaron a la persona**,
 * y la herencia se calcula en cada comprobación. Es una búsqueda en un objeto
 * de tres entradas: el coste es irrelevante y la propiedad —que la jerarquía
 * viva en un solo sitio y cambie para todos a la vez— no.
 *
 * ── DENY BY DEFAULT ────────────────────────────────────────────────
 *
 * Un rol que no está en esta tabla **no alcanza nada**. No es un caso de
 * borde: es lo que pasa cuando alguien escribe mal un rol en `AUTH_USUARIOS`
 * —`operadores`, `Administrador`— y es justo cuando más caro sale equivocarse
 * hacia el lado permisivo. Mismo criterio que `acceso: "read"` en
 * `configuracionMaquina.js` (Plan 33 §20).
 */

/**
 * Los tres roles, del que más puede al que menos.
 *
 * El orden es el de la jerarquía y se usa para presentarlos; quien decida si
 * uno alcanza a otro pregunta a `alcanza()`, no compara posiciones — un índice
 * invita a `>=`, y eso ata el significado al orden de una lista que alguien
 * reordenará algún día.
 */
export const ROL = Object.freeze({
  ADMINISTRADOR: "administrador",
  OPERADOR: "operador",
  VISUALIZADOR: "visualizador",
});

/** Los roles en orden descendente de capacidad. */
export const ROLES = Object.freeze([
  ROL.ADMINISTRADOR,
  ROL.OPERADOR,
  ROL.VISUALIZADOR,
]);

/**
 * Qué roles alcanza cada rol, incluido él mismo.
 *
 * Se escribe completa en vez de derivarse de una lista ordenada, y es
 * deliberado: la tabla explícita se lee de un vistazo y soporta que algún día
 * la jerarquía deje de ser una cadena —un rol de auditoría que alcance lectura
 * pero no escritura no cabría en un orden lineal—. Hoy es una cadena; el día
 * que no lo sea, esto no hay que rehacerlo.
 */
const ALCANCE = Object.freeze({
  [ROL.ADMINISTRADOR]: Object.freeze([
    ROL.ADMINISTRADOR,
    ROL.OPERADOR,
    ROL.VISUALIZADOR,
  ]),
  [ROL.OPERADOR]: Object.freeze([ROL.OPERADOR, ROL.VISUALIZADOR]),
  [ROL.VISUALIZADOR]: Object.freeze([ROL.VISUALIZADOR]),
});

/** ¿Es `rol` uno de los tres que este tablero conoce? */
export const esRolConocido = (rol) => Object.hasOwn(ALCANCE, rol);

/**
 * ¿Los roles de una persona alcanzan el rol exigido?
 *
 * @param {string[]|null|undefined} rolesDeLaPersona  tal como vienen del token
 * @param {string} rolExigido  el mínimo que pide la ruta
 *
 * Un rol desconocido en la lista de la persona **no aporta nada** y tampoco
 * invalida los demás: alguien con `["operador","tipografiado"]` sigue siendo
 * operador. Lo que no pasa nunca es que un rol que esta tabla no conoce abra
 * una puerta.
 */
export function alcanza(rolesDeLaPersona, rolExigido) {
  if (!esRolConocido(rolExigido)) return false;
  if (!Array.isArray(rolesDeLaPersona)) return false;

  return rolesDeLaPersona.some((rol) => ALCANCE[rol]?.includes(rolExigido) ?? false);
}

/**
 * Todo lo que alcanzan unos roles, sin repetidos y en orden de capacidad.
 *
 * Para la pantalla: con esto decide qué enseña sin preguntar tres veces. NO se
 * usa para firmar tokens — ver la cabecera sobre por qué la herencia se
 * resuelve al comprobar.
 */
export function rolesAlcanzados(rolesDeLaPersona) {
  const todos = new Set();
  for (const rol of rolesDeLaPersona ?? []) {
    for (const alcanzado of ALCANCE[rol] ?? []) todos.add(alcanzado);
  }
  return ROLES.filter((rol) => todos.has(rol));
}

/**
 * El rol más alto de una lista, o `null` si no hay ninguno conocido.
 *
 * Sirve para rotular —«has entrado como Operador»— y para elegir una vista por
 * defecto. Para decidir permisos se usa `alcanza()`: preguntar por el rol más
 * alto y comparar a mano es volver a escribir la jerarquía en otro sitio.
 */
export function rolPrincipal(rolesDeLaPersona) {
  return ROLES.find((rol) => (rolesDeLaPersona ?? []).includes(rol)) ?? null;
}
