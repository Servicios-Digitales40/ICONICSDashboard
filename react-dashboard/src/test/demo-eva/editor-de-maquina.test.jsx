// @vitest-environment jsdom
/**
 * editor-de-maquina.test.jsx
 * ------------------------------------------------------------------
 * El editor de máquinas: tres árboles marcables y el alta. Plan 36 F1–F3.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Marcar un activo marca todas sus variables; quitar una deja n−1.**
 *     Es el modelo de interacción decidido con el usuario, en pantalla.
 *  2. **`Alarm` y `Pantalla` no se ofrecen como activos reconocidos**, y sí
 *     se ofrecen en «otras carpetas»: nada se esconde.
 *  3. **Lo que no empareja por nombre se señala** en la columna del
 *     historiador, y se puede emparejar a mano.
 *  4. **El alta manda lo marcado, sin promesas**: ni `historyVerified` ni
 *     `acceso`, y con las tres raíces (`arboles`).
 *  5. **Editar conserva lo guardado y señala lo que ya no está**, sin
 *     borrarlo solo (F3).
 *
 * El árbol es de mentira y se sirve por rama, como el `browse` real: si el
 * editor pidiera un volcado entero, aquí no lo encontraría.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/maquinasApi.js", () => ({
  crearMaquina: vi.fn(),
  editarMaquina: vi.fn(),
  problemasDeError: (e) => e?.detalle?.problemas ?? [],
}));

vi.mock("@/lib/iconics", () => ({
  browseIconics: vi.fn(),
}));

import { ThemeProvider } from "@/theme";
import { browseIconics } from "@/lib/iconics";
import { crearMaquina, editarMaquina } from "@/lib/api/maquinasApi.js";
import EditorDeMaquina from "@/Demo-EVA/components/configuracion/EditorDeMaquina.jsx";

const B = String.fromCharCode(92);
const RAIZ = "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/";
/* Como lo devuelve el servidor real: las carpetas del historiador SIN
   contrabarra final. La persona la teclea con ella (así está en el catálogo)
   y el editor la quita antes de explorar. */
const HDA = `hda:${B}Configuration${B}DEMO_VIBRACIONES`;
const HDA_TECLEADA = `${HDA}${B}`;
const AREA = "ae:/DEMO VIBRACIONES";

const hoja = (carpeta, n) => ({ pointName: `${carpeta}${n}`, shortName: n });
const carpeta = (padre, n) => ({ pointName: `${padre}${n}/`, shortName: n, class: 1 });
const carpetaHda = (padre, n) => ({ pointName: `${padre}${B}${n}`, shortName: n, class: 1 });
const tag = (padre, n) => ({ pointName: `${padre}:${n}`, shortName: n });

/** Un S1 con 26 variables, como el real; S2 con tres; V20 y las «otras». */
const S1 = Array.from({ length: 26 }, (_, i) =>
  ["vRMS_S1", "aRMS_S1", "aPeak_S1", "DKW_S1", "QC_vRMS_S1", "Alarma_S1"][i] ?? `MonState_${i}_S1`);
const S2 = ["vRMS_S2", "aRMS_S2", "DKW_S2"];
const V20 = ["SPEED_BMS", "HorasMarcha"];

const ARBOL = {
  [RAIZ]: [carpeta(RAIZ, "S1"), carpeta(RAIZ, "S2"), carpeta(RAIZ, "V20"), carpeta(RAIZ, "Jaritza"), carpeta(RAIZ, "Alarm"), carpeta(RAIZ, "Pantalla")],
  [`${RAIZ}S1/`]: S1.map((n) => hoja(`${RAIZ}S1/`, n)),
  [`${RAIZ}S2/`]: S2.map((n) => hoja(`${RAIZ}S2/`, n)),
  [`${RAIZ}V20/`]: V20.map((n) => hoja(`${RAIZ}V20/`, n)),
  [`${RAIZ}Jaritza/`]: [hoja(`${RAIZ}Jaritza/`, "Tension L-N")],
  [`${RAIZ}Alarm/`]: [hoja(`${RAIZ}Alarm/`, "Alarm_MonState_vRMS")],
  [`${RAIZ}Pantalla/`]: [hoja(`${RAIZ}Pantalla/`, "Pagina")],
  [HDA]: [carpetaHda(HDA, "S1"), carpetaHda(HDA, "S2"), carpetaHda(HDA, "Jaritza")],
  [`${HDA}${B}S1`]: [tag(`${HDA}${B}S1`, "vRMS_S1"), tag(`${HDA}${B}S1`, "aRMS_S1"), tag(`${HDA}${B}S1`, "DKW_S1")],
  [`${HDA}${B}S2`]: [tag(`${HDA}${B}S2`, "vRMS_S2")],
  /* Errata que sólo está en el historiador: nadie la reclama por nombre. */
  [`${HDA}${B}Jaritza`]: [tag(`${HDA}${B}Jaritza`, "UPER LEVEL 3")],
  [AREA]: [
    { pointName: `${AREA}=ActiveUnackedCount`, shortName: "=ActiveUnackedCount" },
    { pointName: `${AREA}=NormalUnackedCount`, shortName: "=NormalUnackedCount" },
    { pointName: `${AREA}.Alarm_MonState_vRMS`, shortName: ".Alarm_MonState_vRMS" },
    { pointName: `${AREA}${B}Acknowledge`, shortName: `${B}Acknowledge` },
  ],
};

