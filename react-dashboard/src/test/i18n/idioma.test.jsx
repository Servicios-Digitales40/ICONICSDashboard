// @vitest-environment jsdom
/**
 * Que la aplicación funcione en los dos idiomas, y que cambiar de uno a otro
 * no exija recargar.
 *
 * ── QUÉ PRUEBA ESTO Y QUÉ NO ───────────────────────────────────────
 *
 * Las otras 583 pruebas de la suite corren en español y afirman su texto: son
 * las que demuestran que la migración a i18n no cambió lo que ve el operador.
 * Lo que NO pueden demostrar es la otra mitad —que el inglés existe y que el
 * interruptor lo enciende— porque nunca lo encienden.
 *
 * Eso es lo que hay aquí. Y no comprueba una clave suelta a mano, sino que la
 * MISMA pantalla dice cosas distintas en cada idioma, que es lo único que
 * distingue una traducción que llega a la pantalla de una que se quedó en el
 * JSON.
 *
 * La paridad de claves entre idiomas la comprueba `scripts/verificar-i18n.mjs`;
 * aquí no se repite.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import i18n from "@/i18n";
import { CLAVE_ALMACEN, IDIOMA_POR_DEFECTO } from "@/i18n/idiomas.js";
import { LanguageSelector } from "@/i18n/LanguageSelector.jsx";
import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import { Sidebar } from "@/app/layout/Sidebar.jsx";

/**
 * Cada prueba devuelve el idioma al de por defecto.
 *
 * La instancia de i18next es ÚNICA para toda la suite (ver `test/setup.js`),
 * así que una prueba que se dejara el inglés puesto haría fallar a la
 * siguiente que afirme texto en español — y el mensaje apuntaría a la prueba
 * equivocada.
 */
afterEach(async () => {
  cleanup();
  await act(async () => {
    await i18n.changeLanguage(IDIOMA_POR_DEFECTO);
  });
  window.localStorage.removeItem(CLAVE_ALMACEN);
});

/* El Sidebar pinta el punto de estado de Planta, así que necesita la fuente de
   datos igual que en la aplicación. En pruebas el transporte es el simulado y
   no sale a ninguna red. */
const montarSidebar = () =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <Sidebar page="eva-bandeja" onNavigate={() => {}} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

const cambiarA = async (idioma) => {
  await act(async () => {
    await i18n.changeLanguage(idioma);
  });
};

describe("la aplicación habla los dos idiomas", () => {
  /*
   * ── SE COMPRUEBA CON «PLANTA», NO CON LLENADO NI VIBRACIONES ───────
   *
   * Rama `Vibraciones1.0`: la sección «Estación de llenado» ya no sale del
   * sidebar, así que buscarla aquí mediría el cierre en vez del idioma. Y
   * desde el Plan 40 F2 tampoco sale «Estación de vibraciones»: la máquina
   * escrita a mano se retiró y la sección se llama «Planta» — las máquinas de
   * vibraciones son configuradas y su rótulo es su NOMBRE, que no se traduce.
   *
   * La afirmación NO cambia —el tablero rotula su navegación en los dos
   * idiomas— sólo la sección con la que se comprueba. Por eso se ADAPTA y no
   * se omite: es una de las pruebas que hay que conservar viva, porque un
   * rótulo sin traducir se ve igual de mal con una máquina que con veinte.
   *
   * «Turno»/«Shift» acompaña porque «General» se escribe igual en los dos
   * idiomas y solo no distingue nada. Hasta el 22-09-2026 ese papel lo hacía
   * «Predicción»/«Prediction», y se cambió al ocultarse esa sección del menú:
   * la afirmación es la misma —la navegación se rotula en los dos idiomas— y
   * ahora se comprueba con una vista que sigue en pantalla.
   *
   * Al reabrir, vuelven las dos líneas de «Estación de llenado».
   */
  it("en español rotula la navegación en español", async () => {
    montarSidebar();

    expect((await screen.findAllByText("Planta")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Turno").length).toBeGreaterThan(0);
    expect(screen.getByText("General")).toBeTruthy();
  });

  it("en inglés rotula la MISMA navegación en inglés", async () => {
    await cambiarA("en");
    montarSidebar();

    expect((await screen.findAllByText("Plant")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shift").length).toBeGreaterThan(0);
    // Y ya no queda nada del español: si saliera, sería una clave sin traducir
    // cayendo al `fallbackLng`.
    expect(screen.queryAllByText("Planta")).toEqual([]);
    expect(screen.queryAllByText("Turno")).toEqual([]);
  });

  it("el vocabulario del DOMINIO también se traduce, sin tocar `shared/`", async () => {
    /*
     * `machines:status.*` sale de `shared/eva/tanque/estado.js`, que sigue
     * declarando sus etiquetas en español porque las usa el backend. El
     * puente es `useDominio`; esto comprueba que funciona en los dos sentidos.
     */
    expect(i18n.t("machines:status.critico.label")).toBe("Fuera de límite");
    expect(i18n.t("machines:status.nominal.label")).toBe("En banda");

    await cambiarA("en");

    expect(i18n.t("machines:status.critico.label")).toBe("Out of Limits");
    expect(i18n.t("machines:status.nominal.label")).toBe("In Range");
  });
});

describe("el cambio es en caliente, sin recargar", () => {
  it("la pantalla ya montada se repinta al cambiar de idioma", async () => {
    // Es la afirmación de §3: cambiar el idioma NO puede exigir un F5. Se monta
    // en español, se cambia, y se comprueba el MISMO árbol sin volver a montar.
    // Con «Planta», no con llenado ni vibraciones — ver el bloque del primer
    // `describe`.
    montarSidebar();
    expect((await screen.findAllByText("Planta")).length).toBeGreaterThan(0);

    await cambiarA("en");

    expect(screen.getAllByText("Plant").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Planta")).toEqual([]);
  });
});

describe("la preferencia se guarda", () => {
  it("elegir un idioma en el selector lo deja escrito en localStorage", async () => {
    render(
      <ThemeProvider>
        <LanguageSelector />
      </ThemeProvider>
    );

    const ingles = screen.getByRole("radio", { name: "English" });
    await act(async () => {
      ingles.click();
    });

    expect(i18n.resolvedLanguage).toBe("en");
    /*
     * Quien escribe es el detector de i18next (`caches: ["localStorage"]`), no
     * el componente. Que se compruebe aquí es lo que impide que alguien
     * "arregle" el selector escribiendo el almacén por su cuenta y acabe con
     * dos sitios guardando la misma preferencia.
     */
    expect(window.localStorage.getItem(CLAVE_ALMACEN)).toBe("en");
  });

  it("el selector marca cuál está puesto, y no sólo con el color", async () => {
    // Un lector de pantalla no ve el resaltado: `aria-checked` es lo único que
    // le dice cuál de los dos está activo.
    render(
      <ThemeProvider>
        <LanguageSelector />
      </ThemeProvider>
    );

    expect(screen.getByRole("radio", { name: "Español" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("false");
  });
});
