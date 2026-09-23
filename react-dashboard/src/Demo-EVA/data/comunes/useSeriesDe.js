/**
 * Varias series históricas sobre la misma rejilla, pedidas a UN lector y
 * unidas por marca de tiempo. Es el hook que había dentro de `hooks.js` como
 * `useSeriesHistoricas`, con el lector por parámetro (Plan 42.5 F1): el del
 * tanque le pasa su `evaSource`, una máquina configurada le pasa su fuente.
 * Ninguno de los dos vuelve a escribir este efecto.
 *
 * `lector` es cualquier objeto con `leerSeries(claves, rango)` que devuelva
 * `{ [clave]: { datos, motivo, hasMore, cobertura } }`. Con `lector` nulo —no
 * hay máquina delante— resuelve vacío y sin `loading`, nunca lanza.
 *
 * No se sondea dentro de un mismo rango: se pide al montar y otra vez cuando
 * el RANGO cambia de valor, porque el pasado ya pedido no cambia y el borde
 * derecho lo cubre el valor en vivo. Al cambiar sólo el rango se conserva la
 * rejilla anterior mientras llega la nueva; al cambiar el CONJUNTO de claves
 * se vacía de inmediato: mostrar la curva de otra variable bajo esta etiqueta,
 * aunque sea un instante, sería mentir sobre el dato.
 */
import { useEffect, useRef, useState } from "react";

import { VENTANA } from "./historia.js";
import { claveRango, unir } from "./seriesUnidas.js";

const VACIO = Object.freeze({
  filas: [], porClave: {}, metaPorClave: {}, loading: false, error: null, hasMore: false, cobertura: null,
});

export function useSeriesDe(lector, claves, rango = VENTANA) {
  const [estado, setEstado] = useState({ ...VACIO, loading: true });
  const clavesAnteriores = useRef(null);

  const clavesKey = claves.join("|");
  const key = claveRango(rango);

  useEffect(() => {
    let vivo = true;
    const mismasClaves = clavesAnteriores.current === clavesKey;
    clavesAnteriores.current = clavesKey;

    setEstado((prev) => (mismasClaves ? { ...prev, loading: true, error: null } : { ...VACIO, loading: true }));

    const lista = clavesKey ? clavesKey.split("|") : [];
    if (!lista.length || !lector) {
      setEstado(VACIO);
      return undefined;
    }

    /*
     * UNA llamada para todas las señales, no una por señal: el troceado de una
     * ventana larga lo hace el servidor (`/api/iconics/history/batch`). Y el
     * fallo de la petición viaja en `metaPorClave[*].error` y en `error`, no
     * como rango vacío: una caída de red y un historiador sin muestras tienen
     * que poder distinguirse en la gráfica.
     */
    lector
      .leerSeries(lista, rango)
      .then((porSenal) => {
        if (!vivo) return;
        const porClave = Object.fromEntries(lista.map((k) => [k, porSenal[k]?.datos ?? []]));
        const metaPorClave = Object.fromEntries(
          lista.map((k) => [k, { motivo: porSenal[k]?.motivo ?? null, error: null }]),
        );
        const valores = lista.map((k) => porSenal[k]).filter(Boolean);
        const hasMore = valores.some((r) => r.hasMore);
        // La cobertura es del RANGO, no de cada señal: todas se piden sobre los
        // mismos tramos, así que la primera que la traiga vale para todas.
        const cobertura = valores.find((r) => r.cobertura)?.cobertura ?? null;
        setEstado({ filas: unir(porClave), porClave, metaPorClave, loading: false, error: null, hasMore, cobertura });
      })
      .catch((err) => {
        if (!vivo) return;
        // En `metaPorClave` se queda el TEXTO (sólo se usa como booleano y para
        // depurar); `error` viaja entero, con su código, para `useMensajeDeError`.
        const metaPorClave = Object.fromEntries(lista.map((k) => [k, { motivo: null, error: err.message }]));
        setEstado({ ...VACIO, metaPorClave, error: err });
      });

    return () => {
      vivo = false;
    };
    // `rango` no va en las dependencias a propósito: `key` ya es su
    // representación por valor, y meter el objeto refetchearía en cada render
    // (los presets del selector construyen uno nuevo cada vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lector, clavesKey, key]);

  return estado;
}