/** El `browse` de mentira: por rama, hojas vacías, ramas desconocidas fallan. */
function servirArbol(arbol = ARBOL) {
  browseIconics.mockImplementation(async (ruta) => {
    /* `FALLA` es una rama que existe y no se puede leer: un 500 del servidor. */
    if (arbol[ruta] === "FALLA") throw new Error(`ICONICS no contestó a «${ruta}»`);
    if (ruta in arbol) return { ok: true, payload: arbol[ruta] };
    const esHoja = Object.values(arbol).some((hijos) => hijos.some((h) => h.pointName === ruta));
    if (esHoja) return { ok: true, payload: [] };
    throw new Error(`No existe la rama «${ruta}»`);
  });
}

const tipos = [{ id: "vibraciones", nombre: "Vigilancia de vibraciones", descripcion: "", reglas: 18, rolesRequeridos: [], capacidadesPosibles: [] }];

function montar(props = {}) {
  return render(
    <ThemeProvider>
      <EditorDeMaquina tipos={tipos} otrosIds={[]} onGuardado={vi.fn()} onCancelar={vi.fn()} {...props} />
    </ThemeProvider>,
  );
}

/** Rellena las tres raíces y explora. */
async function explorar({ historico = HDA_TECLEADA, alarmas = AREA } = {}) {
  fireEvent.change(screen.getByLabelText(/Raíz en tiempo real/), { target: { value: RAIZ } });
  if (historico) fireEvent.change(screen.getByLabelText(/Grupo del historiador/), { target: { value: historico } });
  if (alarmas) fireEvent.change(screen.getByLabelText(/Área de alarmas/), { target: { value: alarmas } });
  fireEvent.click(screen.getByRole("button", { name: /Explorar los tres árboles/ }));
  await screen.findByRole("checkbox", { name: /Marcar todas las variables de S1/ });
}

const marcadas = () => screen.getAllByRole("checkbox").filter((c) => c.checked && !c.getAttribute("aria-label")?.startsWith("Marcar todas"));

