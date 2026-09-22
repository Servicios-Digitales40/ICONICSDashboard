// @vitest-environment jsdom
/**
 * rag-vistas.test.jsx
 * ------------------------------------------------------------------
 * Que las dos pantallas de RAG se pinten enteras, en los DOS idiomas, sin
 * dejar una clave a la vista ni una palabra en español dentro del inglés.
 *
 * ── POR QUÉ ESTAS DOS, Y POR QUÉ ASÍ ───────────────────────────────
 *
 * Porque no tenían ninguna prueba. Son las pantallas con más texto del
 * tablero —unas cincuenta cadenas entre las dos— y casi todo ese texto sólo
 * aparece cuando hay filas: con la lista vacía no se pinta ni el estado de un
 * manual, ni sus chips, ni sus botones. Eso deja la mitad de cada archivo sin
 * ejecutar nunca en la suite, que es exactamente cómo se coló un `activo(...)`
 * sin hook en `AlarmasEva.jsx` con las 589 pruebas en verde.
 *
 * Por eso el servidor falso devuelve filas con TODAS las ramas que cada vista
 * sabe pintar: un manual indexado, uno ilegible, uno archivado; un caso
 * resuelto, uno sin resolver, uno con el diagnóstico corregido.
 *
 * ── CÓMO SE CAZA UNA CADENA OLVIDADA, TRAS DOS INTENTOS FALLIDOS ───
 *
 * **Intento 1:** comparar el render inglés con el español y exigir que fueran
 * distintos. No sirve, y está comprobado: se sustituyó una frase por texto
 * fijo en español y la prueba siguió en verde, porque el resto cambia tanto
 * que el total sale distinto igualmente.
 *
 * **Intento 2:** exigir que en el render inglés no aparezca ninguna palabra
 * acentuada, con datos de prueba sin tildes. Tampoco basta, y también está
 * comprobado: ni «Archivar no borra el caso» ni «Sistema de vibraciones»
 * llevan una sola tilde. Media interfaz en español pasaría el filtro.
 *
 * **Lo que sí funciona:** pedir el texto INGLÉS de cada clave que este juego
 * de datos obliga a pintar, y comprobar que está en la pantalla. Si alguien
 * cambia una por texto fijo —en el idioma que sea—, su traducción inglesa
 * desaparece del render y la prueba dice exactamente qué clave se perdió. No
 * hay ni una frase escrita en este archivo: todas salen del diccionario, así
 * que afinar una palabra no obliga a tocar la prueba.
 *
 * El filtro de acentos se queda además, porque es gratis y cubre lo que la
 * lista no enumera.
 *
 * ── LO QUE ESTA PRUEBA NO VIGILA, Y QUIÉN LO HACE ──────────────────
 *
 * Que la traducción inglesa EXISTA. Si se borra de `en/machines.json`,
 * `fallbackLng` sirve la española, la vista pinta esa y aquí sale todo
 * correcto — comprobado. Eso es trabajo de `scripts/verificar-i18n.mjs`, que
 * compara los dos árboles y lo caza al instante.
 *
 * El reparto es limpio y conviene no mezclarlo: el verificador comprueba que
 * el DICCIONARIO esté completo; esta prueba, que la VISTA lo use.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * ── LA MÁQUINA DE VIBRACIONES ES UNA CONFIGURADA (Plan 40 F2) ──────
 *
 * Los datos decían `sistema: "vibraciones"` —la máquina escrita a mano— y la
 * lista de claves exigía `machines:systems.vibraciones`. Esa clave ya no
 * existe: el nombre de una máquina de vibraciones lo pone quien la configura
 * y llega por el provider (`useDominio().sistema(id)` cae a ese nombre), no
 * por el diccionario. Así que aquí se mockea el provider con UNA configurada,
 * los datos la referencian por su id, y en vez de la clave se exige su NOMBRE
 * en pantalla. Sin tilde, como el resto de los datos, para que el filtro de
 * acentos siga midiendo sólo interfaz.
 *
 * «Casos previos» se monta EN la máquina (`maq-casos?maquina=…`): fuera de
 * una máquina esa vista filtra por `SISTEMA_IDS_EN_SERVICIO`, el registro
 * escrito a mano, y un caso de una configurada no se pintaría. Dentro, filtra
 * por el id de la máquina en contexto, que es lo que hace su ruta `maq-casos`.
 * «Documentación» se monta sin máquina: su selector enumera TODAS —el tanque
 * del registro y la configurada— y eso es justo lo que se quiere ver traducido.
 */
