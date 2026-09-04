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
 * ── UNA SEGUNDA FORMA DE ENTRAR: SSO SILENCIOSO ────────────────────
 *
 * Cuando el asistente vive empotrado como `<iframe>` dentro del HMI nativo
 * de ICONICS (AnyGlass/GraphWorX), el navegador YA tiene la cookie de sesión
 * de ICONICS puesta — el técnico entró una vez, por la pantalla de ICONICS.
 * Antes de enseñar el formulario de login, `intentarSsoSilencioso()` prueba
 * un iframe OCULTO contra ICONICS con `prompt=none`: si la cookie está,
 * ICONICS responde con un código sin mostrar nada, y ese código entra solo.
 * Si no —sesión caducada, o la app abierta fuera de ICONICS para probarla—
 * el iframe oculto se descarta y aparece el login de siempre. El backend
 * decide si la función existe siquiera (`GET /api/sesion/silenciosa/iniciar`,
 * `habilitado: false` sin `SSO_REDIRECT_URI`); el frontend no necesita saber
 * si está configurada de antemano.
 *
 * ── Y LA VUELTA: CERRAR AQUÍ CUANDO SE CIERRA EN ICONICS ───────────
 *
 * El servidor de identidad de ICONICS no expone `frontchannel_logout` ni
 * `check_session_iframe` —lo dice su propio documento de descubrimiento
 * OIDC, comprobado a mano el 04-09-2026—, así que no hay forma de que
 * ICONICS nos AVISE cuando el técnico cierra sesión ahí. La alternativa es
 * preguntar: `sondearSesionIconics()` repite el mismo truco del iframe
 * oculto con `prompt=none`, cada `INTERVALO_COMPROBACION_SESION_MS`, mientras
 * haya sesión abierta. Sólo un `login_required` EXPLÍCITO cierra la sesión de
 * aquí — un timeout o un error de red NO, porque eso expulsaría al técnico
 * por un parpadeo de la red en vez de por haber cerrado sesión de verdad. Es
 * la misma distinción de fondo que ya hace `pedir.js` con el 401 de
 * caducidad: un motivo concreto cierra, cualquier otra cosa se ignora.
 *
 * ── Y EL CASO QUE "SIGUE VIVA" NO CUBRE: OTRA PERSONA ──────────────
 *
 * "Sigue habiendo sesión" y "sigue siendo la MISMA persona" no son la misma
 * pregunta. Con "In-house applications use web login" activo en ICONICS, un
 * técnico puede cerrar sesión y otro entrar sin que de por medio haya un
 * hueco de `login_required` que el sondeo llegue a ver —y aunque lo hubiera,
 * la sesión de ESTE puente seguiría siendo la del primero, porque nada la
 * había tocado—. Por eso el sondeo no se conforma con "sí/no": CANJEA el
 * código igual que el login inicial, y si el usuario que vuelve no es el que
 * ya estaba, se adopta como si acabara de entrar —conversación incluida: un
 * técnico nuevo no hereda en silencio la del anterior—. El backend hace la
 * mitad de este trabajo (`POST /api/sesion/silenciosa` reconcilia contra la
 * sesión que ya exista en vez de duplicarla cada minuto); ver su cabecera.
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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { alCaducarSesion, pedirJson } from "@/lib/api/pedir.js";
import { borrar as olvidarConversacion } from "@/features/asistente/lib/persistencia.js";

const SesionContexto = createContext(null);

/** Estados posibles. `comprobando` es el inicial y por eso existe. */
export const ESTADO = Object.freeze({
  comprobando: "comprobando",
  fuera: "fuera",
  dentro: "dentro",
});

/** Margen para que ICONICS conteste al iframe oculto antes de rendirse. */
const TIMEOUT_SSO_SILENCIOSO_MS = 5000;

/** Cada cuánto se pregunta si la sesión de ICONICS sigue viva, una vez dentro. */
const INTERVALO_COMPROBACION_SESION_MS = 15_000;