beforeEach(() => servirArbol());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("los tres árboles (F1)", () => {
  it("enseña los activos reales de la raíz, con su conteo de variables y de roles", async () => {
    montar();
    await explorar();

    expect(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Marcar todas las variables de V20/ })).toBeTruthy();
    /* S1 tiene 26 y el tipo reconoce las seis con nombre de verdad. */
    expect(screen.getByText(/26 variables · 6 con rol/)).toBeTruthy();
  });

  it("Alarm y Pantalla NO salen como activos reconocidos, y sí en «otras carpetas»", async () => {
    montar();
    await explorar();

    /*
     * El orden en el documento es lo que separa los dos grupos: los
     * reconocidos van ANTES del rótulo «Otras carpetas», y las otras después.
     */
    const rotuloOtros = screen.getByText("Otras carpetas del árbol");
    const despuesDeOtros = (el) => Boolean(rotuloOtros.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(despuesDeOtros(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }))).toBe(false);
    expect(despuesDeOtros(screen.getByRole("checkbox", { name: /Marcar todas las variables de V20/ }))).toBe(false);

    /* Pero existen y se pueden marcar: no se esconde lo que hay en el árbol. */
    for (const carpeta of ["Alarm", "Pantalla", "Jaritza"]) {
      const casilla = screen.getByRole("checkbox", { name: new RegExp(`Marcar todas las variables de ${carpeta}`) });
      expect(despuesDeOtros(casilla)).toBe(true);
    }
  });

  /* La comprobación que da nombre a la fase. */
  it("marcar S1 marca sus 26 variables; desmarcar una deja 25", async () => {
    montar();
    await explorar();

    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }));
    await screen.findByText(/26 variables marcadas/);

    /* Se abre sola al marcar, con sus 26 casillas marcadas. */
    await screen.findByRole("checkbox", { name: "aPeak_S1" });
    expect(marcadas()).toHaveLength(26);

    fireEvent.click(screen.getByRole("checkbox", { name: "aPeak_S1" }));
    await screen.findByText(/25 variables marcadas/);
    expect(marcadas()).toHaveLength(25);

    /* La casilla del activo pasa a «algunas», sin dejar de estar pulsable. */
    const s1 = screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ });
    expect(s1.checked).toBe(false);
    expect(s1.indeterminate).toBe(true);
  });

  it("propone el rol por el nombre del tag, y dice «sin rol» sin inventar uno", async () => {
    montar();
    await explorar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }));
    await screen.findByRole("checkbox", { name: "vRMS_S1" });

    expect(screen.getByText("medida:vRMS")).toBeTruthy();
    expect(screen.getByText("calidad:qcVRMS")).toBeTruthy();
    expect(screen.getAllByText("sin rol").length).toBeGreaterThan(0);
  });

  it("lo que no empareja por nombre se SEÑALA en la columna del historiador", async () => {
    montar();
    await explorar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }));
    await screen.findByRole("checkbox", { name: "vRMS_S1" });

    /* Abrir la carpeta Jaritza del historiador: su único tag no casa con nada. */
    fireEvent.click(screen.getAllByRole("button", { name: /^Jaritza/ }).at(-1));
    expect(await screen.findByText("UPER LEVEL 3")).toBeTruthy();
    expect(screen.getByText("sin pareja en vivo")).toBeTruthy();

    /* Y las de S1 que sí casan, se ven emparejadas. */
    fireEvent.click(screen.getAllByRole("button", { name: /^S1/ }).at(-1));
    expect(await screen.findByText("emparejado con vRMS_S1")).toBeTruthy();
  });

  it("un tag sin pareja se puede emparejar A MANO con una variable marcada sin serie", async () => {
    montar();
    await explorar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }));
    await screen.findByRole("checkbox", { name: "vRMS_S1" });
    fireEvent.click(screen.getAllByRole("button", { name: /^Jaritza/ }).at(-1));
    await screen.findByText("UPER LEVEL 3");

    /* `aPeak_S1` está marcada y no tiene tag en este historiador. */
    const selector = screen.getByLabelText(/Emparejar con… UPER LEVEL 3/);
    fireEvent.change(selector, { target: { value: `${RAIZ}S1/aPeak_S1` } });

    expect(await screen.findByText("emparejado con aPeak_S1")).toBeTruthy();
    /* Se distingue de la propuesta por nombre: se puede quitar. */
    expect(screen.getByRole("button", { name: /Quitar emparejamiento UPER LEVEL 3/ })).toBeTruthy();
  });

  it("el área de alarmas separa contadores (marcables) de alarmas y acciones (no)", async () => {
    montar();
    await explorar();

    expect(screen.getByRole("checkbox", { name: "ActiveUnackedCount" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "NormalUnackedCount" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Alarm_MonState/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Acknowledge/ })).toBeNull();
    expect(screen.getByText(/deny by default/)).toBeTruthy();
  });

  it("una raíz que no existe se dice, sin dejar la pantalla en blanco", async () => {
    montar();
    fireEvent.change(screen.getByLabelText(/Raíz en tiempo real/), { target: { value: "ac:NO/EXISTE/" } });
    fireEvent.click(screen.getByRole("button", { name: /Explorar los tres árboles/ }));

    expect(await screen.findByText(/No se pudo explorar «ac:NO\/EXISTE\/»/)).toBeTruthy();
  });
});

