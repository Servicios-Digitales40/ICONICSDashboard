/**
 * Fechas, números y porcentajes en el idioma activo.
 *
 * ── POR QUÉ UN HOOK Y NO FUNCIONES SUELTAS ─────────────────────────
 *
 * Porque el `locale` depende del idioma, y el idioma cambia en caliente. Una
 * función suelta que leyera `i18n.language` al importarse se quedaría con el
 * idioma del arranque: la pantalla cambiaría de textos y las fechas se
 * quedarían en el formato anterior, que es peor que no traducirlas — parece
 * un fallo de datos, no de idioma.
 *
 * ── LOS `Intl.*Format` SE MEMORIZAN A PROPÓSITO ────────────────────
 *
 * Construir un `Intl.DateTimeFormat` es caro y estas funciones se llaman una
 * vez por celda: una tabla de ochenta puntos que se repinta cada quince
 * segundos son ochenta construcciones por ciclo. Con `useMemo` se construyen
 * al cambiar de idioma y no más.
 *
 * ── LO QUE NO SE TOCA ──────────────────────────────────────────────
 *
 * Las unidades. `formatoNumero(2.41)` devuelve «2.41», y quien pinta le añade
 * ` bar`; el separador decimal es regional, la unidad no (§16). Y cambiar de
 * idioma no convierte magnitudes: idioma y sistema de unidades son cosas
 * distintas (§17).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { localeDe } from "./idiomas.js";

/**
 * @returns {{
 *   locale: string,
 *   fecha: (d: Date|number) => string,
 *   hora: (d: Date|number) => string,
 *   fechaHora: (d: Date|number) => string,
 *   numero: (n: number, decimales?: number) => string,
 *   porcentaje: (proporcion: number, decimales?: number) => string,
 * }}
 */
export function useFormato() {
  const { i18n } = useTranslation();
  const locale = localeDe(i18n.language);

  return useMemo(() => {
    const fecha = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
    const hora = new Intl.DateTimeFormat(locale, { timeStyle: "medium" });
    const fechaHora = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });

    /*
     * Los formateadores de número se construyen por número de decimales
     * pedido, y se guardan: el tablero pide sobre todo 0, 1 y 2.
     */
    const numeros = new Map();
    const deNumero = (decimales) => {
      if (!numeros.has(decimales)) {
        numeros.set(
          decimales,
          new Intl.NumberFormat(locale, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimales,
          })
        );
      }
      return numeros.get(decimales);
    };

    const porcentajes = new Map();
    const dePorcentaje = (decimales) => {
      if (!porcentajes.has(decimales)) {
        porcentajes.set(
          decimales,
          new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: decimales })
        );
      }
      return porcentajes.get(decimales);
    };

    /*
     * Un valor que no es un número finito devuelve cadena vacía y NO «0» ni
     * «NaN»: la ausencia de dato no se disfraza de cero (CLAUDE.md §2.4).
     * Quien pinta ya sabe qué poner en su lugar —un guion, «sin dato»— y esa
     * decisión es suya, no de un formateador.
     */
    const finito = (v) => typeof v === "number" && Number.isFinite(v);

    return {
      locale,
      fecha: (d) => (d ? fecha.format(d) : ""),
      hora: (d) => (d ? hora.format(d) : ""),
      fechaHora: (d) => (d ? fechaHora.format(d) : ""),
      numero: (n, decimales = 2) => (finito(n) ? deNumero(decimales).format(n) : ""),
      /**
       * Recibe la PROPORCIÓN, no el tanto por ciento: `porcentaje(0.42)` da
       * «42 %». Es lo que espera `Intl`, y hacerlo al revés es el error
       * habitual — `porcentaje(42)` daría «4200 %».
       *
       * Para un valor que YA viene en tanto por ciento (el nivel del tanque,
       * que ICONICS publica como 69.34) se usa `numero()` y se le añade la
       * unidad, que es lo que hace el tablero.
       */
      porcentaje: (proporcion, decimales = 1) =>
        finito(proporcion) ? dePorcentaje(decimales).format(proporcion) : "",
    };
  }, [locale]);
}
