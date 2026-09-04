/**
 * Quién está usando la aplicación, y qué pasa cuando deja de estarlo.
 *
 * ── LAS TRES PREGUNTAS QUE CONTESTA ────────────────────────────────
 *
 *  1. **¿Hay sesión al cargar?** El navegador guarda una cookie `httpOnly`, que
 *     JavaScript no puede leer por diseño. Así que la única forma de saberlo es
 *     preguntárselo al servidor: `GET /api/sesion`. Mientras no conteste, no se
 *     puede pintar ni el login ni el asistente — enseñar el login y sustituirlo
 *     medio segundo después es el parpadeo que hace que una aplicación parezca
 *     rota nada más abrirla.
 *  2. **¿Cómo se entra y se sale?** `entrar()` y `salir()`.
 *  3. **¿Y si la sesión cae a mitad de faena?** Cualquier petición que reciba
 *     un 401 de caducidad avisa por `alCaducarSesion` (ver `lib/api/pedir.js`),
 *     y aquí se recoge para volver al login.
 *
 * ── LO QUE NO SE PIERDE AL CADUCAR ─────────────────────────────────
 *
 * La conversación. `features/asistente/lib/persistencia.js` la guarda en el
 * navegador y este proveedor **no la toca**: al volver a entrar sigue ahí, con
 * su última pregunta y su respuesta a medias. Es la diferencia entre «se cerró
 * la sesión» y «perdí minuto y medio de espera y lo que había preguntado».
 *
 * Salir a propósito es distinto y sí la borra: quien pulsa «Salir» en un equipo
 * compartido no espera que el siguiente lea su conversación. Esa es toda la
 * diferencia entre las dos salidas, y por eso son dos caminos y no uno.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { alCaducarSesion, pedirJson } from "@/lib/api/pedir.js";
import { borrar as olvidarConversacion } from "@/features/asistente/lib/persistencia.js";

const SesionContexto = createContext(null);

/** Estados posibles. `comprobando` es el inicial y por eso existe. */
export const ESTADO = Object.freeze({
  comprobando: "comprobando",
  fuera: "fuera",
  dentro: "dentro",
});

export function SesionProvider({ children }) {
  const [estado, setEstado] = useState(ESTADO.comprobando);
  const [usuario, setUsuario] = useState(null);

  /*
   * ── LA COMPROBACIÓN INICIAL ────────────────────────────────────────
   *
   * Un 401 aquí NO es un error: es la respuesta normal de alguien que acaba de
   * abrir la página. Por eso se distingue de un fallo de red, que sí deja el
   * estado en `comprobando` y reintenta — decirle «inicia sesión» a quien tiene
   * el backend caído le haría teclear su contraseña para nada.
   */
  useEffect(() => {
    let vigente = true;

    pedirJson("/api/sesion")
      .then((datos) => {
        if (!vigente) return;
        setUsuario(datos.usuario);
        setEstado(ESTADO.dentro);
      })
      .catch(() => {
        if (vigente) setEstado(ESTADO.fuera);
      });

    return () => {
      vigente = false;
    };
  }, []);

  /*
   * La caducidad descubierta por cualquier petición. No borra la conversación:
   * ver la cabecera.
   */
  useEffect(
    () =>
      alCaducarSesion(() => {
        setUsuario(null);
        setEstado(ESTADO.fuera);
      }),
    []
  );

  const entrar = useCallback(async (credenciales) => {
    const datos = await pedirJson("/api/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credenciales),
    });
    setUsuario(datos.usuario);
    setEstado(ESTADO.dentro);
    return datos;
  }, []);

  const salir = useCallback(async () => {
    /*
     * El estado local se limpia PASE LO QUE PASE con la petición. Si el backend
     * no contesta, dejar al usuario dentro de una aplicación de la que cree
     * haber salido es el peor de los dos errores posibles — sobre todo en un
     * equipo compartido de planta.
     */
    try {
      await pedirJson("/api/sesion", { method: "DELETE" });
    } finally {
      olvidarConversacion();
      setUsuario(null);
      setEstado(ESTADO.fuera);
    }
  }, []);

  const valor = useMemo(
    () => ({ estado, usuario, entrar, salir }),
    [estado, usuario, entrar, salir]
  );

  return <SesionContexto.Provider value={valor}>{children}</SesionContexto.Provider>;
}

export function useSesion() {
  const contexto = useContext(SesionContexto);
  if (!contexto) {
    throw new Error("useSesion() necesita estar dentro de <SesionProvider>.");
  }
  return contexto;
}