describe("el alta (F2)", () => {
  async function rellenarYMarcar() {
    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "vib-motor-02" } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Motor 2" } });
    fireEvent.change(screen.getByLabelText("PLC"), { target: { value: "PLC_2 · ua:DEMO3" } });
    await explorar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }));
    await screen.findByText(/26 variables marcadas/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir los contadores del área" }));
    await screen.findByText(/28 variables marcadas/);
  }

  it("manda lo marcado SIN promesas: ni historyVerified ni acceso, y con las tres raíces", async () => {
    const onGuardado = vi.fn();
    crearMaquina.mockResolvedValue({ ok: true, maquina: { id: "vib-motor-02", nombre: "Motor 2" }, avisos: [] });
    montar({ onGuardado });
    await rellenarYMarcar();

    fireEvent.click(screen.getByRole("button", { name: /Dar de alta la máquina/ }));
    await waitFor(() => expect(crearMaquina).toHaveBeenCalledTimes(1));

    const [payload] = crearMaquina.mock.calls[0];
    expect(payload.id).toBe("vib-motor-02");
    expect(payload.tipo).toBe("vibraciones");
    expect(payload.arboles).toEqual({ enVivo: RAIZ, historico: HDA, alarmas: AREA });
    expect(payload.variables).toHaveLength(28);
    for (const v of payload.variables) {
      expect(v).not.toHaveProperty("historyVerified");
      expect(v).not.toHaveProperty("acceso");
    }
    /* El emparejamiento propuesto viaja; el que no casa, va vacío. */
    expect(payload.variables.find((v) => v.id === "vRMS_S1").historyPointName).toBe(`${HDA}${B}S1:vRMS_S1`);
    expect(payload.variables.find((v) => v.id === "aPeak_S1").historyPointName).toBeNull();
    /* Un asset por carpeta marcada, más la raíz y el área. */
    expect(payload.assets.map((a) => a.id)).toEqual(["Vibraciones", "S1", "DEMO VIBRACIONES"]);

    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
  });

  it("las limitaciones se escriben una por línea y viajan limpias en el alta (F9)", async () => {
    crearMaquina.mockResolvedValue({ ok: true, maquina: { id: "vib-motor-02", nombre: "Motor 2" }, avisos: [] });
    montar();
    await rellenarYMarcar();
    fireEvent.change(screen.getByLabelText("Limitaciones de la instalación"), {
      target: { value: "  El motor gira sin carga acoplada.  \n\nEl rodamiento intermedio no tiene referencia.\nEl motor gira sin carga acoplada.\n" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Dar de alta la máquina/ }));
    await waitFor(() => expect(crearMaquina).toHaveBeenCalledTimes(1));

    /* Sin espacios, sin líneas vacías y sin repetir. */
    expect(crearMaquina.mock.calls[0][0].limitaciones).toEqual([
      "El motor gira sin carga acoplada.",
      "El rodamiento intermedio no tiene referencia.",
    ]);
  });

  it("sin nada marcado el botón de alta no se ofrece activo, y se dice qué falta", async () => {
    montar();
    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "vib-motor-02" } });
    await explorar();

    expect(screen.getByRole("button", { name: /Dar de alta la máquina/ }).disabled).toBe(true);
    expect(screen.getByText(/Hace falta al menos una variable/)).toBeTruthy();
    expect(screen.getByText(/Falta el PLC/)).toBeTruthy();
  });

  it("un id que ya usa otra máquina se caza ANTES de enviar", async () => {
    montar({ otrosIds: ["vib-motor-02"] });
    await rellenarYMarcar();
    expect(screen.getByText(/Ya hay otra máquina configurada con el id/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Dar de alta la máquina/ }).disabled).toBe(true);
  });

  it("un 400 del servidor se pinta con sus problemas por campo, sin perder lo marcado", async () => {
    const error = new Error("La configuración de la máquina no está completa.");
    error.detalle = { problemas: [{ campo: "assets", problema: "La raíz se solapa con otra máquina." }] };
    crearMaquina.mockRejectedValue(error);
    montar();
    await rellenarYMarcar();

    fireEvent.click(screen.getByRole("button", { name: /Dar de alta la máquina/ }));
    expect(await screen.findByText(/La raíz se solapa con otra máquina/)).toBeTruthy();
    expect(screen.getByText(/28 variables marcadas/)).toBeTruthy();
  });
});

