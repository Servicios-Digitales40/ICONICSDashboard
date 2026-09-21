/**
 * Qué puede hacer quien está mirando el tablero. Plan 35 F3.
 *
 * ── LA REGLA QUE GOBIERNA ESTE ARCHIVO ─────────────────────────────
 *
 * **La pantalla no decide permisos: los refleja.** Quien niega es el backend,
 * y eso no cambia — un menú oculto no es seguridad, es cortesía. Si alguien
 * escribe la URL de una vista que no le toca, el servidor le contestará 403 y
 * la pantalla tiene que contarlo, no evitarlo por adelantado.
 *
 * Importa porque las rutas de este tablero **siguen siendo navegables aunque
 * no estén en el menú** (`routes.jsx`: «la ruta seguía existiendo, seguía
 * navegable escribiendo su id en la barra de direcciones»). Ocultar no cierra.
 *
 * Lo que sí hace esto es que no se ofrezca un botón que va a fallar. Un
 * control que devuelve 403 al pulsarlo es peor que su ausencia — es la misma
 * norma que `DESIGN.md` fija para las escrituras: «un botón que puede fallar
 * es peor que su ausencia».
 *
 * ── POR QUÉ LA TABLA VIENE DE `shared/` ────────────────────────────
 *
 * Porque es la MISMA que usa `exigirRol` en el backend. Escribir aquí una
 * segunda versión de «un administrador puede lo que puede un operador» es
 * cómo se llega a que la pantalla ofrezca lo que el servidor niega, o peor: a
 * que lo esconda cuando sí se podía.
 *
 * `CLAUDE.md` §2.6, y el incidente concreto está en `shared/README.md`.
 *
 * ── CON LA AUTENTICACIÓN APAGADA, TODO ESTÁ PERMITIDO ──────────────
 *
 * Y es deliberado, no un descuido. Con `AUTH_HABILITADA=false` el backend
 * tampoco niega nada: `exigirRol` sale por la primera línea. Una pantalla que
 * escondiera botones que el servidor sí acepta estaría mintiendo en la
 * dirección contraria — y el tablero de hoy, sin autenticación, se quedaría
 * inservible.
 *
 * Así que el criterio es: **la pantalla restringe exactamente cuando el
 * backend restringe, y nunca más.**
 */
import { useContext, useMemo } from "react";

import { alcanza, ROL, rolPrincipal } from "@shared/roles.js";

import { CtxSesion } from "./SesionProvider.jsx";

/**
 * Los permisos de la sesión actual.
 *
 * @returns {{
 *   habilitada: boolean,
 *   rol: string|null,
 *   puede: (rolMinimo: string) => boolean,
 *   esAdministrador: boolean,
 *   puedeOperar: boolean,
 * }}
 *
 * `puede()` es la única forma de preguntar. No se expone la lista de roles a
 * pelo: quien la recibiera acabaría escribiendo `roles.includes("operador")`
 * y ahí se pierde la jerarquía — un administrador dejaría de poder operar,
 * que es exactamente el defecto que el Plan 35 F1 vino a arreglar en el
 * backend.
 */
export function usePermisos() {
  /*
   * ── SIN PROVEEDOR NO SE LANZA: SE PERMITE TODO ─────────────────────
   *
   * Mismo criterio que `useSesionResuelta()`, `useEsSimulado()` y
   * `useHayFuenteEva()`: son hojas que pueden montarse fuera del árbol
   * completo —el Sidebar en una prueba, una vista aislada— y reventar ahí
   * convierte un montaje sin proveedor en una pantalla en blanco.
   *
   * El lado seguro aquí es **permitir**, no negar, y por lo mismo que con la
   * autenticación apagada: sin proveedor no hay nada que restringir, y una
   * pantalla que escondiera botones que el servidor sí acepta mentiría en la
   * dirección contraria. Quien de verdad niega es el backend.
   */
  const ctx = useContext(CtxSesion);
  const habilitada = ctx?.habilitada ?? false;
  const usuario = ctx?.usuario ?? null;

  return useMemo(() => {
    const roles = usuario?.roles ?? [];

    /*
     * Con la autenticación apagada no hay nada que restringir. Se devuelve
     * `rol: null` a propósito: no es que la persona sea administradora, es
     * que la pregunta no aplica, y quien rotule «has entrado como…» tiene que
     * poder distinguirlo.
     */
    const puede = (rolMinimo) => (habilitada ? alcanza(roles, rolMinimo) : true);

    return {
      habilitada: Boolean(habilitada),
      rol: habilitada ? rolPrincipal(roles) : null,
      puede,
      /* Los dos atajos que se usan en casi todas partes. Existen para que una
         vista no tenga que importar `ROL` sólo para preguntar lo de siempre. */
      esAdministrador: puede(ROL.ADMINISTRADOR),
      puedeOperar: puede(ROL.OPERADOR),
    };
  }, [habilitada, usuario]);
}
