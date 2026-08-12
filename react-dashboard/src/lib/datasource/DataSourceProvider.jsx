/**
 * El único sitio de la app que sabe de dónde salen los datos.
 *
 * La elección se hace aquí una sola vez y aguas abajo nadie pregunta. Repartir
 * un `if` por cada vista multiplicaría los caminos a probar y acabaría dejando
 * alguno pegando al servidor con el simulador encendido.
 *
 * ── QUÉ CONMUTA EL INTERRUPTOR (y qué conmutaba antes) ─────────────
 *
 * Conmuta el **transporte**: el servidor real o el simulador. Antes conmutaba
 * la **fuente** entera, entre `iconicsSource` y un `demoSource` que entregaba
 * `Machine` ya construidas.
 *
 * Ese modo demo se retiró en el Plan 5 porque se saltaba justo lo que hacía
 * falta ejercitar. `fakeTransport.js` lo decía desde el otro lado: «el motor
 * vive por debajo y su trabajo es justamente lo que `demoSource` se salta»
 * —agrupar puntos, trocear lotes, filtrar por calidad, reintentar con backoff
 * y marcar datos rancios—. Ahora hay **un solo camino de datos**: siempre
 * `iconicsSource` sobre el motor de polling, y lo único que cambia es de dónde
 * salen los bytes.
 *
 * Dos detalles que hacen falta para que el interruptor sea real:
 *
 *  - Los hijos se remontan con `key`. Sin eso, un componente que ya tuviera
 *    datos en memoria los seguiría enseñando y se mezclarían valores del
 *    servidor con los del simulador.
 *  - Al cambiar, la fuente anterior recibe `stop()`, o su motor seguiría
 *    sondeando en segundo plano.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { TRANSPORTES, createTransport, transporteInicial } from "../iconics/transport.js";
import { createIconicsSource } from "./iconicsSource.js";

export { TRANSPORTES };

/**
 * ¿Se compiló esta app con el interruptor de origen?
 *
 * Apagado salvo que se pida, y se resuelve en BUILD. El motivo es el destino:
 * en un monitor de planta, sin teclado y sin nadie delante, un botón que
 * sustituye la planta entera por datos inventados sólo puede activarse por
 * accidente — y una vez activado, nadie lo desactiva. La cinta de aviso cumple
 * su papel en una demostración con público; no en una pared.
 *
 * Este razonamiento venía del modo demo y vale **igual** para el simulador: sus
 * valores son plausibles a propósito, así que el riesgo es el mismo.
 *
 * Con la bandera apagada sobreviven el INDICADOR de origen y su cinta, que
 * siguen distinguiendo el servidor real del simulador. Lo que desaparece es el
 * interruptor.
 *
 * Se accede a `import.meta.env` **sin** encadenamiento opcional, para que el
 * empaquetador pueda plegar la comparación. Ver `lib/flags.js`, donde el mismo
 * detalle tiene consecuencias mayores.
 */
export const SIMULADOR_CONMUTABLE = import.meta.env.VITE_ENABLE_SIMULATOR === "true";

/**
 * Origen real de los datos en pantalla.
 *
 * Es una entidad y no un booleano porque los valores del simulador son
 * plausibles a propósito y no hay forma de distinguirlos del servidor real
 * mirando la pantalla. Todo origen que no sea el servidor está obligado a
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
};

/** Transporte → origen. Vive fuera del provider para poder probarla. */
export function origenActual(transporte) {
  return transporte === TRANSPORTES.SIMULADO ? ORIGENES.simulado : ORIGENES.real;
}

const CLAVE_ALMACEN = "iconics.transporte";

const Ctx = createContext(null);

/**
 * Transporte inicial.
 *
 * Por defecto, el que diga el build (`VITE_ICONICS_FAKE`). La preferencia
 * guardada sólo se respeta si el interruptor está compilado: sin esa
 * condición, una pantalla que quedó en simulado antes de apagar la bandera
 * volvería a arrancar en simulado para siempre, y ya sin botón para sacarla.
 */
function transporteAlArrancar() {
  const porDefecto = transporteInicial();
  if (!SIMULADOR_CONMUTABLE) return porDefecto;

  try {
    const guardado = globalThis.localStorage?.getItem(CLAVE_ALMACEN);
    return guardado === TRANSPORTES.SIMULADO || guardado === TRANSPORTES.REAL
      ? guardado
      : porDefecto;
  } catch {
    // localStorage puede fallar (modo privado, políticas del navegador).
    // No es motivo para no arrancar.
    return porDefecto;
  }
}

function guardarTransporte(t) {
  try {
    globalThis.localStorage?.setItem(CLAVE_ALMACEN, t);
  } catch {
    /* preferencia no persistida: molesto, no grave */
  }
}

export function DataSourceProvider({ children }) {
  const [transporte, setTransporteState] = useState(transporteAlArrancar);

  // La fuente se crea una sola vez por transporte. Recrearla en cada render
  // abriría un motor de polling nuevo cada vez.
  const source = useMemo(
    () => createIconicsSource({ transport: createTransport(transporte) }),
    [transporte]
  );

  // Al cambiar de transporte (o al desmontar) la fuente anterior se detiene.
  useEffect(() => () => source.stop?.(), [source]);

  const value = useMemo(() => {
    const origen = origenActual(transporte);

    /*
     * El cierre comprueba la bandera además de que el Topbar oculte el botón:
     * el interruptor tiene que estar cerrado en el MODELO, no sólo en la
     * interfaz, o cualquier consumidor futuro lo reabriría sin enterarse.
     */
    const fijar = (nuevo) => {
      if (!SIMULADOR_CONMUTABLE) return;
      if (nuevo !== TRANSPORTES.REAL && nuevo !== TRANSPORTES.SIMULADO) return;
      guardarTransporte(nuevo);
      setTransporteState(nuevo);
    };

    return {
      transporte,
      source,
      origen,
      /** ¿Lo que se ve NO es el servidor real? Lo usan el Topbar y la cinta. */
      esSimulado: transporte === TRANSPORTES.SIMULADO,
      /** Lo lee el Topbar para decidir si pinta un interruptor o una etiqueta. */
      conmutable: SIMULADOR_CONMUTABLE,

      setTransporte: fijar,
      alternarTransporte: () =>
        fijar(transporte === TRANSPORTES.SIMULADO ? TRANSPORTES.REAL : TRANSPORTES.SIMULADO),
    };
  }, [transporte, source]);

  return (
    <Ctx.Provider value={value}>
      {/* key: fuerza el remontaje del árbol de datos al cambiar de origen. */}
      <div key={transporte} style={{ display: "contents" }}>{children}</div>
    </Ctx.Provider>
  );
}

export function useDataSource() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDataSource debe usarse dentro de <DataSourceProvider>");
  return ctx;
}
