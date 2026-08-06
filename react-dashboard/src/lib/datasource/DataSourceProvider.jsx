/**
 * El único sitio de la app que sabe si estamos en demo o en vivo.
 *
 * La elección se hace aquí una sola vez, entre dos objetos que cumplen la
 * misma interfaz (ver types.js); aguas abajo nadie pregunta. Repartir un
 * `if (demoMode)` por cada vista multiplicaría los caminos a probar y
 * acabaría dejando alguno pegando al servidor con la demo encendida.
 *
 * Dos detalles que hacen falta para que el interruptor sea real:
 *
 *  - Los hijos se remontan con `key={mode}`. Sin eso, un componente que ya
 *    tuviera datos en memoria los seguiría enseñando y se mezclarían valores
 *    del servidor con los de la demo.
 *  - Al salir de «live» la fuente anterior recibe `stop()`, o su motor
 *    seguiría sondeando en segundo plano.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { createTransport, esTransporteFalso } from "../iconics/transport.js";
import { createDemoSource } from "./demoSource.js";
import { createIconicsSource } from "./iconicsSource.js";

export const MODOS = { LIVE: "live", DEMO: "demo" };

/**
 * ¿Se compiló esta app con el modo demo disponible?
 *
 * Apagado salvo que se pida, y se resuelve en BUILD, igual que
 * `VITE_ICONICS_FAKE`. El motivo es el destino: en un monitor de planta, sin
 * teclado y sin nadie delante, un botón que sustituye la planta entera por
 * datos inventados sólo puede activarse por accidente — y una vez activado,
 * nadie lo desactiva. La cinta de aviso cumple su papel en una demostración
 * con público; no en una pared.
 *
 * Con la bandera apagada sobreviven el INDICADOR de origen y su cinta, que
 * siguen distinguiendo el servidor real del simulador. Lo que desaparece es
 * el interruptor.
 *
 * Se accede a `import.meta.env.VITE_ENABLE_DEMO` **sin** encadenamiento
 * opcional, a diferencia de `esTransporteFalso()`. No es un descuido: el
 * empaquetador sustituye ese acceso por un literal y puede plegar la
 * comparación, y de ese plegado depende que las 13 rutas de propuesta —que se
 * cargan con `import()` dinámico— no lleguen a generar sus trozos en el build
 * de planta. Con `?.` la expresión sobrevive a la compilación y los trozos se
 * emiten igual.
 */
export const DEMO_HABILITADO = import.meta.env.VITE_ENABLE_DEMO === "true";

/**
 * Origen real de los datos en pantalla. Son tres, no dos: el interruptor del
 * Topbar elige la fuente (live/demo), pero dentro de «live» hay dos
 * transportes posibles, el servidor real y el simulador.
 *
 * Es una entidad y no un booleano porque los valores del simulador son
 * plausibles a propósito y no hay forma de distinguirlos del servidor real
 * mirando la pantalla. Los dos orígenes que no son reales están obligados a
 * anunciarse (`avisa`).
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

/** Deriva el origen activo. Vive fuera del provider para poder probarla. */
export function origenActual(mode) {
  if (mode === MODOS.DEMO) return ORIGENES.demo;
  return esTransporteFalso() ? ORIGENES.simulado : ORIGENES.real;
}

const CLAVE_ALMACEN = "iconics.dataSourceMode";

const Ctx = createContext(null);

/**
 * Modo inicial. En una instalación limpia siempre es `live`: arrancar en demo
 * sin que nadie lo pida acabaría enseñando datos falsos en producción.
 *
 * La preferencia guardada se ignora si el build no trae demo. Sin esa línea,
 * una pantalla que quedó en demo antes de apagar la bandera volvería a
 * arrancar en demo para siempre, y ya sin botón para sacarla.
 */
function modoInicial() {
  if (!DEMO_HABILITADO) return MODOS.LIVE;

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
    () =>
      mode === MODOS.DEMO && DEMO_HABILITADO
        ? createDemoSource()
        : createIconicsSource({ transport: createTransport() }),
    [mode]
  );

  // Al cambiar de modo (o al desmontar) la fuente anterior se detiene.
  useEffect(() => () => source.stop?.(), [source]);

  const value = useMemo(
    () => ({
      mode,
      source,
      isDemo: mode === MODOS.DEMO,
      /** Lo lee el Topbar para decidir si pinta un interruptor o una etiqueta. */
      demoDisponible: DEMO_HABILITADO,

      /**
       * Qué se está viendo realmente. Lo consumen el Topbar y la cinta de
       * aviso; `mode` por sí solo no distingue el servidor del simulador.
       */
      origen: origenActual(mode),

      // Las dos comprueban la bandera además de que el Topbar oculte el
      // botón: el interruptor tiene que estar cerrado en el modelo, no sólo
      // en la interfaz, o cualquier consumidor futuro lo reabriría sin
      // enterarse.
      setMode: (nuevo) => {
        if (nuevo === MODOS.DEMO && !DEMO_HABILITADO) return;
        guardarModo(nuevo);
        setModeState(nuevo);
      },
      toggleMode: () => {
        if (!DEMO_HABILITADO) return;
        setModeState((actual) => {
          const nuevo = actual === MODOS.DEMO ? MODOS.LIVE : MODOS.DEMO;
          guardarModo(nuevo);
          return nuevo;
        });
      },
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
