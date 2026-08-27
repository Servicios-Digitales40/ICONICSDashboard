/**
 * Cómo se escribe una señal en pantalla.
 *
 * Se apoya en `@/lib/format.js` —de ahí salen `SIN_DATO` y la regla de que un
 * hueco se pinta como hueco y nunca como cero— y le añade lo único que aquí es
 * distinto: cada señal tiene **sus** decimales y **su** unidad, y algunas no
 * tienen unidad declarada en el servidor.
 *
 * ── LA UNIDAD AUSENTE NO SE RELLENA ────────────────────────────────
 *
 * `SFLUJO_INSTANTANEO` y `SPRESION_RELATIVA` llegan sin unidad: `.Description`
 * está vacía en ICONICS. Poner «l/s» porque suena razonable sería inventarse la
 * magnitud, y un caudal de 45 significa cosas muy distintas en l/s y en m³/h.
 * Se escribe el número solo, y la tarjeta enseña el nombre del tag debajo para
 * que quien lo sepa pueda reconocerlo.
 */
import { SIN_DATO, fmtNum, pctSeguro } from "@/lib/format.js";
import { hasValue } from "@shared/valores.js";

/**
 * Valor de una señal, con su unidad. `51.537` → `"51.5 %"`.
 *
 * Las booleanas devuelven su etiqueta («Automático»), que es lo que el catálogo
 * declara; sin lectura, el guion de siempre.
 */
export function fmtSenal(senal) {
  if (!senal) return SIN_DATO;
  if (senal.tipo === "booleano") return senal.texto ?? SIN_DATO;
  if (!hasValue(senal.valor)) return SIN_DATO;

  const n = fmtNum(senal.valor, senal.decimales);
  return senal.unidad ? `${n} ${senal.unidad}` : n;
}

/** Sólo la cifra, sin unidad: para cuando la caja ya la pinta aparte. */
export const fmtCifra = (senal) =>
  senal && senal.tipo !== "booleano" ? fmtNum(senal.valor, senal.decimales) : SIN_DATO;

/**
 * Formateador de una señal aplicable a un número CUALQUIERA, no sólo al valor
 * vivo. Lo necesitan el conteo animado —que formatea cada fotograma— y los
 * tooltips de las gráficas históricas.
 */
export const formateadorDe = (senal) => (v) =>
  hasValue(v) ? (senal?.unidad ? `${fmtNum(v, senal.decimales)} ${senal.unidad}` : fmtNum(v, senal.decimales)) : SIN_DATO;

/**
 * Posición de un valor dentro de la escala de su señal, en 0-100.
 *
 * Es geometría: anchos de barra, altura del líquido en el tanque 3D, ángulo del
 * arco. Devuelve 0 ante un hueco, así que **no sirve para producir texto** —
 * para eso están las funciones de arriba, que distinguen la ausencia de dato.
 * Es la misma división de trabajo que `pctSeguro` y `fmtPct` en el resto de la
 * aplicación.
 */
export function pctDeEscala(senal, valor = senal?.valor) {
  if (!senal?.escala || !hasValue(valor)) return 0;
  const { min, max } = senal.escala;
  const rango = max - min;
  return rango > 0 ? pctSeguro(((valor - min) / rango) * 100) : 0;
}

/** Ventana del búfer en palabras: `185` → `"3 min"`. */
export function fmtVentana(segundos) {
  if (!segundos) return "sin muestras aún";
  if (segundos < 90) return `${Math.round(segundos)} s`;
  return `${Math.round(segundos / 60)} min`;
}
