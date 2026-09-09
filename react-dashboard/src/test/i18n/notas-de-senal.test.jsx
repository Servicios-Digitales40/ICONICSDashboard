// @vitest-environment jsdom
/**
 * notas-de-senal.test.jsx
 * ------------------------------------------------------------------
 * Que la `nota` de una señal del catálogo se traduzca — no sólo su `label` y
 * su `corto`.
 *
 * ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────
 *
 * `shared/eva/tanque/senales.js` declara `nota` en siete señales, junto a
 * `label` y `corto`. `useDominio().senal()` ya traducía los dos últimos por
 * clave — pero la ficha de un activo en la maqueta 3D
 * (`three-d/components/FichaActivo.jsx`) y el detalle de una señal
 * (`components/detalle/DetalleGrid.jsx`) pintaban `senal.nota` DIRECTO del
 * catálogo, sin pasar por el puente. Se vio en planta el 09-09-2026: la ficha
 * de «Storage Tank», en inglés, seguía diciendo «El sensor de nivel está
 * sobre la columna de distribución, no sobre el depósito.»
 *
 * Es la misma advertencia que ya deja escrita `riesgos-vocabulario.test.jsx`:
 * un componente sin cubrir por ninguna prueba que lo renderice de verdad deja
 * pasar justo este tipo de olvido. Aquí no se monta la ficha 3D completa
 * —pesada, y lo que hay que probar es el vocabulario, no la escena— sino el
 * mismo \`senal()\` que las dos vistas ya llaman.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { useDominio } from "@/i18n/useDominio.js";
import { SENALES } from "@shared/eva/tanque/senales.js";

afterEach(async () => {
  await i18n.changeLanguage("es");
});

/**
 * Las claves que declaran `nota` en el catálogo — no una lista a mano. Eran
 * siete hasta el Plan 27; F3 sumó diez más (las ocho alarmas, `control` y
 * `paroDeEmergencia`), todas con su nota también.
 */
const CON_NOTA = Object.values(SENALES).filter((s) => s.nota);

describe("la nota de una señal se traduce, no sólo su nombre", () => {
  it("[es] sin diccionario, sale la nota del catálogo tal cual", () => {
    const { result } = renderHook(() => useDominio());
    for (const s of CON_NOTA) {
      expect(result.current.senal(s.key, "nota")).toBe(s.nota);
    }
  });

  it("[en] todas las notas tienen su traducción, distinta del español", async () => {
    await i18n.changeLanguage("en");
    const { result } = renderHook(() => useDominio());

    for (const s of CON_NOTA) {
      const traducida = result.current.senal(s.key, "nota");
      expect(traducida).not.toBe(s.nota);
      expect(traducida.length).toBeGreaterThan(0);
    }
  });

  it("[en] la del nivel del tanque dice lo mismo, en inglés", async () => {
    /*
     * El caso concreto de la captura: «Storage Tank» en inglés seguía
     * enseñando la nota en español debajo del nivel.
     */
    await i18n.changeLanguage("en");
    const { result } = renderHook(() => useDominio());

    expect(result.current.senal("nivelTanque", "nota")).toBe(
      "The level sensor sits on top of the distribution column, not on the tank."
    );
  });
});