const MOTOR = { id: "vib-motor-03", nombre: "Motor 3", tipo: "vibraciones", activa: true };

vi.mock("@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquinasConfiguradas: () => ({ maquinas: [MOTOR], cargando: false, error: null, recargar: () => {} }),
}));

/** `null` = sin máquina en contexto (la ruta de planta); la configurada = su ruta `maq-*`. */
let maquinaEnContexto = null;
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMaquina: () =>
      maquinaEnContexto
        ? {
            id: maquinaEnContexto.id, configurada: maquinaEnContexto, registro: null,
            enServicio: true, cerrada: null, enServicioIds: [maquinaEnContexto.id],
          }
        : original.useMaquina(),
  };
});

import i18n from "@/i18n";
import { ThemeProvider } from "@/theme";
import CasosRag from "@/Demo-EVA/views/comunes/CasosRag.jsx";
import DocumentacionRag from "@/Demo-EVA/views/comunes/DocumentacionRag.jsx";

/*
 * Los DATOS van en inglés a propósito, y no es descuido: es lo que convierte
 * la comprobación de acentos de abajo en una prueba de verdad. Un dato de
 * planta con tilde —que es lo normal— haría imposible distinguir su texto del
 * de la interfaz.
 */

/** Una fila por cada rama que `estadoDeFila` sabe distinguir. */
const MANUALES = {
  configurado: true,
  cargaHabilitada: true,
  indexando: false,
  cargado: true,
  modo: "embeddings + BM25",
  manuales: [
    { id: "m1", titulo: "Pump manual", archivo: "pump.pdf", version: 1, fragmentos: 42, estado: "activo", sistema: "tanque", fecha: "2026-09-01T10:00:00Z" },
    { id: "m2", titulo: "Limits annex", archivo: "limits.pdf", version: 2, fragmentos: 0, estado: "activo", sistema: null, motivoIlegible: "Scanned PDF, no extractable text", fecha: "2026-08-20T08:30:00Z" },
    { id: "m3", titulo: "Old manual", archivo: "old.pdf", version: 1, fragmentos: 3, estado: "archivado", sistema: MOTOR.id, fecha: "2026-07-11T12:00:00Z" },
  ],
};

/*
 * Los casos son de la máquina configurada (rama `Vibraciones1.0`, Plan 40
 * F2): la vista de Casos filtra a la máquina en contexto, y un caso del tanque
 * ya no se pinta — la prueba quedaría midiendo el cierre en vez de la
 * traducción. Lo que estas comprobaciones afirman no cambia: qué claves se
 * ven en inglés.
 */
/** Una por cada combinación de chips: resuelto o no, con veredicto y sin él. */
const CASOS = {
  casos: [
    { id: "c1", sintoma: "Noise at bearing 2", causa: "Bearing", solucion: "Replaced", fecha: "2026-09-02T09:00:00Z", sistema: MOTOR.id, origen: "cierre", resuelto: true, diagnosticoCorrecto: true, diagnostico: { propuesta: "Bearing wear", respaldo: "high" } },
    { id: "c2", sintoma: "Low pressure", causa: "Under investigation", fecha: "2026-09-01T09:00:00Z", sistema: MOTOR.id, origen: "chat", resuelto: false, diagnosticoCorrecto: false },
    { id: "c3", sintoma: "Intermittent vibration", fecha: "2026-08-30T09:00:00Z", sistema: null, origen: "voz", archivado: true, resuelto: true },
  ],
};

beforeEach(() => {
  /*
   * Los dos clientes leen `response.text()` y hacen ellos el `JSON.parse`
   * —para poder distinguir «no devolvió JSON» de «devolvió un error»—, así
   * que el falso tiene que servir texto, no un objeto ya parseado.
   */
  globalThis.fetch = vi.fn(async (url) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(String(url).includes("/rag/documentos") ? MANUALES : CASOS),
  }));
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  delete globalThis.fetch;
  maquinaEnContexto = null;
  await i18n.changeLanguage("es");
});

