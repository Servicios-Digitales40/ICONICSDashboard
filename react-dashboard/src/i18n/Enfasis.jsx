/**
 * Pinta en negrita lo que una frase traducida marca con `<b>`.
 *
 * ── POR QUÉ EXISTE, HABIENDO `<Trans>` ─────────────────────────────
 *
 * Porque varios avisos de este tablero destacan UNA palabra dentro de un
 * párrafo, y esa palabra es la mitad del mensaje: «significa que **no se
 * sabe**», «las **alarmas del servidor mandan** sobre esta pantalla». Partir
 * la frase en tres claves para no perder la negrita no es una opción — el
 * orden de las palabras cambia entre idiomas, que es justo lo que una clave
 * por frase existe para permitir.
 *
 * `<Trans>` de react-i18next hace esto y mucho más: componentes anidados,
 * interpolación con elementos dentro, plurales con nodos. Nada de eso se usa
 * aquí, y **importarlo costó 11 KB en el chunk de arranque** —medido: `vendor`
 * pasó de 264,01 a 275,05 KB y `verificar-bundle.mjs` lo paró en seco—. Ese
 * chunk lo descarga entero cualquier pantalla del tablero, incluido un
 * wallboard que sólo enseña un número. Doce líneas aquí cuestan cero.
 *
 * ── LO QUE SOPORTA, Y POR QUÉ NO MÁS ───────────────────────────────
 *
 * Sólo `<b>…</b>`, sin anidar. No es una limitación que haya que ir levantando
 * según haga falta: es el contrato. `scripts/verificar-i18n.mjs` comprueba que
 * ninguna traducción use otra etiqueta y que las que hay abran y cierren, así
 * que un `<i>` en un JSON no llega a pantalla como texto literal — falla antes,
 * en `npm run verificar`.
 *
 * La interpolación NO pasa por aquí: se hace en `traducir(clave, valores)`
 * como en cualquier otra frase, y esto sólo recibe el resultado. Un solo
 * camino para las variables.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   <p><Enfasis>{traducir("diagnostics:risks.uncheckedNote")}</Enfasis></p>
 */

/** `<b>` … `</b>`, sin anidar, con saltos de línea dentro. */
const NEGRITA = /<b>([\s\S]*?)<\/b>/g;

export function Enfasis({ children }) {
  const texto = String(children ?? "");
  if (!texto.includes("<b>")) return texto;

  const partes = [];
  let cursor = 0;

  for (const trozo of texto.matchAll(NEGRITA)) {
    if (trozo.index > cursor) partes.push(texto.slice(cursor, trozo.index));
    partes.push(<strong key={trozo.index}>{trozo[1]}</strong>);
    cursor = trozo.index + trozo[0].length;
  }

  /*
   * La cola. Sin esto, una frase que termina después del `</b>` perdería el
   * final —«: sus límites los puso quien conoce el proceso»— sin ruido
   * ninguno, que es el modo de fallo que hace peligrosa una función así.
   */
  if (cursor < texto.length) partes.push(texto.slice(cursor));

  return <>{partes}</>;
}

export default Enfasis;
