/**
 * El único sitio de Demo EVA que crea una fuente de datos.
 *
 * ── POR QUÉ HACE FALTA UN PROVIDER, Y NO BASTA UN HOOK ─────────────
 *
 * Si cada componente llamara a `createEvaSource()` por su cuenta, cada uno
 * abriría **su propio motor de polling**: la vista de Planta pinta ocho
 * tarjetas, y serían ocho temporizadores y ocho peticiones por ciclo para leer
 * exactamente los mismos ocho puntos. Es el problema que `pollingEngine.js`
 * existe para resolver, y se perdería en la última capa.
 *
 * ── POR QUÉ NO HAY UN INTERRUPTOR DE ORIGEN PROPIO ─────────────────
 *
 * El transporte —servidor real o simulador— sale de `useDataSource()`, el
 * provider que ya envuelve la aplicación entera desde `App.jsx`. Demo EVA
 * hereda con eso el interruptor, su cinta de aviso y el remontaje al cambiar de
 * origen, sin duplicar ninguna de las tres cosas.
 *
 * ── POR QUÉ LA SECCIÓN TRAE SU PROPIO SIMULADOR ────────────────────
 *
 * El simulador que había antes generaba los puntos del tablero de Resonac, no
 * los de este árbol: durante un tiempo, pulsar «Simulado» dejó la sección
 * **entera sin dato**. Desde el Plan 9 el simulador es suyo
 * (`data/simulador.js`) y sirve las ocho señales y su historia.
 *
 * Lo que NO cambia es de quién depende la decisión: el origen sigue saliendo de
 * `useDataSource()`, así que el interruptor del Topbar, su cinta de aviso y el
 * remontaje al conmutar siguen siendo los mismos para las dos secciones. Aquí
 * sólo se elige QUÉ transporte construir, nunca CUÁL está activo.
 *
 * ── EL ÁMBITO DEL PROVIDER ES LA VISTA ─────────────────────────────
 *
 * Se envuelve cada vista con `conFuenteEva()` en vez de tocar `App.jsx`, para
 * que el módulo entero sea aditivo: no hay una sola línea de Demo EVA en el
 * arranque de la aplicación. El coste es que navegar entre las subvistas
 * reinicia el búfer de muestras vivas, lo que la interfaz ya rotula («en esta
 * sesión»); a cambio, salir de la sección detiene el sondeo del todo.
 */
import { createContext, useContext, useEffect, useMemo } from "react";

import { TRANSPORTES, useDataSource } from "@/lib/datasource";
import { createRealTransport, presetCaos } from "@/lib/iconics";
import { createEvaSource } from "./evaSource.js";
import { createTransporteEva } from "./simulador.js";

const Ctx = createContext(null);

/**
 * El transporte de esta sección para un origen dado.
 *
 * El simulado es el de Demo EVA; el real es el compartido, que ya sabe hablar
 * con el puente y no distingue de qué árbol son los puntos. El grado de caos
 * sale de `VITE_ICONICS_CHAOS`, que es un ajuste del entorno y no de la
 * instalación: cualquier simulador que se añada debe degradar igual.
 */
const transporteDe = (clase) =>
  clase === TRANSPORTES.SIMULADO
    ? createTransporteEva({ chaos: presetCaos() })
    : createRealTransport();

export function EvaProvider({ children }) {
  /*
   * `useDataSource()` publica la CLASE de transporte, no una fuente: la
   * instancia se construye aquí, que es barata —un cierre, sin estado— y deja
   * el interruptor de origen mandando sobre la sección entera.
   */
  const { transporte } = useDataSource();

  // La fuente se crea una sola vez por transporte. Recrearla en cada render
  // abriría un motor de polling nuevo cada vez.
  const source = useMemo(
    () => createEvaSource({ transport: transporteDe(transporte) }),
    [transporte]
  );

  // Al cambiar de transporte, o al salir de la sección, el motor se para.
  useEffect(() => () => source.stop(), [source]);

  return <Ctx.Provider value={source}>{children}</Ctx.Provider>;
}

export function useEvaSource() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEvaSource debe usarse dentro de <EvaProvider>");
  return ctx;
}

/**
 * Envuelve una vista con su fuente. Se usa en el `export default` de cada
 * vista, para que el registro de rutas no tenga que saber nada de esto.
 */
export function conFuenteEva(Vista) {
  function ConFuenteEva(props) {
    return (
      <EvaProvider>
        <Vista {...props} />
      </EvaProvider>
    );
  }
  ConFuenteEva.displayName = `conFuenteEva(${Vista.displayName ?? Vista.name ?? "Vista"})`;
  return ConFuenteEva;
}
