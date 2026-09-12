// @vitest-environment jsdom
/**
 * error-del-puente.test.js — Plan 25 F9 (`SEG-01`, segunda mitad).
 *
 * `errorDeRespuesta()` es el punto ÚNICO donde un 401 de CUALQUIERA de los
 * seis clientes HTTP dispara el aviso de sesión inválida — se modificó una
 * vez aquí en vez de en cada cliente por separado, así que esta prueba cubre
 * a los seis a la vez.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorDeRespuesta } from "@/lib/api/errorDelPuente.js";
import { EVENTO_SESION_INVALIDA } from "@/lib/api/sesionInvalida.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("un 401 dispara EVENTO_SESION_INVALIDA con el `caducado` del servidor", () => {
  it("caducado: true viaja tal cual", () => {
    const escuchado = vi.fn();
    window.addEventListener(EVENTO_SESION_INVALIDA, escuchado);

    errorDeRespuesta({ ok: false, error: "La sesión ha caducado.", caducado: true }, 401);

    expect(escuchado).toHaveBeenCalledTimes(1);
    expect(escuchado.mock.calls[0][0].detail).toEqual({ caducado: true });
    window.removeEventListener(EVENTO_SESION_INVALIDA, escuchado);
  });

  it("caducado: false viaja tal cual — token inválido, no expirado", () => {
    const escuchado = vi.fn();
    window.addEventListener(EVENTO_SESION_INVALIDA, escuchado);

    errorDeRespuesta({ ok: false, error: "Token inválido.", caducado: false }, 401);

    expect(escuchado.mock.calls[0][0].detail).toEqual({ caducado: false });
    window.removeEventListener(EVENTO_SESION_INVALIDA, escuchado);
  });

  it("si el cuerpo no trae `caducado`, se trata como NO caducado — el lado que pide acceso", () => {
    /*
     * Un 401 de una ruta que no pasa por `autenticar`, o un formato de cuerpo
     * inesperado: sin el campo, la decisión segura es pedir acceso de nuevo,
     * no intentar una renovación que quizá no tenga sentido.
     */
    const escuchado = vi.fn();
    window.addEventListener(EVENTO_SESION_INVALIDA, escuchado);

    errorDeRespuesta({ ok: false, error: "algo" }, 401);

    expect(escuchado.mock.calls[0][0].detail).toEqual({ caducado: false });
    window.removeEventListener(EVENTO_SESION_INVALIDA, escuchado);
  });
});

describe("otros códigos de estado NO disparan el evento", () => {
  it("un 403 (falta de rol) no es un problema de SESIÓN, es de PERMISOS", () => {
    const escuchado = vi.fn();
    window.addEventListener(EVENTO_SESION_INVALIDA, escuchado);

    errorDeRespuesta({ ok: false, error: 'Esta acción requiere el rol "operador".' }, 403);

    expect(escuchado).not.toHaveBeenCalled();
    window.removeEventListener(EVENTO_SESION_INVALIDA, escuchado);
  });

  it("un 500 tampoco dispara nada — es un fallo del servidor, no de la sesión", () => {
    const escuchado = vi.fn();
    window.addEventListener(EVENTO_SESION_INVALIDA, escuchado);

    errorDeRespuesta({ ok: false, error: "boom" }, 500);

    expect(escuchado).not.toHaveBeenCalled();
    window.removeEventListener(EVENTO_SESION_INVALIDA, escuchado);
  });
});

describe("el error construido conserva el código y el mensaje, como siempre", () => {
  it("un 401 sigue devolviendo un ErrorDelPuente con su código", () => {
    // Disparar el evento no puede cambiar lo que ya hacía esta función.
    const error = errorDeRespuesta({ ok: false, error: "Sesión caducada.", codigo: "ERROR_TOKEN", caducado: true }, 401);
    expect(error.codigo).toBe("ERROR_TOKEN");
    expect(error.estado).toBe(401);
  });
});
