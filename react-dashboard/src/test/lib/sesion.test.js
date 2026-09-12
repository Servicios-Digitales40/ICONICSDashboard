// @vitest-environment jsdom
/**
 * sesion.test.js — Plan 25 F9 (`SEG-01`, segunda mitad).
 *
 * ── LO QUE MÁS IMPORTA PROBAR ────────────────────────────────────────
 *
 *  1. `expiraEn` es un timestamp ABSOLUTO fijado al guardar, no recalculado
 *     al leer — dos lecturas seguidas tienen que dar el mismo instante.
 *  2. Fail-open: un almacenamiento roto se lee como «sin sesión», nunca lanza.
 *  3. `sesionPorCaducar()` distingue correctamente el umbral de 30 min.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  authHeaders, borrarSesion, guardarSesion, leerSesion,
  sesionCaducada, sesionPorCaducar, UMBRAL_RENOVACION_MIN,
} from "@/lib/api/sesion.js";

afterEach(() => {
  window.localStorage.clear();
});

describe("guardar y leer", () => {
  it("guarda y recupera token y usuario", () => {
    guardarSesion({ token: "abc", expiraEnMinutos: 60, usuario: { id: "ana", roles: ["operador"] } });

    const sesion = leerSesion();
    expect(sesion.token).toBe("abc");
    expect(sesion.usuario.id).toBe("ana");
  });

  it("`expiraEn` es un timestamp ABSOLUTO, fijado al guardar", () => {
    /*
     * Si se recalculara en cada lectura a partir de `expiraEnMinutos`, dos
     * lecturas con el tiempo real pasando entre medias darían valores
     * distintos — y peor, la sesión nunca caducaría de verdad.
     */
    guardarSesion({ token: "abc", expiraEnMinutos: 60, usuario: {} });
    const a = leerSesion().expiraEn;
    const b = leerSesion().expiraEn;
    expect(a).toBe(b);
  });

  it("sin nada guardado, no hay sesión", () => {
    expect(leerSesion()).toBeNull();
  });

  it("borrarSesion() la quita", () => {
    guardarSesion({ token: "abc", expiraEnMinutos: 60, usuario: {} });
    borrarSesion();
    expect(leerSesion()).toBeNull();
  });
});

describe("authHeaders()", () => {
  it("sin sesión, no manda Authorization — la petición sale igual", () => {
    expect(authHeaders()).toEqual({});
  });

  it("con sesión, manda el Bearer token", () => {
    guardarSesion({ token: "el-token", expiraEnMinutos: 60, usuario: {} });
    expect(authHeaders()).toEqual({ Authorization: "Bearer el-token" });
  });
});

describe("sesionPorCaducar(): el umbral de renovación proactiva", () => {
  it("con toda la vida por delante, no hace falta renovar", () => {
    guardarSesion({ token: "x", expiraEnMinutos: 720, usuario: {} }); // 12 h
    expect(sesionPorCaducar()).toBe(false);
  });

  it("a menos de 30 min de caducar, sí hace falta", () => {
    guardarSesion({ token: "x", expiraEnMinutos: UMBRAL_RENOVACION_MIN - 1, usuario: {} });
    expect(sesionPorCaducar()).toBe(true);
  });

  it("sin sesión, no hay nada que renovar", () => {
    expect(sesionPorCaducar()).toBe(false);
  });
});

describe("sesionCaducada()", () => {
  it("una sesión con minutos negativos ya caducó", () => {
    guardarSesion({ token: "x", expiraEnMinutos: -1, usuario: {} });
    expect(sesionCaducada()).toBe(true);
  });

  it("una sesión fresca no ha caducado", () => {
    guardarSesion({ token: "x", expiraEnMinutos: 60, usuario: {} });
    expect(sesionCaducada()).toBe(false);
  });

  it("sin sesión, no se afirma que haya caducado — no hay nada que caduque", () => {
    expect(sesionCaducada()).toBe(false);
  });
});

describe("un almacenamiento roto no tira la aplicación (fail-open)", () => {
  it("si localStorage.getItem lanza, leerSesion() devuelve null", () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => { throw new Error("bloqueado"); };

    expect(() => leerSesion()).not.toThrow();
    expect(leerSesion()).toBeNull();

    window.localStorage.getItem = original;
  });

  it("si localStorage.setItem lanza, guardarSesion() no revienta", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error("bloqueado"); };

    expect(() => guardarSesion({ token: "x", expiraEnMinutos: 60, usuario: {} })).not.toThrow();

    window.localStorage.setItem = original;
  });

  it("un valor corrupto en el almacenamiento se lee como «sin sesión»", () => {
    window.localStorage.setItem("eva:sesion", "{esto no es json valido");
    expect(leerSesion()).toBeNull();
  });

  it("un valor sin `token` ni `expiraEn` también se descarta", () => {
    window.localStorage.setItem("eva:sesion", JSON.stringify({ algoDistinto: true }));
    expect(leerSesion()).toBeNull();
  });
});