/**
 * El primitivo compartido: abre un iframe OCULTO hacia una URL de
 * `authorize` con `prompt=none` y espera el mensaje que manda
 * `/auth/silencioso` cuando ICONICS responde. Ni entra ni sale de nada por
 * su cuenta — sólo dice qué contestó ICONICS.
 *
 * @param {AbortSignal} signal Cancela el intento —listener, temporizador e
 *   iframe— de inmediato. Sin esto, un componente que se desmonta con el
 *   intento en vuelo (React Strict Mode monta y desmonta dos veces seguidas
 *   en desarrollo) deja un listener de `message` vivo para siempre, oyendo
 *   una ventana que ya nadie mira.
 * @returns {Promise<{code: string}|{error: string}|null>} `null` si abortó o
 *   si ICONICS no contestó a tiempo — NO es lo mismo que un `error` explícito.
 */
function preguntarleAIconics(url, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }

    let resuelto = false;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");

    const terminar = (resultado) => {
      if (resuelto) return;
      resuelto = true;
      window.removeEventListener("message", alRecibirMensaje);
      signal.removeEventListener("abort", alAbortar);
      clearTimeout(temporizador);
      iframe.remove();
      resolve(resultado);
    };

    function alAbortar() {
      terminar(null);
    }

    function alRecibirMensaje(evento) {
      // Mismo origen a propósito: `/auth/silencioso` lo sirve este mismo
      // backend, así que un mensaje de otro origen no puede ser el nuestro.
      if (evento.origin !== window.location.origin) return;
      if (evento.data?.tipo !== "sso-silencioso") return;
      terminar(evento.data.code ? { code: evento.data.code } : { error: evento.data.error ?? "" });
    }

    window.addEventListener("message", alRecibirMensaje);
    signal.addEventListener("abort", alAbortar);
    const temporizador = setTimeout(() => terminar(null), TIMEOUT_SSO_SILENCIOSO_MS);

    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

/**
 * Un intento de SSO silencioso, de punta a punta: pregunta, y si viene un
 * código, lo canjea por una sesión.
 *
 * @param {(usuario: string) => void} alEntrar Se llama SÓLO si el canje del
 *   código sale bien — quien invoca decide qué hacer con el estado de sesión.
 * @returns {Promise<boolean>} si entró.
 */
function intentarSsoSilencioso(alEntrar, signal) {
  return pedirJson("/api/sesion/silenciosa/iniciar")
    .then(async (intento) => {
      if (signal.aborted || !intento.habilitado) return false;

      const respuesta = await preguntarleAIconics(intento.url, signal);
      if (!respuesta?.code) return false; // sin respuesta, o `login_required`: no hay nada que canjear

      try {
        const datos = await pedirJson("/api/sesion/silenciosa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: respuesta.code, verificador: intento.verificador }),
        });
        if (signal.aborted) return false;
        alEntrar(datos.usuario);
        return true;
      } catch {
        return false;
      }
    })
    .catch(() => false);
}

/**
 * El sondeo periódico: pregunta con `prompt=none` y RECONCILIA con quien
 * responda — no sólo si sigue habiendo sesión. Ver las dos notas "Y LA
 * VUELTA" / "Y EL CASO QUE..." en la cabecera del archivo.
 *
 * `tipo` es uno de:
 *  - `"sin-cambio"` — sigue siendo la misma persona. No hay nada que hacer.
 *  - `"usuario-nuevo"` — otra persona entró en ICONICS mientras tanto.
 *  - `"cerrado"` — `login_required` EXPLÍCITO: no hay sesión de ICONICS.
 *  - `"inconcluso"` — sin respuesta, timeout, o un error de red. NUNCA es
 *    motivo para tocar la sesión — sólo `"cerrado"` lo es, y `"usuario-nuevo"`
 *    para adoptar al que llegó.
 *
 * @returns {Promise<{tipo: string, usuario?: string}>}
 */
function sondearSesionIconics(signal) {
  return pedirJson("/api/sesion/silenciosa/iniciar")
    .then(async (intento) => {
      if (signal.aborted || !intento.habilitado) return { tipo: "inconcluso" };

      const respuesta = await preguntarleAIconics(intento.url, signal);
      if (!respuesta) return { tipo: "inconcluso" };
      if (respuesta.error === "login_required") return { tipo: "cerrado" };
      if (!respuesta.code) return { tipo: "inconcluso" }; // otro error: no concluyente

      try {
        const datos = await pedirJson("/api/sesion/silenciosa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: respuesta.code, verificador: intento.verificador }),
        });
        if (signal.aborted) return { tipo: "inconcluso" };
        return datos.sinCambios ? { tipo: "sin-cambio" } : { tipo: "usuario-nuevo", usuario: datos.usuario };
      } catch {
        return { tipo: "inconcluso" };
      }
    })
    .catch(() => ({ tipo: "inconcluso" }));
}

