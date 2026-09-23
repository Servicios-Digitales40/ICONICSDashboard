// @vitest-environment jsdom
/**
 * maquinas-configuradas.test.jsx
 * ------------------------------------------------------------------
 * El provider que trae las máquinas configuradas al tablero, y cómo
 * `useMaquina()` las resuelve. Plan 37 F1.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Se lee UNA vez, y sólo con la sesión resuelta.** Antes del token, el
 *     401 se leería como sesión inválida; y un provider que envuelve el Shell
 *     no puede sondear.
 *  2. **Las desactivadas no se ofrecen.** Siguen en disco por su historia,
 *     pero no en el menú.
 *  3. **La pantalla de configuración avisa y la lista se vuelve a pedir.**
 *  4. **`useMaquina()` resuelve `?maquina=<id>` a una entrada construida** con
 *     `construirSistema`, y la expone como `configurada`. Una máquina del
 *     registro escrito a mano NO se sustituye por una configurada homónima.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/maquinasApi.js", () => ({
  listarMaquinas: vi.fn(),
}));

let sesionResuelta = true;
vi.mock("@/app/providers/SesionProvider.jsx", () => ({
  useSesionResuelta: () => sesionResuelta,
}));

import { listarMaquinas } from "@/lib/api/maquinasApi.js";
import {
  MaquinasConfiguradasProvider,
  avisarMaquinasCambiaron,
  useMaquinasConfiguradas,
} from "@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx";
import { MaquinaProvider, useMaquina } from "@/Demo-EVA/data/comunes/MaquinaContext.jsx";

const RAIZ = "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/";
const configurada = (id, extra = {}) => ({
  id,
  nombre: `Motor ${id}`,
  tipo: "vibraciones",
  plc: "PLC_2 · ua:DEMO3",
  assets: [{ id: "Vibraciones", pointName: RAIZ, rol: "raiz" }, { id: "S1", pointName: `${RAIZ}S1/`, rol: "secundario" }],
  variables: [
    { id: "vRMS_S1", pointName: `${RAIZ}S1/vRMS_S1`, historyPointName: null, historyVerified: false, assetId: "S1", rol: "medida:vRMS", acceso: "read" },
  ],
  cadenciaMs: 5000,
  limitaciones: [],
  ...extra,
});

function Lista() {
  const { maquinas, cargando } = useMaquinasConfiguradas();
  return <div>lista:{cargando ? "cargando" : maquinas.map((m) => m.id).join(",") || "vacia"}</div>;
}

function Sonda() {
  const { id, registro, configurada: cfg, enServicio } = useMaquina();
  return (
    <ul>
      <li>id:{String(id)}</li>
      <li>registro:{registro ? registro.id : "null"}</li>
      <li>configurada:{cfg ? cfg.id : "null"}</li>
      <li>servicio:{String(enServicio)}</li>
      <li>nombre:{registro?.nombre ?? "-"}</li>
    </ul>
  );
}

beforeEach(() => {
  sesionResuelta = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("el provider de máquinas configuradas", () => {
  it("lee la lista UNA vez al tener sesión, y deja fuera las desactivadas", async () => {
    listarMaquinas.mockResolvedValue({
      ok: true,
      maquinas: [configurada("vib-motor-03"), configurada("vieja", { activa: false })],
    });

    render(
      <MaquinasConfiguradasProvider>
        <Lista />
      </MaquinasConfiguradasProvider>,
    );

    expect(await screen.findByText("lista:vib-motor-03")).toBeTruthy();
    expect(listarMaquinas).toHaveBeenCalledTimes(1);
  });

  it("sin sesión resuelta NO pide nada: el 401 se leería como sesión inválida", async () => {
    sesionResuelta = false;
    listarMaquinas.mockResolvedValue({ ok: true, maquinas: [] });

    render(
      <MaquinasConfiguradasProvider>
        <Lista />
      </MaquinasConfiguradasProvider>,
    );

    await screen.findByText("lista:vacia");
    expect(listarMaquinas).not.toHaveBeenCalled();
  });

  it("cuando la pantalla de configuración avisa, la lista se vuelve a pedir", async () => {
    listarMaquinas
      .mockResolvedValueOnce({ ok: true, maquinas: [] })
      .mockResolvedValueOnce({ ok: true, maquinas: [configurada("vib-motor-03")] });

    render(
      <MaquinasConfiguradasProvider>
        <Lista />
      </MaquinasConfiguradasProvider>,
    );
    await screen.findByText("lista:vacia");

    act(() => avisarMaquinasCambiaron());

    expect(await screen.findByText("lista:vib-motor-03")).toBeTruthy();
    expect(listarMaquinas).toHaveBeenCalledTimes(2);
  });

  it("un fallo al leer deja la lista vacía y no tumba el tablero", async () => {
    listarMaquinas.mockRejectedValue(new Error("el puente no contesta"));

    render(
      <MaquinasConfiguradasProvider>
        <Lista />
      </MaquinasConfiguradasProvider>,
    );

    expect(await screen.findByText("lista:vacia")).toBeTruthy();
  });
});

describe("useMaquina() con una máquina configurada", () => {
  const montar = (page, params) =>
    render(
      <MaquinasConfiguradasProvider>
        <MaquinaProvider page={page} params={params}>
          <Sonda />
        </MaquinaProvider>
      </MaquinasConfiguradasProvider>,
    );

  it("resuelve `?maquina=<id>` a una entrada construida desde su configuración", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, maquinas: [configurada("vib-motor-03")] });

    montar("maq-inicio", { maquina: "vib-motor-03" });

    expect(await screen.findByText("registro:vib-motor-03")).toBeTruthy();
    expect(screen.getByText("configurada:vib-motor-03")).toBeTruthy();
    expect(screen.getByText("servicio:true")).toBeTruthy();
    expect(screen.getByText("nombre:Motor vib-motor-03")).toBeTruthy();
  });

  it("una máquina que ya no está configurada deja `registro` en null, sin caer en otra", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, maquinas: [configurada("vib-motor-03")] });

    montar("maq-inicio", { maquina: "fantasma" });

    await waitFor(() => expect(listarMaquinas).toHaveBeenCalled());
    expect(screen.getByText("id:fantasma")).toBeTruthy();
    expect(screen.getByText("registro:null")).toBeTruthy();
    expect(screen.getByText("configurada:null")).toBeTruthy();
  });

  /*
   * Desde el Plan 40 F2 la única escrita a mano es el TANQUE (la de
   * vibraciones se retira); es el que hace de máquina del registro aquí. Sus
   * vistas propias se borraron en el Plan 42.5 F4 y el registro sólo le
   * atribuye `eva-assets`. Se comprueba por las dos vías: esa ruta, y su id
   * pegado en `?maquina=`.
   */
  it("la máquina escrita a mano sigue siendo la del registro, aunque exista una configurada homónima", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, maquinas: [configurada("tanque")] });

    montar("eva-assets", {});

    await waitFor(() => expect(listarMaquinas).toHaveBeenCalled());
    expect(screen.getByText("registro:tanque")).toBeTruthy();
    expect(screen.getByText("configurada:null")).toBeTruthy();
    /* El nombre es el del registro, no «Motor tanque» de la configurada. */
    expect(screen.getByText("nombre:Tanque y grupo de bombeo")).toBeTruthy();
  });

  it("ni por `?maquina=` una configurada homónima sustituye a la del registro", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, maquinas: [configurada("tanque")] });

    montar("maq-inicio", { maquina: "tanque" });

    await waitFor(() => expect(listarMaquinas).toHaveBeenCalled());
    expect(screen.getByText("registro:tanque")).toBeTruthy();
    expect(screen.getByText("configurada:null")).toBeTruthy();
  });
});
