/**
 * a11y.js
 * ------------------------------------------------------------------
 * Un solo ayudante: auditar un árbol ya renderizado con axe-core y fallar si
 * aparece una violación grave. Se importa a propósito — no vive en
 * `test/setup.js` — porque no es un relleno de entorno como `ResizeObserver`:
 * es una aserción, y una vista sin `import { auditarAccesibilidad }` sigue
 * siendo una vista sin comprobar, no una que pasa por descuido.
 *
 * ── POR QUÉ SÓLO "SERIOUS" Y "CRITICAL" ─────────────────────────────
 *
 * axe-core reparte cada violación en cuatro niveles (`minor`, `moderate`,
 * `serious`, `critical`). Fallar la prueba ante CUALQUIER nivel convierte el
 * arnés en ruido desde el primer día: reglas de buena práctica como
 * `region` o `landmark-one-main` son `moderate` y piden decisiones de
 * estructura de página, no un defecto que rompa algo para un lector de
 * pantalla. Lo que aquí se bloquea es lo que de verdad impide usar la
 * pantalla: un botón sin nombre accesible, una imagen sin alternativa, ARIA
 * mal usado. Lo demás se revisa a mano — como los landmarks de esta misma
 * fase, confirmados con una aserción propia y no con este arnés.
 *
 * ── POR QUÉ CONTRA `document.body` Y NO CONTRA EL `container` ───────
 *
 * Medido: las reglas de landmark (`region`, `landmark-one-main`) sólo
 * encuentran algo que decir cuando se audita la PÁGINA completa. Contra el
 * `container` que devuelve `render()` — un fragmento montado aparte — esas
 * reglas no tienen page context y no reportan nada, aunque el defecto exista.
 * Como el árbol de pruebas de este proyecto monta un componente a la vez,
 * auditar `document.body` es sencillamente auditar lo mismo que `container`
 * más el contexto de página que las reglas de landmark necesitan — no cambia
 * el alcance para ningún otro tipo de regla.
 *
 * ── LO QUE ESTO NO CUBRE, A PROPÓSITO ────────────────────────────────
 *
 * `color-contrast` no puede evaluarse: jsdom no tiene `canvas` y axe-core lo
 * necesita para medir contraste real. axe lo deja como `incomplete`, nunca
 * como violación, así que nunca hace fallar esta prueba — el contraste sigue
 * siendo responsabilidad de la revisión visual del sistema de diseño, no de
 * este arnés. Y `:focus-visible` no es observable sin un navegador real: lo
 * que SÍ es observable es si la regla CSS existe, y eso se comprueba aparte.
 */
import axe from "axe-core";

const GRAVES = new Set(["serious", "critical"]);

/**
 * @param {Element} [raiz] Por defecto `document.body`: ver la cabecera.
 * @param {import("axe-core").RunOptions} [opciones]
 */
export async function auditarAccesibilidad(raiz = document.body, opciones) {
  const resultado = await axe.run(raiz, opciones);
  const graves = resultado.violations.filter((v) => GRAVES.has(v.impact));

  if (graves.length === 0) return;

  const detalle = graves
    .map((v) => {
      const nodos = v.nodes.map((n) => `      · ${n.target.join(" ")}`).join("\n");
      return `  [${v.impact}] ${v.id} — ${v.help}\n${nodos}`;
    })
    .join("\n\n");

  throw new Error(
    `${graves.length} violación(es) grave(s) de accesibilidad:\n\n${detalle}\n\n` +
      `Detalle de cada regla: https://dequeuniversity.com/rules/axe/${axe.version.split(".")[0]}/<id>`
  );
}
