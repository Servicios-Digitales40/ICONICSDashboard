/**
 * lib/datasource/DataSourceProvider.jsx
 * ------------------------------------------------------------------
 * EL ÚNICO SITIO DE LA APP QUE SABE SI ESTAMOS EN DEMO O EN VIVO.
 *
 * ── POR QUÉ VIVE EN LA RAÍZ Y NO EN LOS COMPONENTES ────────────────
 *
 * La forma obvia de implementar el botón de demo es un `if (demoMode)`
 * en cada vista. Es también la peor: multiplica el número de caminos que
 * hay que probar, ensucia componentes que no tienen por qué saber de
 * dónde salen sus datos, y garantiza que tarde o temprano alguien olvide
 * un camino y siga pegando al servidor con la demo encendida.
 *
 * Aquí se elige UNA vez entre dos objetos que cumplen la misma interfaz
 * (ver types.js). Aguas abajo, nadie pregunta.
 *
 * ── EL REMONTAJE POR `key` (riesgo R-09) ───────────────────────────
 *
 * Al cambiar de modo, los hijos se remontan mediante `key={mode}`. Sin
 * eso, un componente que ya tuviera datos en memoria seguiría
 * enseñándolos: quedarían valores del servidor real mezclados con los de
 * la demo, que es justo la confusión que este interruptor debe evitar.
 *
 * ── PARAR DE VERDAD ────────────────────────────────────────────────
 *
 * Al salir de «live» la fuente anterior recibe `stop()`. No basta con
 * dejar de leer sus datos: el motor seguiría sondeando en segundo plano
 * y la demo no sería una demo, sería una máscara.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { createTransport, esTransporteFalso } from "../iconics/transport.js";
import { createDemoSource } from "./demoSource.js";
import { createIconicsSource } from "./iconicsSource.js";

export const MODOS = { LIVE: "live", DEMO: "demo" };

/**
 * ORIGEN REAL DE LOS DATOS EN PANTALLA. Son TRES, no dos.
 *
 * El interruptor del Topbar elige la FUENTE (live/demo), pero dentro de
 * «live» hay a su vez dos transportes: el servidor real y el simulador.
 * Eso da tres estados con apariencia idéntica y significado muy distinto.
 *
 * ── POR QUÉ ESTO ES UNA ENTIDAD Y NO UN BOOLEANO ───────────────────
 *
 * Durante un tiempo la app mostraba «En vivo» tanto leyendo ICONICS como
 * leyendo el simulador, sin nada que los distinguiera. Los valores del
 * simulador son plausibles a propósito —el OEE es el producto real de
 * sus factores, las piezas crecen, los estados rotan— así que no había
 * forma de notarlo mirando la pantalla.
 *
 * Es el mismo riesgo que motivó la cinta del modo demo, y era peor:
 * la demo al menos avisaba. Se resuelve igual, nombrando los tres
 * estados en un solo sitio y obligando a los dos que NO son reales a
 * anunciarse.
 */
export const ORIGENES = {
  real: {
    key: "real",
    label: "En vivo",
    descripcion: "Leyendo el servidor ICONICS",
    token: "success",
    avisa: false,
  },
  simulado: {
    key: "simulado",
    label: "Simulado",
    descripcion: "Datos generados, sin conexión con ICONICS",
    token: "violet",
    avisa: true,
  },
  demo: {
    key: "demo",
    label: "Demo",
    descripcion: "Datos de ejemplo fijos, sin conexión con ICONICS",
    token: "amber",
    avisa: true,
  },
};

/**
 * Deriva el origen activo. Extraída del provider para poder probarla:
 * una edición descuidada la dejó una vez con «real» inalcanzable —las
 * dos ramas finales devolvían `simulado`— y ninguna prueba lo notó
 * porque la derivación vivía dentro del useMemo.
 */
export function origenActual(mode) {
  if (mode === MODOS.DEMO) return ORIGENES.demo;
  return esTransporteFalso() ? ORIGENES.simulado : ORIGENES.real;
}

const CLAVE_ALMACEN = "iconics.dataSourceMode";

const Ctx = createContext(null);

/**
 * Modo inicial. `live` es SIEMPRE el valor por defecto en una instalación
 * limpia: una app que arranca en demo sin que nadie lo haya pedido es una
 * app que un día enseñará datos falsos en producción.
 */
function modoInicial() {
  try {
    const guardado = globalThis.localStorage?.getItem(CLAVE_ALMACEN);
    return guardado === MODOS.DEMO ? MODOS.DEMO : MODOS.LIVE;
  } catch {
    // localStorage puede fallar (modo privado, políticas del navegador).
    // No es motivo para no arrancar.
    return MODOS.LIVE;
  }
}

function guardarModo(modo) {
  try {
    globalThis.localStorage?.setItem(CLAVE_ALMACEN, modo);
  } catch {
    /* preferencia no persistida: molesto, no grave */
  }
}

export function DataSourceProvider({ children }) {
  const [mode, setModeState] = useState(modoInicial);

  // La fuente se crea una sola vez por modo. Recrearla en cada render
  // abriría un motor de polling nuevo cada vez.
  const source = useMemo(
    () => (mode === MODOS.DEMO ? createDemoSource() : createIconicsSource({ transport: createTransport() })),
    [mode]
  );

  // Al cambiar de modo (o al desmontar) la fuente anterior se detiene.
  useEffect(() => () => source.stop?.(), [source]);

  const value = useMemo(
    () => ({
      mode,
      source,
      isDemo: mode === MODOS.DEMO,

      /**
       * Qué se está viendo REALMENTE. Es lo que deben consumir el Topbar
       * y la cinta de aviso: `mode` por sí solo no distingue el servidor
       * real del simulador, que es justo la confusión a evitar.
       */
      origen: origenActual(mode),

      setMode: (nuevo) => {
        guardarModo(nuevo);
        setModeState(nuevo);
      },
      toggleMode: () =>
        setModeState((actual) => {
          const nuevo = actual === MODOS.DEMO ? MODOS.LIVE : MODOS.DEMO;
          guardarModo(nuevo);
          return nuevo;
        }),
    }),
    [mode, source]
  );

  return (
    <Ctx.Provider value={value}>
      {/* key: fuerza el remontaje del árbol de datos al cambiar de modo. */}
      <div key={mode} style={{ display: "contents" }}>{children}</div>
    </Ctx.Provider>
  );
}

export function useDataSource() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDataSource debe usarse dentro de <DataSourceProvider>");
  return ctx;
}
