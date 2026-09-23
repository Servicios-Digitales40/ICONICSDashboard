/**
 * La lista de los puntos de una máquina configurada que NO están entregando
 * lectura, con su motivo (Plan 42.5 F6, D17).
 *
 * ── POR QUÉ UNA LISTA, Y NO SÓLO LA CIFRA ────────────────────────────
 *
 * El Inicio decía «80 / 86» y nadie podía saber cuáles eran las seis. La
 * fuente ya lo sabía —`detalleSinDato`, punto y motivo, calculado en cada
 * lectura— y ninguna vista lo leía. Aquí se pinta plegado bajo la cifra: quien
 * sólo quiere el titular no paga la lista, y quien pregunta «¿cuáles?» la
 * tiene a un clic, agrupada por motivo, con el rótulo de la variable y su tag
 * para buscarlo en ICONICS.
 *
 * El motivo sale del código que dejó el motor de sondeo (`shared/quality.js`:
 * `sin_entrega`, `incierta`, `mala`, `desconocida`) y se rotula con los textos
 * que ya usa la ficha de procedencia. Un punto sin motivo —todavía no llegó
 * ninguna lectura— se dice así, no como «mala».
 *
 * Es un `<details>` nativo: plegable, accesible con teclado y sin estado que
 * mantener. Con cero mudos no se pinta nada: una lista vacía bajo «86 / 86»
 * sólo estorbaría.
 */
import { useTranslation } from "react-i18next";

import { MONO } from "../base.jsx";

/** De código del motor a clave de texto de la ficha de procedencia. */
const TEXTO_DE_MOTIVO = Object.freeze({
  sin_entrega: "provenance.reason.sinEntrega",
  incierta: "provenance.reason.calidadIncierta",
  mala: "provenance.reason.calidadMala",
  desconocida: "provenance.reason.calidadDesconocida",
});

/**
 * @param {object} props
 * @param {Array<{punto: string, motivo: {codigo?: string}|null}>} props.detalle  `detalleSinDato` de la fuente
 * @param {(punto: string) => string|null} [props.rotuloDe]  el rótulo de la variable de ese punto, si se sabe
 */
export function ListaDeMudos({ detalle, rotuloDe = () => null, t }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("machines");
  if (!detalle?.length) return null;

  /* Agrupado por motivo, en el orden en que aparece el primero de cada uno. */
  const grupos = new Map();
  for (const d of detalle) {
    const codigo = d.motivo?.codigo ?? "sin_lectura";
    if (!grupos.has(codigo)) grupos.set(codigo, []);
    grupos.get(codigo).push(d.punto);
  }
  /* Sin motivo: no llegó ninguna lectura. Un código que esta pieza no conoce se
     enseña tal cual —se puede buscar— en vez de disfrazarlo de «no llegó». */
  const textoDe = (codigo) =>
    TEXTO_DE_MOTIVO[codigo] ? traducir(TEXTO_DE_MOTIVO[codigo]) : codigo === "sin_lectura" ? traducir("provenance.neverRead") : codigo;

  return (
    <details style={{ fontSize: 12, color: t.textSoft, fontFamily: "'Inter', sans-serif" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, color: t.text }}>
        {traducir("maquina.mudas.summary", { count: detalle.length })}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {[...grupos.entries()].map(([codigo, puntos]) => (
          <div key={codigo}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>
              {textoDe(codigo)} · {puntos.length}
            </div>
            <ul style={{ margin: "3px 0 0", paddingLeft: 16 }}>
              {puntos.map((punto) => {
                const rotulo = rotuloDe(punto);
                return (
                  <li key={punto} style={{ marginTop: 2 }}>
                    {rotulo && <span>{rotulo} </span>}
                    <span style={{ fontFamily: MONO, fontSize: 11, color: t.textFaint }}>{punto}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
