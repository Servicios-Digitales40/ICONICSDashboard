/**
 * apiClient.test.js
 * ------------------------------------------------------------------
 * El contrato con el puente: qué URL se arma, qué se espera de vuelta y qué
 * pasa cuando contesta mal.
 *
 * ── POR QUÉ ESTE ARCHIVO CAMBIÓ DE SUJETO (PLAN 20 FASES 3 Y 4) ────
 *
 * Cubría `fetchIconicsAlarms`, `acknowledgeIconicsAlarms` y `fetchHealth`:
 * las tres únicas de `apiClient.js` que probaba, y **las tres murieron con sus
 * consumidores** —la vista de Alarmas y el banner de estado del layout—. Una
 * suite en verde midiendo código que la aplicación no ejecuta es peor que no
 * tenerla: da confianza sobre nada.
 *
 * Ahora cubre las tres que quedan, que son exactamente las que usa el cajón de
 * Assets, más las dos garantías que la Fase 4 añadió a TODA petición:
 *
 *  - que la cookie de sesión viaje (`credentials: "include"`), y
 *  - que un 401 de caducidad se distinga de un 401 de permisos.
 *
 * Se mockea `fetch` global: lo que importa es que cada función arme bien su
 * petición e interprete bien la respuesta, no que la red funcione.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browseIconics, fetchIconicsBatch, fetchIconicsPoint } from "@/lib/iconics/apiClient.js";
import { ErrorDeSesion, alCaducarSesion } from "@/lib/api/pedir.js";

function responde(cuerpo, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(cuerpo),
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
    clone() {
      return this;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(responde({ ok: true, payload: {} }))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** La URL de la última llamada, sin repetir el índice mágico en cada prueba. */
const urlPedida = () => fetch.mock.calls.at(-1)[0];
const opcionesPedidas = () => fetch.mock.calls.at(-1)[1];

describe("las tres lecturas del cajón de Assets", () => {
  it("fetchIconicsPoint codifica el nombre del punto", async () => {
    await fetchIconicsPoint("ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE");
    expect(urlPedida()).toContain("/api/iconics/data?pointName=ac%3ATDCON");
  });

  it("fetchIconicsPoint sin nombre no manda una query vacía", async () => {
    /*
     * Sin punto, el backend usa `ICONICS_POINT_NAME`. Mandar `?pointName=`
     * sería pedir explícitamente el punto vacío, que es otra cosa.
     */
    await fetchIconicsPoint();
    expect(urlPedida()).toMatch(/\/api\/iconics\/data$/);
  });

  it("fetchIconicsBatch manda los puntos separados por coma y codificados", async () => {
    await fetchIconicsBatch(["ac:uno", "ac:dos"]);
    expect(urlPedida()).toContain("points=ac%3Auno,ac%3Ados");
  });

  it("browseIconics sin ruta pide las raíces", async () => {
    await browseIconics();
    expect(urlPedida()).toMatch(/\/api\/iconics\/browse$/);
  });

  it("browseIconics con ruta la codifica", async () => {
    await browseIconics("ac:TDCON/DEMO/");
    expect(urlPedida()).toContain("browse?path=ac%3ATDCON%2FDEMO%2F");
  });
});

describe("el contrato de error", () => {
  it("un ok:false con 200 se propaga como excepción, con el motivo del servidor", async () => {
    /*
     * El puente responde 200 con `ok:false` cuando ICONICS contesta pero mal.
     * Tratarlo como éxito metería un `undefined` en la pantalla sin decir nada.
     */
    fetch.mockResolvedValueOnce(responde({ ok: false, error: "El punto no existe." }));
    await expect(fetchIconicsPoint("ac:fantasma")).rejects.toThrow("El punto no existe.");
  });

  it("un 500 sin `error` se propaga con un mensaje que nombra la ruta", async () => {
    fetch.mockResolvedValueOnce(responde({}, { status: 500 }));
    await expect(fetchIconicsPoint("ac:x")).rejects.toThrow(/\/api\/iconics\/data/);
  });
});

describe("la sesión viaja en cada petición (Plan 20 Fase 4)", () => {
  it("siempre con credentials: include", async () => {
    /*
     * En planta la API es del mismo origen y el defecto ya mandaría la cookie.
     * Con `VITE_API_BASE` apuntando a otro servidor la petición pasa a ser
     * cruzada y el defecto la omite: el login funcionaría y la pantalla
     * siguiente daría 401.
     */
    await browseIconics();
    expect(opcionesPedidas()).toMatchObject({ credentials: "include" });
  });

  it("un 401 de caducidad avisa a quien escucha y lanza ErrorDeSesion", async () => {
    const avisado = vi.fn();
    const baja = alCaducarSesion(avisado);

    fetch.mockResolvedValueOnce(
      responde({ ok: false, motivo: "sesion", error: "Tu sesión ha caducado." }, { status: 401 })
    );

    await expect(browseIconics()).rejects.toBeInstanceOf(ErrorDeSesion);
    expect(avisado).toHaveBeenCalledOnce();
    baja();
  });

  it("un 401 SIN motivo de sesión no expulsa a nadie", async () => {
    /*
     * Es el que devuelve ICONICS cuando el usuario no tiene permiso sobre un
     * punto. Uniformarlo con el de caducidad haría que pedir un dato prohibido
     * cerrara la sesión y borrara la conversación en curso.
     */
    const avisado = vi.fn();
    const baja = alCaducarSesion(avisado);

    fetch.mockResolvedValueOnce(
      responde({ ok: false, error: "No tienes permiso sobre ese punto." }, { status: 401 })
    );

    await expect(browseIconics()).rejects.not.toBeInstanceOf(ErrorDeSesion);
    expect(avisado).not.toHaveBeenCalled();
    baja();
  });
});
