/**
 * La sesión de quien mira el tablero: si hace falta acceso, y con quién se
 * entró (Plan 25 F9 · `SEG-01`, segunda mitad).
 *
 * ── POR QUÉ UN PROVIDER, Y NO `ModalProvider` ───────────────────────
 *
 * `ModalProvider` es para modales que la PERSONA elige abrir y cerrar
 * libremente. El acceso es distinto por naturaleza: puede tener que aparecer
 * sin que nadie lo pida —al arrancar sin sesión válida, o al caducar a mitad
 * de uso— y no se puede cerrar sin resolverlo. Forzar ese caso en un contexto
 * pensado para lo otro habría sido más confuso que un provider propio.
 *
 * ── LOS TRES ESTADOS, Y POR QUÉ SON TRES Y NO DOS ───────────────────
 *
 *   verificando   se está preguntando al servidor; no se sabe nada todavía
 *   resuelta      o bien AUTH_HABILITADA=false, o bien hay sesión válida
 *   pendiente     hace falta pedir acceso — sin sesión, o inválida/caducada
 *
 * Sin el primero, la pantalla de acceso parpadearía en cada carga mientras se
 * resuelve la pregunta al servidor, incluso en instalaciones sin
 * autenticación — sería peor que esperar en silencio un instante.
 *
 * ── LA RENOVACIÓN PROACTIVA ──────────────────────────────────────────
 *
 * Un intervalo revisa `sesionPorCaducar()` (Plan 25 §F9, `lib/api/sesion.js`)
 * y renueva SIN que nadie lo pida. El plan es explícito: la renovación se
 * intenta ANTES de caducar, no después de que un 401 la delate.
 *
 * ── CUANDO LA RENOVACIÓN FALLA, MURO Y FUERA DE MURO SE COMPORTAN DISTINTO ──
 *
 * Es la pregunta difícil que el Plan 22 dejó escrita: «qué pasa cuando caduca
 * a mitad de un turno en un wallboard sin teclado». En modo muro —sin nadie
 * delante con manos libres— un fallo de renovación se avisa con
 * `avisoFalloRenovacion`, y lo que pinte encima decide NO tapar el tablero: un
 * dato viejo señalado como viejo es más útil que una pantalla de acceso que
 * nadie va a rellenar, la misma regla del latido (F0/F2). Fuera de muro, hay
 * alguien con teclado delante: se le pide acceso de inmediato, porque las
 * peticiones fallarían igual sin decírselo.
 *
 * `enMuro` se le pasa desde fuera —`App.jsx` ya sabe `muro.activo`— en vez de
 * que este archivo importe `modoMuro.js` y duplique esa lectura.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { iniciarSesion, quienSoy, renovarSesion } from "@/lib/api/authApi.js";
import {
  borrarSesion, guardarSesion, sesionCaducada, sesionPorCaducar,
} from "@/lib/api/sesion.js";
import { EVENTO_SESION_INVALIDA } from "@/lib/api/sesionInvalida.js";

const Ctx = createContext(null);

/** Cada cuánto se revisa si toca renovar. Más frecuente que el umbral (30 min) para no perderlo por poco. */
const INTERVALO_REVISION_MS = 5 * 60_000;

export function SesionProvider({ enMuro = false, children }) {
  const [estado, setEstado] = useState({
    fase: "verificando",
    habilitada: false,
    usuario: null,
    avisoFalloRenovacion: false,
  });

  // Evita renovar dos veces a la vez si el intervalo dispara mientras una
  // renovación anterior sigue en vuelo.
  const renovando = useRef(false);

  const intentarRenovar = useCallback(async () => {
    if (renovando.current) return;
    renovando.current = true;
    try {
      const r = await renovarSesion();
      guardarSesion(r);
      setEstado((e) => ({ ...e, usuario: r.usuario, avisoFalloRenovacion: false }));
    } catch {
      /*
       * Un fallo de renovación no fuerza NADA por sí solo. Si estamos en
       * muro, se avisa sin tapar; fuera de muro, el siguiente 401 de una
       * petición real disparará `EVENTO_SESION_INVALIDA` y ahí sí se pide
       * acceso. No se fuerza aquí porque el token puede seguir siendo válido
       * un rato más — renovar es proactivo, no es la única oportunidad.
       */
      setEstado((e) => ({ ...e, avisoFalloRenovacion: true }));
    } finally {
      renovando.current = false;
    }
  }, []);

  // Verificación inicial: ¿hace falta acceso, y con qué sesión (si hay una
  // guardada y sigue viva)?
  useEffect(() => {
    let vivo = true;

    quienSoy()
      .then((r) => {
        if (!vivo) return;
        if (!r.habilitada || r.usuario.autenticado) {
          setEstado({ fase: "resuelta", habilitada: r.habilitada, usuario: r.usuario, avisoFalloRenovacion: false });
        } else {
          setEstado({ fase: "pendiente", habilitada: true, usuario: null, avisoFalloRenovacion: false });
        }
      })
      .catch(() => {
        // Sin poder ni preguntar, se asume que hace falta acceso: es el lado
        // que no deja pasar de más. Si de verdad no hay autenticación, el
        // login solo confirmaría eso al primer intento.
        if (vivo) setEstado((e) => ({ ...e, fase: "pendiente" }));
      });

    return () => { vivo = false; };
  }, []);

  // Renovación proactiva, en segundo plano, mientras haya sesión resuelta.
  useEffect(() => {
    if (estado.fase !== "resuelta" || !estado.habilitada) return undefined;

    const revisar = () => {
      if (sesionPorCaducar() && !sesionCaducada()) intentarRenovar();
    };
    revisar(); // por si ya estaba al filo al llegar aquí
    const id = setInterval(revisar, INTERVALO_REVISION_MS);
    return () => clearInterval(id);
  }, [estado.fase, estado.habilitada, intentarRenovar]);

  // Cualquier cliente que reciba un 401 avisa aquí. `caducado` decide si se
  // intenta renovar (aún hay margen de reacción) o se pide acceso ya mismo.
  useEffect(() => {
    const alInvalidarse = (e) => {
      if (e?.detail?.caducado) {
        intentarRenovar().catch(() => {});
      } else {
        borrarSesion();
        setEstado((s) => ({ ...s, fase: "pendiente", usuario: null }));
      }
    };
    window.addEventListener(EVENTO_SESION_INVALIDA, alInvalidarse);
    return () => window.removeEventListener(EVENTO_SESION_INVALIDA, alInvalidarse);
  }, [intentarRenovar]);

  const entrar = useCallback(async (usuario, clave) => {
    const r = await iniciarSesion(usuario, clave);
    guardarSesion(r);
    setEstado({ fase: "resuelta", habilitada: true, usuario: r.usuario, avisoFalloRenovacion: false });
  }, []);

  const valor = {
    ...estado,
    // Sólo bloquea cuando de verdad hace falta pedir acceso Y no estamos en
    // muro (ver la cabecera: en muro se avisa, no se bloquea).
    bloqueando: estado.fase === "pendiente" && !enMuro,
    entrar,
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSesion() debe usarse dentro de <SesionProvider>");
  return ctx;
}

/**
 * ¿Hay sesión resuelta? — para hojas que pueden montarse sin proveedor.
 *
 * Mismo criterio que `useEsSimulado()` (Plan 25 F0) y `useHayFuenteEva()`
 * (F4): sin proveedor responde `false`, que es el lado que no finge una
 * sesión que no existe.
 */
export function useSesionResuelta() {
  const ctx = useContext(Ctx);
  return ctx?.fase === "resuelta";
}
