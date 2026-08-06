/**
 * Navegación reflejada en la barra de direcciones.
 *
 * Antes la ruta actual vivía en un `useState` y la URL nunca cambiaba. Para
 * una aplicación de escritorio eso pasa desapercibido; para un tablero cuyo
 * destino son monitores fijos, no:
 *
 *  - No se podía configurar un kiosco para que abriera «Rectificadoras». Todas
 *    las pantallas arrancaban en Planta y alguien tenía que ir a cada una.
 *  - Una recarga —o un reinicio del equipo a las 6 de la mañana— devolvía la
 *    pantalla a Planta y allí se quedaba.
 *  - No se podía enviar el enlace de una máquina concreta a nadie.
 *
 * Se usa la History API y no el hash porque el backend ya sirve el
 * `index.html` en cualquier ruta que no sea un archivo del build, así que
 * `/area-REC` funciona tal cual, sin configuración extra y sin `#`.
 *
 * No se ha traído un enrutador: son cuatro rutas sin anidamiento ni
 * parámetros de ruta, el registro ya existe en `routes.jsx`, y una dependencia
 * nueva en el bundle de planta tendría que ganarse su sitio con algo más que
 * esto.
 */
import { useCallback, useEffect, useState } from "react";

/**
 * Rutas que la aplicación NO debe intentar interpretar: son del servidor de
 * estáticos. Sin esta comprobación, entrar por error a `/assets/algo` pintaría
 * la ruta por defecto y taparía el fallo.
 */
const PREFIJOS_RESERVADOS = ["/assets/"];

/** URL → `{ page, params }`. Los parámetros viajan en la query string. */
function leerUbicacion(rutasValidas, rutaPorDefecto) {
  const { pathname, search } = globalThis.location ?? { pathname: "/", search: "" };

  if (PREFIJOS_RESERVADOS.some((p) => pathname.startsWith(p))) {
    return { page: rutaPorDefecto, params: {} };
  }

  const id = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, ""));
  // Un id desconocido cae a la ruta por defecto en vez de dejar la pantalla
  // vacía. Pasa al renombrar una ruta, con los favoritos ya guardados.
  const page = rutasValidas.includes(id) ? id : rutaPorDefecto;

  return { page, params: Object.fromEntries(new URLSearchParams(search)) };
}

/** `{ page, params }` → `/page?clave=valor`. */
function construirUrl(page, params) {
  const query = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null)
  ).toString();

  return `/${encodeURIComponent(page)}${query ? `?${query}` : ""}`;
}

/**
 * @param {string[]} rutasValidas ids del registro de rutas
 * @param {string} rutaPorDefecto
 * @returns {[{ page: string, params: object }, (page: string, params?: object) => void]}
 */
export function useNavegacion(rutasValidas, rutaPorDefecto) {
  const [nav, setNav] = useState(() => leerUbicacion(rutasValidas, rutaPorDefecto));

  // El botón «atrás» del navegador tiene que funcionar: sin esto, la URL
  // retrocedía y la pantalla se quedaba donde estaba.
  useEffect(() => {
    const alVolver = () => setNav(leerUbicacion(rutasValidas, rutaPorDefecto));
    globalThis.addEventListener?.("popstate", alVolver);
    return () => globalThis.removeEventListener?.("popstate", alVolver);
  }, [rutasValidas, rutaPorDefecto]);

  // La URL de arranque se normaliza: quien entre a `/` o a una ruta que no
  // existe acaba con una barra de direcciones que dice dónde está de verdad.
  useEffect(() => {
    const url = construirUrl(nav.page, nav.params);
    if (globalThis.location && globalThis.location.pathname + globalThis.location.search !== url) {
      globalThis.history?.replaceState(null, "", url);
    }
    // Solo al montar: después, cada navegación escribe su propia entrada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((page, params = {}) => {
    globalThis.history?.pushState(null, "", construirUrl(page, params));
    setNav({ page, params });
  }, []);

  return [nav, navigate];
}
