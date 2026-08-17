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
 * Nota sobre el simulador: `fakeTransport` genera valores para los puntos de
 * Resonac (`ac:RESONAC/LIN/1/OEE`), no para los de este árbol. Con el simulador
 * activo, Demo EVA se ve **entera sin dato**, y eso es lo correcto: el simulador
 * no conoce esta instalación, y fingir que sí sería exactamente la clase de
 * dato inventado que el Plan 5 quitó de en medio. En un build normal no ocurre:
 * `transporteInicial()` es el servidor real.
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

import { useDataSource } from "@/lib/datasource";
import { createTransport } from "@/lib/iconics";
import { createEvaSource } from "./evaSource.js";

const Ctx = createContext(null);

export function EvaProvider({ children }) {
  /*
   * `useDataSource()` publica la CLASE de transporte, no la instancia: su
   * `source` es el de Resonac y no sirve aquí. Así que se construye una
   * instancia propia de la misma clase, que es barata —un cierre sobre `fetch`,
   * sin estado— y deja el interruptor de origen mandando sobre las dos
   * secciones por igual.
   */
  const { transporte } = useDataSource();

  // La fuente se crea una sola vez por transporte. Recrearla en cada render
  // abriría un motor de polling nuevo cada vez.
  const source = useMemo(
    () => createEvaSource({ transport: createTransport(transporte) }),
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