export function SesionProvider({ children }) {
  const [estado, setEstado] = useState(ESTADO.comprobando);
  const [usuario, setUsuario] = useState(null);
  /*
   * Espejo de `estado` legible desde el listener de caducidad SIN que ese
   * listener tenga que ir en las dependencias del efecto que lo registra —
   * ver la nota junto a `alCaducarSesion` más abajo.
   */
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

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
    const abortoSso = new AbortController();

    pedirJson("/api/sesion")
      .then((datos) => {
        if (!vigente) return;
        setUsuario(datos.usuario);
        setEstado(ESTADO.dentro);
      })
      .catch(() =>
        // Sin sesión: antes de pedir usuario y contraseña, se intenta el SSO
        // silencioso — ver la cabecera de este archivo. `entroSolo` en falso
        // es el camino normal fuera de un HMI de ICONICS, no un error.
        intentarSsoSilencioso((usuario) => {
          if (!vigente) return;
          setUsuario(usuario);
          setEstado(ESTADO.dentro);
        }, abortoSso.signal).then((entroSolo) => {
          if (vigente && !entroSolo) setEstado(ESTADO.fuera);
        })
      );

    return () => {
      vigente = false;
      // Cancela el iframe oculto y su listener AL INSTANTE si el intento
      // seguía en vuelo. Ver la nota de `intentarSsoSilencioso`.
      abortoSso.abort();
    };
  }, []);

  /*
   * ── SLO POR SONDEO: SI CIERRAN EN ICONICS, SE CIERRA AQUÍ ──────────
   *
   * Ver "Y LA VUELTA" en la cabecera del archivo. Sólo corre con sesión
   * abierta —no tiene sentido preguntar por una sesión de ICONICS mientras
   * se está decidiendo la nuestra— y se apaga solo si `estado` cambia por
   * cualquier otro camino (por ejemplo, `salir()`).
   */
  useEffect(() => {
    if (estado !== ESTADO.dentro) return;

    const aborto = new AbortController();
    const intervalo = setInterval(() => {
      sondearSesionIconics(aborto.signal).then((resultado) => {
        if (resultado.tipo === "cerrado") {
          setUsuario(null);
          setEstado(ESTADO.fuera);
        } else if (resultado.tipo === "usuario-nuevo") {
          // Otra persona, sin que la sesión de este puente llegara a caducar
          // de por medio — ver "Y EL CASO QUE..." en la cabecera. No hereda
          // la conversación del técnico anterior.
          olvidarConversacion();
          setUsuario(resultado.usuario);
        }
        // "sin-cambio" e "inconcluso": nada que hacer.
      });
    }, INTERVALO_COMPROBACION_SESION_MS);

    return () => {
      clearInterval(intervalo);
      aborto.abort();
    };
  }, [estado]);

  /*
   * La caducidad descubierta por cualquier petición. No borra la conversación:
   * ver la cabecera.
   *
   * ── POR QUÉ SE IGNORA MIENTRAS `estado === comprobando` ────────────
   *
   * La comprobación inicial (`GET /api/sesion`) responde 401 con el MISMO
   * `motivo: "sesion"` que una caducidad real a mitad de uso — es, técnica y
   * literalmente, "no hay sesión" en los dos casos — así que `pedir()` avisa
   * por este mismo canal las dos veces. Sin la guarda, ese aviso saltaba a
   * `ESTADO.fuera` de inmediato en CADA carga de la página, antes incluso de
   * que el intento de SSO silencioso (más arriba) llegara a abrir su iframe:
   * el respaldo se disparaba antes que el intento que se supone respalda.
   * Mientras se está decidiendo el estado inicial, quien manda es esa lógica
   * explícita — el aviso genérico sólo importa una vez que ya hubo sesión que
   * perder.
   */
  useEffect(
    () =>
      alCaducarSesion(() => {
        if (estadoRef.current === ESTADO.comprobando) return;
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