describe("editar una máquina existente (F3)", () => {
  const guardada = () => ({
    id: "vib-motor-02",
    nombre: "Motor 2",
    tipo: "vibraciones",
    plc: "PLC_2 · ua:DEMO3",
    arboles: { enVivo: RAIZ, historico: HDA, alarmas: AREA },
    assets: [{ id: "Vibraciones", pointName: RAIZ, rol: "raiz" }, { id: "S2", pointName: `${RAIZ}S2/`, rol: "secundario" }],
    variables: [
      { id: "vRMS_S2", pointName: `${RAIZ}S2/vRMS_S2`, historyPointName: `${HDA}${B}S2:vRMS_S2`, historyVerified: true, assetId: "S2", rol: "medida:vRMS", acceso: "read" },
      { id: "aRMS_S2", pointName: `${RAIZ}S2/aRMS_S2`, historyPointName: null, historyVerified: false, assetId: "S2", rol: "medida:aRMS", acceso: "read" },
      /* Ésta ya no está en el árbol de hoy. */
      { id: "Sensoroffset_S2", pointName: `${RAIZ}S2/Sensoroffset_S2`, historyPointName: null, historyVerified: false, assetId: "S2", rol: null, acceso: "read" },
    ],
  });

  it("abrir una máquina enseña lo marcado, con sus raíces, sin tocar nada", async () => {
    montar({ maquina: guardada() });

    await screen.findByRole("checkbox", { name: /Marcar todas las variables de S2/ });
    expect(screen.getByLabelText(/Raíz en tiempo real/).value).toBe(RAIZ);
    expect(screen.getByLabelText(/Grupo del historiador/).value).toBe(HDA);
    expect(screen.getByLabelText("Identificador").disabled).toBe(true);
    expect(await screen.findByText(/3 variables marcadas/)).toBeTruthy();
  });

  it("una variable guardada que ya no está en el árbol se SEÑALA y sigue marcada; no se borra sola", async () => {
    montar({ maquina: guardada() });

    expect(await screen.findByText("Variables guardadas que ya no están en el árbol")).toBeTruthy();
    const ausente = screen.getByRole("checkbox", { name: "Sensoroffset_S2" });
    expect(ausente.checked).toBe(true);
    expect(screen.getByText("ya no está en el árbol")).toBeTruthy();
  });

  it("un activo con SUBCARPETA sigue leído y marcado al reabrir (S1 · NOT_USED)", async () => {
    /*
     * El defecto que el usuario cazó contra planta el 22-09-2026, y que
     * ninguna prueba veía porque el árbol de mentira no tenía subcarpetas
     * dentro de un activo.
     *
     * `S1` tiene dentro la carpeta `NOT_USED`, que no aporta ninguna variable
     * marcada. `hojasBajo()` devuelve `null` si una subcarpeta del camino no
     * se ha leído —a propósito— y el editor pintaba ese `null` como «sin
     * leer», desmarcando el activo entero: al reabrir, `S1` salía desactivado
     * aunque sus variables estuvieran guardadas.
     */
    const SUB = `${RAIZ}S1/NOT_USED/`;
    servirArbol({
      ...ARBOL,
      [`${RAIZ}S1/`]: [...S1.map((n) => hoja(`${RAIZ}S1/`, n)), carpeta(`${RAIZ}S1/`, "NOT_USED")],
      [SUB]: [hoja(SUB, "CONECTED 1"), hoja(SUB, "NOT 1")],
    });

    montar({
      maquina: {
        ...guardada(),
        assets: [{ id: "Vibraciones", pointName: RAIZ, rol: "raiz" }, { id: "S1", pointName: `${RAIZ}S1/`, rol: "secundario" }],
        variables: [
          { id: "vRMS_S1", pointName: `${RAIZ}S1/vRMS_S1`, historyPointName: `${HDA}${B}S1:vRMS_S1`, historyVerified: true, assetId: "S1", rol: "medida:vRMS", acceso: "read" },
          { id: "aRMS_S1", pointName: `${RAIZ}S1/aRMS_S1`, historyPointName: `${HDA}${B}S1:aRMS_S1`, historyVerified: true, assetId: "S1", rol: "medida:aRMS", acceso: "read" },
        ],
      },
    });

    await screen.findByRole("checkbox", { name: /Marcar todas las variables de S1/ });

    /*
     * Lo que fallaba, y es lo que ve quien abre la pantalla: con la subcarpeta
     * sin leer, `hojasBajo()` devolvía `null`, el conteo salía «sin leer» y la
     * casilla del activo quedaba SIN marcar ni indeterminar —desactivada— pese
     * a tener dos variables guardadas.
     *
     * La casilla se vuelve a buscar en CADA vuelta del `waitFor`: leer la
     * subcarpeta repinta la fila, y un nodo capturado antes se queda obsoleto
     * —comprobarlo sobre la referencia vieja falla aunque la pantalla ya esté
     * bien—.
     */
    await waitFor(() => {
      const c = screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ });
      expect(c.checked || c.indeterminate).toBe(true);
      expect(c.closest("div")?.textContent ?? "").not.toMatch(/sin leer/);
    });

    /* Las variables guardadas siguen marcadas: el activo no se vació. */
    expect(await screen.findByText(/2 variables marcadas/)).toBeTruthy();
  });

  it("si la carpeta de una variable NO se pudo leer, queda «no se pudo comprobar», no ausente", async () => {
    servirArbol({ ...ARBOL, [`${RAIZ}S2/`]: "FALLA" });
    montar({ maquina: guardada() });

    expect(await screen.findByText("Variables guardadas cuya rama no se pudo leer")).toBeTruthy();
    expect(screen.queryByText("Variables guardadas que ya no están en el árbol")).toBeNull();
  });

  it("al editar sólo se cargan las limitaciones PROPIAS, y el PATCH las lleva siempre (F9)", async () => {
    /*
     * `limitaciones` de la API es la lista MEZCLADA (propias + las que deriva
     * la validación). Si el editor la cargara tal cual, «65 series sin
     * sondear» se grabaría como si alguien lo hubiera escrito y saldría dos
     * veces. Por eso la API separa `limitacionesPropias` y el editor lee ésa.
     */
    editarMaquina.mockResolvedValue({ ok: true, maquina: guardada(), avisos: [] });
    montar({
      maquina: {
        ...guardada(),
        limitacionesPropias: ["El motor gira sin carga acoplada."],
        limitaciones: ["El motor gira sin carga acoplada.", "65 de 86 series declaradas están sin sondear."],
      },
    });
    await screen.findByRole("checkbox", { name: /Marcar todas las variables de S2/ });

    const campo = screen.getByLabelText("Limitaciones de la instalación");
    expect(campo.value).toBe("El motor gira sin carga acoplada.");
    expect(campo.value).not.toMatch(/sin sondear/);

    /* Se borra la propia: el PATCH tiene que decir «ninguna», no callar. */
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(editarMaquina).toHaveBeenCalledTimes(1));
    expect(editarMaquina.mock.calls[0][1].limitaciones).toEqual([]);
  });

  it("si la API no separa las propias (backend anterior a F9), el PATCH NO toca las limitaciones", async () => {
    /* Con el campo vacío por no saber, mandar `[]` borraría lo que sí estaba escrito. */
    editarMaquina.mockResolvedValue({ ok: true, maquina: guardada(), avisos: [] });
    montar({ maquina: { ...guardada(), limitaciones: ["El motor gira sin carga acoplada."] } });
    await screen.findByRole("checkbox", { name: /Marcar todas las variables de S2/ });

    expect(screen.getByLabelText("Limitaciones de la instalación").value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(editarMaquina).toHaveBeenCalledTimes(1));
    expect(editarMaquina.mock.calls[0][1]).not.toHaveProperty("limitaciones");
  });

  it("añadir y quitar conserva el resto: el PATCH lleva la lista entera, con la ausente si se dejó", async () => {
    editarMaquina.mockResolvedValue({ ok: true, maquina: guardada(), avisos: [] });
    montar({ maquina: guardada() });
    await screen.findByRole("checkbox", { name: /Marcar todas las variables de S2/ });

    /* Se añade V20 entera y se quita aRMS_S2. */
    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de V20/ }));
    await screen.findByText(/5 variables marcadas/);
    fireEvent.click(screen.getAllByRole("button", { name: /^S2/ })[0]);
    fireEvent.click(await screen.findByRole("checkbox", { name: "aRMS_S2" }));
    await screen.findByText(/4 variables marcadas/);

    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(editarMaquina).toHaveBeenCalledTimes(1));

    const [id, cambios] = editarMaquina.mock.calls[0];
    expect(id).toBe("vib-motor-02");
    expect(cambios).not.toHaveProperty("id");
    const puntos = cambios.variables.map((v) => v.pointName);
    expect(puntos).toContain(`${RAIZ}S2/vRMS_S2`);
    expect(puntos).toContain(`${RAIZ}S2/Sensoroffset_S2`);
    expect(puntos).toContain(`${RAIZ}V20/SPEED_BMS`);
    expect(puntos).not.toContain(`${RAIZ}S2/aRMS_S2`);
    /* La serie que ya estaba decidida se conserva tal cual. */
    expect(cambios.variables.find((v) => v.id === "vRMS_S2").historyPointName).toBe(`${HDA}${B}S2:vRMS_S2`);
    /* Y la verificación no viaja: la conserva el servidor. */
    for (const v of cambios.variables) expect(v).not.toHaveProperty("historyVerified");
  });
});

