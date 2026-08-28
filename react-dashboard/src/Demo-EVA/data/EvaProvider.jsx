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
 * ── EL ÁMBITO DEL PROVIDER ES EL SHELL, NO LA VISTA ─────────────────
 *
 * Hasta que la app tuvo el tablero de Resonac como sección aparte, cada vista
 * se envolvía con `conFuenteEva()` y el sondeo se detenía al salir de Demo
 * EVA. Desde que ese tablero se retiró (agosto de 2026, ver la cabecera de
 * `app/routes/routes.jsx`) TODA la app es Demo EVA, así que un provider por
 * vista sólo abría un motor de polling nuevo en cada navegación sin ahorrar
 * nada. Ahora `<EvaProvider>` envuelve el Shell entero en `App.jsx`, junto al
 * resto de providers globales: el sondeo corre mientras la aplicación esté
 * abierta, y es lo que necesita `EstadoMaquinaBanner` para verse en cualquier
 * pestaña sin que cada una vuelva a montar su propia fuente.
 */
import { createContext, useContext, useEffect, useMemo } from "react";

import { TRANSPORTES, useDataSource } from "@/lib/datasource";
import { presetCaos } from "@/lib/iconics";
import { createEvaSource } from "./evaSource.js";
import { createTransporteEva } from "./simulador.js";
import { transporteDe } from "./transportes.js";

const Ctx = createContext(null);

/**
 * El transporte de esta sección para un origen dado.
 *
 * Es `transporteDe("tanque", …)` —la misma función que usa cualquier otra
 * máquina— **salvo en el origen simulado**, donde esta sección necesita algo
 * que las demás no tienen: `readSerie()`, el sustituto del historiador. Por eso
 * aquí se construye `createTransporteEva`, que es ese `read` genérico más su
 * historia.
 *
 * El día que otra máquina tenga serie propia, esta rama es la que hay que
 * mirar: o el registro declara también un `serie`, o cada sección sigue
 * poniendo la suya. Con un solo ejemplo no hay forma de saber cuál de las dos
 * es la buena, así que no se decide todavía.
 */
const transporteDeLaSeccion = (clase) =>
  clase === TRANSPORTES.SIMULADO
    ? createTransporteEva({ chaos: presetCaos() })
    : transporteDe("tanque", clase);

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
    () => createEvaSource({ transport: transporteDeLaSeccion(transporte) }),
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
