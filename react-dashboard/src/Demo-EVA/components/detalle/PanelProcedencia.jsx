/**
 * «¿De dónde salió este número?», en pantalla (Plan 24 F1 · `USO-03`).
 *
 * ── POR QUÉ EXISTE / POR QUÉ ASÍ ────────────────────────────────────
 *
 * Un tablero de planta pide creer sus cifras, y hasta ahora la única forma de
 * comprobar una era conocer el árbol de ICONICS y el catálogo por dentro. El
 * tag ya se enseñaba en la tarjeta de Detalle, pero un tag solo no dice de qué
 * PLC viene, cada cuánto se relee, si lo que se está viendo es una serie propia
 * o prestada, ni cuántos tramos del período tienen dato de verdad.
 *
 * ── ESTE PANEL NO CALCULA NADA ─────────────────────────────────────
 *
 * Todo lo que enseña se lo da `procedenciaDe()` (`@shared/eva/comun/`), que a
 * su vez sólo recoge lo que el registro, el catálogo y el historiador ya
 * decidieron. `CLAUDE.md` §4.3: una vista que recalcula una banda rompe la
 * capa, y una que reinterpreta una calidad la rompe igual. Si algún día cambia
 * la cadencia de una máquina o la ruta de su historiador, este archivo no se
 * entera y sigue diciendo la verdad.
 *
 * Lo único que decide aquí es la PRESENTACIÓN: qué orden, qué se resalta y qué
 * frase traduce cada código. Los códigos de motivo (`mala`, `sin_entrega`…) son
 * estables y vienen del dominio; su texto vive en el diccionario, como todo lo
 * que se lee en pantalla.
 *
 * ── UN PUNTO, NUNCA DOS ────────────────────────────────────────────
 *
 * Deliberado, y por el mismo motivo que la firma de `procedenciaDe()` no
 * admite una lista. Un panel de procedencia es una vista transversal —la misma
 * pregunta para cualquier señal de cualquier máquina— y por eso es la
 * invitación perfecta a poner dos sistemas uno al lado del otro «para comparar
 * de dónde vienen». Esta aplicación ya se cortó una vez con eso: el Plan 23
 * encontró que la guarda contra cruzar las dos máquinas no protegía el caso
 * real (diez de cuarenta y dos etiquetas de vibraciones resolvían a una señal
 * del tanque, corregido en `98fe465`).
 *
 * ── POR QUÉ UN `<details>` Y NO UN MODAL ───────────────────────────
 *
 * Tres motivos. Es información de consulta, no una interrupción: quien mira el
 * tablero no quiere perder la cifra de vista para leer de dónde viene. Un
 * modal de esta app es de tipo fijo y sin datos (`ModalProvider` maneja un
 * identificador de texto, no una carga útil), así que habría que rehacerlo
 * para pasarle una señal. Y `<details>` trae gratis lo que un panel casero
 * tendría que reimplementar mal: plegado accesible, teclado y anuncio de
 * estado, sin una línea de JS.
 */
import { useTranslation } from "react-i18next";

import { useTheme } from "@/theme";
import { fmtAntiguedad } from "@/lib/format.js";
import { procedenciaDe } from "@shared/eva/comun/procedencia.js";

import { MONO } from "../base.jsx";

/** Una fila del panel: etiqueta a la izquierda, hecho a la derecha. */
function Fila({ termino, children, t, mono = false }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "5px 0", alignItems: "baseline" }}>
      <dt style={{ flex: "0 0 38%", fontSize: 11, color: t.textFaint, minWidth: 0 }}>
        {termino}
      </dt>
      <dd
        style={{
          margin: 0, flex: 1, minWidth: 0, fontSize: 11.5, color: t.textSoft,
          fontFamily: mono ? MONO : undefined,
          // El tag de ICONICS es largo y no tiene espacios donde partir; se
          // deja romper por cualquier sitio antes que desbordar la tarjeta.
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.senal      La señal ya evaluada (`createSenal`).
 * @param {string|null} p.punto Su nombre completo de ICONICS (`pointName`).
 *   Sin él la procedencia sale sin máquina, a propósito: deducirla de la clave
 *   es el cruce que este panel no puede reintroducir.
 * @param {object|null} [p.cobertura] La del rango que se está viendo.
 * @param {Date} [p.ahora]      Inyectable; el reloj lo pasa la vista.
 */
export function PanelProcedencia({ senal, punto = null, cobertura = null, ahora = new Date() }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "sensors"]);
  const { theme: t } = useTheme();

  const p = procedenciaDe({ senal, punto, cobertura });
  if (!p) return null;

  const sinDato = traducir("machines:provenance.unknown");

  return (
    <details style={{ marginTop: 12, borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
      <summary
        style={{
          cursor: "pointer", fontSize: 11, fontWeight: 600, color: t.textFaint,
          listStyle: "revert", // el triángulo nativo: es el afford de que esto se abre
        }}
      >
        {traducir("machines:provenance.title")}
      </summary>

      <dl style={{ margin: "8px 0 0" }}>
        <Fila termino={traducir("machines:provenance.point")} t={t} mono>
          {p.punto ?? sinDato}
        </Fila>

        {/* La máquina va junto al PLC a propósito: son el mismo hecho visto de
            dos formas, y separarlos invitaría a leer el nombre bonito sin
            reparar en que detrás hay un autómata concreto. */}
        <Fila termino={traducir("machines:provenance.machine")} t={t}>
          {p.sistema ? `${p.sistema.nombre} · ${p.sistema.plc}` : sinDato}
        </Fila>

        <Fila termino={traducir("machines:provenance.polling")} t={t}>
          {p.sistema
            ? traducir("machines:provenance.everySeconds", {
                segundos: Math.round(p.sistema.cadenciaMs / 1000),
              })
            : sinDato}
        </Fila>

        <Fila termino={traducir("machines:provenance.lastRead")} t={t}>
          {p.lectura.receivedAt
            ? fmtAntiguedad(p.lectura.receivedAt, ahora.getTime())
            : traducir("machines:provenance.neverRead")}
        </Fila>

        {/* El motivo SÓLO cuando de verdad falta el valor. Una nota de calidad
            junto a una medición buena se lee como una advertencia, que es
            justo lo contrario de lo que dice. */}
        {!p.lectura.hayValor && p.lectura.explicacion && (
          <Fila termino={traducir("machines:provenance.quality")} t={t}>
            {traducir(`machines:provenance.reason.${p.lectura.explicacion}`)}
          </Fila>
        )}

        <Fila termino={traducir("machines:provenance.history")} t={t}>
          {p.serie.historizada
            ? traducir("machines:provenance.historized", {
                ruta: p.serie.ruta ?? "—",
                agregado: p.serie.agregado ?? "—",
              })
            : traducir("machines:provenance.notHistorized")}
        </Fila>

        {/* La cobertura habla del RANGO que se está viendo, no del punto, así
            que sólo aparece cuando hay un rango cargado. Y sólo si falta algo:
            «48 de 48» es ruido — lo que hay que decir es cuándo NO está
            completo (§2.4). */}
        {p.cobertura && !p.cobertura.completa && (
          <Fila termino={traducir("machines:provenance.coverage")} t={t}>
            {traducir("machines:provenance.coverageGaps", {
              conDato: p.cobertura.tramosConDato,
              tramos: p.cobertura.tramosPosibles,
            })}
          </Fila>
        )}
      </dl>
    </details>
  );
}