const montar = (Vista, { enMaquina = null } = {}) => {
  maquinaEnContexto = enMaquina;
  return render(<ThemeProvider><Vista /></ThemeProvider>);
};

/**
 * Una clave sin resolver se pinta tal cual: `assistant:rag.docs.panelTitle`.
 * Este patrón la caza sin depender de qué namespace sea.
 */
const CLAVE_CRUDA = /\b(assistant|navigation|common|errors|diagnostics|machines|sensors):[a-z][\w.]*/i;

/** Palabras con tilde, eñe o signo de apertura: en estos datos, sólo la UI. */
const ACENTUADAS = /[\wÀ-ÿ]*[áéíóúñÁÉÍÓÚÑ¿¡][\wÀ-ÿ]*/g;

/**
 * Las claves que ESTE juego de datos obliga a pintar en cada vista.
 *
 * Es una lista escrita a mano y eso es deliberado: enumera lo que las tres
 * filas de arriba hacen visible. Una rama que los datos no provocan —«sin
 * documentación configurada», «ningún caso encaja con el filtro»— no está
 * aquí porque no se pinta, y exigirla sería exigir un imposible.
 *
 * Si mañana se añade una clave a la vista, esta lista no la conoce y no la
 * vigila. Es el límite de la prueba y conviene saberlo; lo que garantiza es
 * que ninguna de ESTAS se pierda, que son las que ya estaban.
 */
const CLAVES_VISIBLES = {
  documentacion: [
    "navigation:routes.rag-documentacion.title",
    "navigation:routes.rag-documentacion.sub",
    "navigation:sections.sec-rag",
    "assistant:rag.docs.stats.documents",
    "assistant:rag.docs.stats.fragments",
    "assistant:rag.docs.stats.search",
    "assistant:rag.docs.stats.unread",
    "assistant:rag.docs.stats.unassigned",
    "assistant:rag.docs.panelTitle",
    "assistant:rag.docs.filter.all",
    "assistant:rag.docs.filter.onlyPlant",
    "assistant:rag.docs.state.indexado",
    "assistant:rag.docs.state.ilegible",
    "assistant:rag.docs.state.archivado",
    "assistant:rag.docs.wholePlant",
    "assistant:rag.docs.upload.dropzone",
    "common:actions.refresh",
    /* El nombre de la máquina, que salía del dominio y se quedaba en español.
       El de la configurada no es una clave: se exige aparte, en `NOMBRES`. */
    "machines:systems.tanque",
  ],
  casos: [
    "navigation:routes.rag-casos.title",
    "navigation:routes.rag-casos.sub",
    "assistant:rag.cases.filter.activos",
    "assistant:rag.cases.filter.archivados",
    "assistant:rag.cases.filter.todos",
    "assistant:rag.cases.footnote",
    "assistant:rag.cases.chip.archived",
    "assistant:rag.cases.chip.solved",
    "assistant:rag.cases.chip.unsolved",
    "assistant:rag.cases.chip.diagnosisRight",
    "assistant:rag.cases.chip.diagnosisCorrected",
    "assistant:rag.cases.archive",
    "assistant:rag.cases.restore",
    "common:actions.refresh",
    /*
     * `machines:systems.tanque` ya NO se pinta aquí (rama `Vibraciones1.0`):
     * esta vista sólo enseña casos de la máquina en contexto, así que el nombre
     * del tanque no llega a la pantalla y exigirlo mediría el cierre en vez de
     * la traducción. Sigue en la lista de `documentacion`, que sí enumera las
     * dos máquinas en su selector. Vuelve al reabrir.
     *
     * El nombre de la configurada no es una clave: se exige en `NOMBRES`.
     */
  ],
};

/**
 * Los nombres de máquina que ESTE dato obliga a pintar y que NO salen del
 * diccionario: los pone quien configura la máquina y llegan por el provider.
 * Se exigen igual que las claves, porque perderlos —pintar el id, o la máquina
 * escrita a mano— es el mismo fallo con otra cara.
 */
const NOMBRES = {
  documentacion: [MOTOR.nombre],
  casos: [MOTOR.nombre],
};