describe("nombre y alias por activo (Plan 42.5 F6, D15)", () => {
  it("al dar de alta, cada activo marcado ofrece nombre y alias; la sugerencia del tipo se aplica con un botón, y todo viaja en el payload", async () => {
    crearMaquina.mockResolvedValue({ ok: true, maquina: { id: "vib-motor-02", nombre: "Motor 2" }, avisos: [] });
    montar();
    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "vib-motor-02" } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Motor 2" } });
    fireEvent.change(screen.getByLabelText("PLC"), { target: { value: "PLC_2 · ua:DEMO3" } });
    await explorar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Marcar todas las variables de S1/ }));
    await screen.findByText(/26 variables marcadas/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir los contadores del área" }));
    await screen.findByText(/28 variables marcadas/);

    /* Sin nombre, el campo está vacío y el tipo ofrece el suyo; no se aplica solo. */
    expect(screen.getByLabelText("Nombre del activo S1").value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Usar «Lado acople»" }));
    expect(screen.getByLabelText("Nombre del activo S1").value).toBe("Lado acople");
    fireEvent.change(screen.getByLabelText("Alias del activo S1"), { target: { value: "acople chiquito, lado del motor" } });

    fireEvent.click(screen.getByRole("button", { name: /Dar de alta la máquina/ }));
    await waitFor(() => expect(crearMaquina).toHaveBeenCalledTimes(1));
    const s1 = crearMaquina.mock.calls[0][0].assets.find((a) => a.id === "S1");
    expect(s1).toMatchObject({ nombre: "Lado acople", alias: ["acople chiquito", "lado del motor"] });
    /* La raíz, sin detalle, va como siempre. */
    expect(crearMaquina.mock.calls[0][0].assets[0]).not.toHaveProperty("alias");
  });

  it("al editar, el nombre y los alias guardados se siembran y sobreviven al PATCH aunque no se toquen", async () => {
    const guardadaConNombres = {
      id: "vib-motor-02", nombre: "Motor 2", tipo: "vibraciones", plc: "PLC_2 · ua:DEMO3",
      arboles: { enVivo: RAIZ, historico: HDA, alarmas: AREA },
      assets: [
        { id: "Vibraciones", pointName: RAIZ, rol: "raiz", nombre: null, alias: [] },
        { id: "S2", pointName: `${RAIZ}S2/`, rol: "secundario", nombre: "Rodamiento intermedio", alias: ["intermedio"] },
      ],
      variables: [
        { id: "vRMS_S2", pointName: `${RAIZ}S2/vRMS_S2`, historyPointName: `${HDA}${B}S2:vRMS_S2`, historyVerified: true, assetId: "S2", rol: "medida:vRMS", acceso: "read" },
      ],
    };
    editarMaquina.mockResolvedValue({ ok: true, maquina: guardadaConNombres, avisos: [] });
    montar({ maquina: guardadaConNombres });
    await screen.findByRole("checkbox", { name: /Marcar todas las variables de S2/ });

    expect(screen.getByLabelText("Nombre del activo S2").value).toBe("Rodamiento intermedio");
    expect(screen.getByLabelText("Alias del activo S2").value).toBe("intermedio");
    /* Con el nombre ya puesto igual que la sugerencia, no se ofrece el botón. */
    expect(screen.queryByRole("button", { name: "Usar «Rodamiento intermedio»" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(editarMaquina).toHaveBeenCalledTimes(1));
    expect(editarMaquina.mock.calls[0][1].assets.find((a) => a.id === "S2")).toMatchObject({
      nombre: "Rodamiento intermedio", alias: ["intermedio"],
    });
  });
});
