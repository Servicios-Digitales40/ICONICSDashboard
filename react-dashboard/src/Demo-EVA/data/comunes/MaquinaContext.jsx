/**
 * Qué máquina está mirando esta pantalla. Plan 33 F6.
 *
 * ── QUÉ RESUELVE, Y QUÉ NO ─────────────────────────────────────────
 *
 * Hoy cada vista sabe de qué máquina es porque su ARCHIVO lo dice:
 * `views/tanque/InicioTanque.jsx` es del tanque porque está en esa carpeta.
 * Eso funciona con dos máquinas escritas a mano y deja de funcionar en cuanto
 * las máquinas se dan de alta por configuración: no va a haber una carpeta por
 * cada motor que alguien registre.
 *
 * Este contexto es la otra forma de saberlo: **la máquina viaja en la URL**, y
 * una vista genérica pregunta cuál le tocó.
 *
 * ── LO QUE NO HACE, Y ES LA DECISIÓN MÁS IMPORTANTE ────────────────
 *
 * **No suscribe nada.** No llama a `subscribeSistema`, no monta un motor de
 * sondeo y no lee un solo punto.
 *
 * Es deliberado y tiene dos incidentes detrás. El sondeo arranca por conteo de
 * referencias en `subscribeSistema` (`evaSource.js`), **no al montar una
 * vista**, así que cualquier cosa siempre montada que pida datos los pide en
 * TODAS las pantallas:
 *
 *   · 31-08-2026 — el contador de alarmas del Topbar revivía la lectura del
 *     tanque en cada pestaña.
 *   · 17-09-2026 — el badge de hallazgos hacía lo mismo, y su propia prueba
 *     seguía verde porque contaba `fetch`, no suscripciones.
 *
 * Un contexto que envuelve el Shell entero es exactamente esa clase de pieza.
 * Si además sondeara, revivir una máquina cerrada costaría abrir cualquier
 * pantalla.
 *
 * Así que esto responde **quién**, y quien necesite sus datos los pide aparte.
 * Saber de qué máquina va una pantalla es barato; leerla, no.
 *
 * ── POR QUÉ NO LEE LA URL POR SU CUENTA ────────────────────────────
 *
 * Porque ya la lee `useNavegacion`, y duplicar ese parseo es tener dos
 * versiones de «en qué página estoy» que pueden discrepar. Mismo criterio que
 * `SesionProvider`, al que `App.jsx` le pasa `enMuro` ya calculado en vez de
 * dejar que mire `location` (Plan 25 F9).
 *
 * Aquí entra `params` y el id de la página, ya parseados.
 */
import { createContext, useContext, useMemo } from "react";

import { SISTEMA, SISTEMAS_EN_SERVICIO, sistemaDeRuta } from "@shared/eva/comun/sistemas.js";
import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { useMaquinasConfiguradas } from "./MaquinasConfiguradas.jsx";

const Ctx = createContext(null);

/**
 * La entrada de registro de una máquina CONFIGURADA, o `null`.
 *
 * Se construye con `construirSistema` —la misma función que haría el registro
 * si alguien la registrara— y NO se registra en `SISTEMAS`: el registro es un
 * módulo que valida al cargar y lanza, y meterle entradas en caliente desde
 * un provider de React sería tener dos registros que pueden discrepar. Aquí
 * la entrada vive lo que vive la pantalla.
 *
 * Una configuración que no se puede construir (tipo desconocido, sin
 * variables) da `null`, igual que una máquina que no existe. Quien consuma
 * decide qué decir; lo que no puede es caer en otra máquina de consuelo.
 */
function entradaConfigurada(maquina) {
  if (!maquina) return null;
  try {
    return construirSistema(maquina, tipoDe(maquina.tipo));
  } catch {
    return null;
  }
}

/**
 * El id de máquina de una navegación, o `null`.
 *
 * ── EL ORDEN, Y POR QUÉ EMPIEZA POR LA RUTA ────────────────────────
 *
 *   1. **La ruta**, si es de una máquina concreta. `sistemaDeRuta()` lo
 *      contesta desde el registro —cada sistema declara sus `rutas`— y manda
 *      sobre el parámetro: en `vib-inicio` la máquina es vibraciones, y un
 *      `?maquina=tanque` pegado a mano no puede cambiar de qué habla esa
 *      pantalla.
 *   2. **El parámetro `?maquina=`**, para las vistas genéricas, que son las
 *      que no pertenecen a ninguna: las que llegan con las máquinas
 *      configuradas.
 *
 * Al revés sería peor: un parámetro olvidado en la URL al navegar desde otra
 * pantalla haría que una vista del tanque hablara de vibraciones, con cifras
 * reales y sin un error en ningún sitio.
 */
export function maquinaDeNavegacion({ page, params } = {}) {
  const porRuta = sistemaDeRuta(page);
  if (porRuta) return porRuta;

  const pedida = params?.maquina;
  return typeof pedida === "string" && pedida.trim() ? pedida.trim() : null;
}

/**
 * Envuelve el Shell y dice qué máquina se está mirando.
 *
 * @param {object} props
 * @param {string} props.page      id de la ruta actual
 * @param {object} props.params    parámetros de la URL, ya parseados
 */
export function MaquinaProvider({ page, params, children }) {
  const { maquinas: configuradas } = useMaquinasConfiguradas();

  const valor = useMemo(() => {
    const id = maquinaDeNavegacion({ page, params });
    /*
     * Primero el registro escrito a mano; si no está, las configuradas (Plan
     * 37 F1). El orden importa: un id del registro no puede ser sustituido
     * por una configuración con el mismo nombre —`problemasDeMaquina` ya
     * impide crearla, y aquí se respeta lo mismo—.
     */
    const configurada = id && !SISTEMA[id] ? configuradas.find((m) => m.id === id) ?? null : null;
    const registro = id ? SISTEMA[id] ?? entradaConfigurada(configurada) : null;

    return {
      /** El id pedido, exista o no en el registro. */
      id,
      /**
       * La configuración de la máquina cuando es una CONFIGURADA, o `null`
       * para las escritas a mano. Es lo que necesita quien construya su
       * fuente de datos: las variables con su punto y su rol.
       */
      configurada,
      /**
       * Su entrada del registro, o `null`.
       *
       * `null` con un `id` no nulo es un estado REAL y no un error de
       * programación: alguien pudo guardar el enlace de una máquina que ya no
       * está configurada. Quien lo consuma decide qué decir; lo que no puede
       * es caer en otra máquina de consuelo, que es cómo se contesta
       * correctamente sobre la instalación equivocada.
       */
      registro,
      /** ¿La máquina existe y no está cerrada por mantenimiento? */
      enServicio: Boolean(registro) && !registro.cerrado,
      /** El motivo del cierre, cuando lo hay. Para poder explicarlo. */
      cerrada: registro?.cerrado ?? null,
      /** Las que sí se pueden ofrecer, para cuando la pedida no valga. */
      enServicioIds: [...SISTEMAS_EN_SERVICIO.map((s) => s.id), ...configuradas.map((m) => m.id)],
    };
  }, [page, params, configuradas]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * La máquina de esta pantalla.
 *
 * Fuera del provider devuelve la forma vacía en vez de lanzar: una vista que
 * no está bajo él —una prueba aislada, un render suelto— no debería reventar
 * por preguntar algo que simplemente no aplica.
 */
export function useMaquina() {
  return (
    useContext(Ctx) ?? {
      id: null,
      configurada: null,
      registro: null,
      enServicio: false,
      cerrada: null,
      enServicioIds: SISTEMAS_EN_SERVICIO.map((s) => s.id),
    }
  );
}