/**
 * Con el filtro por defecto («Activos») el caso archivado no se pinta, y con
 * él se van «Devolver» y su chip. Pulsar «Todos» es lo que hace visibles las
 * TRES filas — que es justo por lo que están las tres.
 */
async function verTodosLosCasos() {
  const enIngles = i18n.getFixedT(i18n.resolvedLanguage);
  fireEvent.click(screen.getByRole("button", {
    name: new RegExp(enIngles("assistant:rag.cases.filter.todos")),
  }));
}

/* [nombre, Vista, ancla, claves, nombres de máquina, preparar, opciones de montaje] */
const VISTAS = [
  ["Documentación", DocumentacionRag, /pump\.pdf/, CLAVES_VISIBLES.documentacion, NOMBRES.documentacion, null, {}],
  ["Casos previos", CasosRag, /Noise at bearing 2/, CLAVES_VISIBLES.casos, NOMBRES.casos, verTodosLosCasos, { enMaquina: MOTOR }],
];

describe("las dos pantallas de RAG", () => {
  it.each(VISTAS)("«%s» se pinta entera sin dejar una clave cruda", async (_n, Vista, ancla, _c, _m, preparar, opciones) => {
    montar(Vista, opciones);
    await screen.findByText(ancla);
    if (preparar) await preparar();
    expect(document.body.textContent).not.toMatch(CLAVE_CRUDA);
  });

  it.each(VISTAS)("«%s» pinta en INGLÉS todas las claves que este dato obliga a enseñar",
    async (_n, Vista, ancla, claves, nombres, preparar, opciones) => {
      await i18n.changeLanguage("en");
      montar(Vista, opciones);
      await screen.findByText(ancla);
      if (preparar) await preparar();
      const texto = document.body.textContent;

      expect(texto).not.toMatch(CLAVE_CRUDA);

      /* El nombre de la máquina configurada, tal cual lo puso quien la dio de
         alta: ni su id ni el de la escrita a mano. */
      const sinNombre = nombres.filter((nombre) => !texto.includes(nombre));
      expect(sinNombre, `nombres de máquina que no llegaron a pintarse: ${sinNombre.join(", ")}`)
        .toEqual([]);

      /*
       * `getFixedT("en")` y no `i18n.t`: pide el texto inglés sin depender de
       * qué idioma tenga puesto la instancia en este instante, y sin escribir
       * aquí ni una frase — si mañana «Archive» pasa a «Move to archive», la
       * prueba se entera sola.
       */
      const enIngles = i18n.getFixedT("en");
      const perdidas = claves.filter((clave) => !texto.includes(enIngles(clave)));

      expect(perdidas, `claves que no llegaron a pintarse en inglés: ${perdidas.join(", ")}`)
        .toEqual([]);

      /*
       * Y de propina, el filtro barato: los datos de arriba no llevan una sola
       * tilde, así que cualquier palabra acentuada aquí es interfaz. No caza
       * una frase en español sin tildes —«Sistema de vibraciones» no lleva
       * ninguna—, y por eso NO es la comprobación principal; es la red que
       * cubre lo que la lista de claves no enumera.
       */
      const restos = texto.match(ACENTUADAS) ?? [];
      expect(restos, `palabras acentuadas en el render inglés: ${restos.join(", ")}`)
        .toEqual([]);
    });

  it("la fecha se formatea con el locale del idioma, no fijada a es-MX", async () => {
    montar(CasosRag, { enMaquina: MOTOR });
    await screen.findByText(/Noise at bearing 2/);
    const enEspanol = document.body.textContent;
    cleanup();

    await i18n.changeLanguage("en");
    montar(CasosRag, { enMaquina: MOTOR });
    await screen.findByText(/Noise at bearing 2/);

    /*
     * «1 de septiembre de 2026» frente a «September 1, 2026». Estaba fijada a
     * `es-MX`, así que un tablero en inglés enseñaba el mes en español — y en
     * formato corto, con el día delante, que en inglés se lee como otro día.
     */
    await waitFor(() => {
      expect(document.body.textContent).not.toBe(enEspanol);
    });
    expect(document.body.textContent).toMatch(/September|August|July/);
  });
});
