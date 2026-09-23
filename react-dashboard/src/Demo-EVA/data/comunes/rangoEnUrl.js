/**
 * El rango del historiador que viaja en la URL de una vista de Detalle: de
 * `params` al rango, y del rango a `params`. Vivía dentro de
 * `views/tanque/DetalleActivo.jsx` y se sacó (Plan 42.5 F2) para que el
 * Detalle de una máquina configurada use EXACTAMENTE las mismas reglas —un
 * enlace copiado abre el mismo rango, un favorito roto degrada a «Tiempo
 * real»— sin copiarlas.
 *
 * Sin React: es aritmética de calendario y de cadenas.
 */
import { VENTANA, rangoAyer, rangoPersonalizado, rangoSemana } from "./historia.js";

/* Los tres cálculos de rango viajan con sus reglas de URL: quien lee un rango
   de la URL es quien lo recalcula al elegir un preset. Vitest no se quejó de
   un import de `rangoPersonalizado` que aquí no existía; Rollup sí, en el
   build. Por eso el build forma parte de la puerta de cada fase. */
export { rangoAyer, rangoPersonalizado, rangoSemana };

/**
 * Con qué función se calcula el rango de cada acceso rápido contra el
 * historiador. «Tiempo real» no está aquí a propósito: no le pide nada al
 * historiador, lee del búfer en vivo.
 */
export const PRESETS_RANGO = Object.freeze({ ayer: rangoAyer, semana: rangoSemana });
export const PRESETS_VALIDOS = Object.freeze(["vivo", "ayer", "semana", "personalizado"]);

/** `Date` → "2026-08-19": lo único que sobrevive el viaje de ida y vuelta por la URL. */
export const aFechaUrl = (dia) => dia.toISOString().slice(0, 10);

/**
 * "2026-08-19" → `Date` a medianoche LOCAL de ese día.
 *
 * `new Date("2026-08-19")` la interpreta como medianoche UTC: en cualquier
 * huso al oeste de Greenwich eso cae en la TARDE del día anterior, y el rango
 * personalizado se arrastraba un día hacia atrás perdiendo justo las horas
 * de la tarde, que es cuando el historiador de esta planta tiene muestras.
 * Construir con año/mes/día por separado usa el constructor LOCAL, igual que
 * hace el calendario al generar los días que se clickean.
 */
export function deFechaUrl(fechaIso) {
  const [anio, mes, dia] = String(fechaIso).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

/**
 * `params` de la URL → `{ presetActivo, rango, personalizado }`.
 *
 * Un valor corrupto —un `rango` desconocido, o un `personalizado` con fechas
 * que no parsean— cae en «vivo»: un favorito roto no puede tumbar la vista,
 * tiene que degradar a algo que funcione.
 */
export function leerRangoDeUrl(params) {
  const preset = PRESETS_VALIDOS.includes(params?.rango) ? params.rango : "vivo";

  if (preset === "personalizado") {
    const { desde, hasta } = params ?? {};
    if (desde && hasta) {
      const rango = rangoPersonalizado(deFechaUrl(desde), deFechaUrl(hasta));
      if (!Number.isNaN(rango.inicio.getTime()) && !Number.isNaN(rango.fin.getTime())) {
        return { presetActivo: "personalizado", rango, personalizado: { desde, hasta } };
      }
    }
    return { presetActivo: "vivo", rango: VENTANA, personalizado: null };
  }

  const calculador = PRESETS_RANGO[preset];
  return { presetActivo: preset, rango: calculador ? calculador() : VENTANA, personalizado: null };
}

/**
 * El rango actual, en la forma que espera la URL. Lo usa el cambio de
 * pestaña: `navigate()` reemplaza los parámetros enteros —no los mezcla—, y
 * sin esto cambiar de activo borraría el rango sin que nadie lo pidiera.
 */
export function parametrosDeRango(presetActivo, personalizado) {
  if (presetActivo === "personalizado" && personalizado) {
    return { rango: "personalizado", desde: personalizado.desde, hasta: personalizado.hasta };
  }
  return { rango: presetActivo };
}
