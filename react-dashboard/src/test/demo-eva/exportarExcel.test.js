/**
 * exportarExcel.test.js
 * ------------------------------------------------------------------
 * El .xlsx "exportar todo" de la vista Detalle (`lib/exportarExcel.js`).
 *
 * Mismo criterio que `exportar.test.js`: se prueban las piezas PURAS
 * —`armarLibro`, `nombreArchivoGeneral`— y no `descargarLibro`, que dispara
 * `XLSX.writeFile` (que a su vez crea su propio `<a download>` y no hay
 * forma de comprobar la descarga real sin salir del entorno de prueba).
 *
 * Sin `@vitest-environment jsdom`: SheetJS (`XLSX.utils.*`) no toca el DOM
 * para construir un workbook, así que corre igual de bien —y más rápido—
 * en el entorno `node` por defecto.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { armarLibro, nombreArchivoGeneral } from "@/Demo-EVA/lib/exportarExcel.js";

const SENALES_DEMO = [
  { key: "nivelTanque", corto: "Nivel", unidad: "%" },
  { key: "temperaturaTanque", corto: "Temperatura", unidad: "°C" },
  { key: "flujoInstantaneo", corto: "Flujo", unidad: "" },
  { key: "presionRelativa", corto: "Presión", unidad: "bar" },
  { key: "tensionLinea", corto: "Tensión", unidad: "V" },
];

const DOS_PUNTOS = [
  { t: new Date("2026-08-19T14:32:00"), valor: 62.5 },
  { t: new Date("2026-08-20T14:32:00"), valor: 71.2 },
];

function hojasDeEjemplo() {
  return SENALES_DEMO.map((senal) => ({ senal, datos: DOS_PUNTOS }));
}

describe("armarLibro: una hoja por señal", () => {
  it("el workbook tiene tantas hojas como señales", () => {
    const wb = armarLibro(hojasDeEjemplo());
    expect(wb.SheetNames).toHaveLength(5);
  });

  it("cada nombre de hoja sale del `corto` de la señal, sin acentos ni caracteres prohibidos por Excel", () => {
    const wb = armarLibro(hojasDeEjemplo());
    expect(wb.SheetNames).toEqual(["Nivel", "Temperatura", "Flujo", "Presion", "Tension"]);
  });

  it("el contenido de una hoja reproduce la cabecera con la misma unidad que datosACSV, y las filas en orden", () => {
    const wb = armarLibro(hojasDeEjemplo());
    const filas = XLSX.utils.sheet_to_json(wb.Sheets["Nivel"], { header: 1 });

    expect(filas[0]).toEqual(["instante_iso", "hora_local", "valor (%)"]);
    expect(filas[1][0]).toBe(DOS_PUNTOS[0].t.toISOString());
    expect(filas[1][2]).toBe(62.5);
    expect(filas[2][0]).toBe(DOS_PUNTOS[1].t.toISOString());
  });

  it("sin unidad declarada, la cabecera no inventa una", () => {
    const wb = armarLibro(hojasDeEjemplo());
    const filas = XLSX.utils.sheet_to_json(wb.Sheets["Flujo"], { header: 1 });
    expect(filas[0]).toEqual(["instante_iso", "hora_local", "valor"]);
  });

  it("una señal sin datos produce una hoja sólo con la cabecera, no una fila vacía", () => {
    const wb = armarLibro([{ senal: SENALES_DEMO[0], datos: [] }]);
    const filas = XLSX.utils.sheet_to_json(wb.Sheets["Nivel"], { header: 1 });
    expect(filas).toHaveLength(1);
  });

  it("un nombre de señal largo se recorta a 31 caracteres: el límite duro de Excel", () => {
    const senalLarga = { key: "x", corto: "Un nombre de señal extremadamente largo y descriptivo", unidad: "" };
    const wb = armarLibro([{ senal: senalLarga, datos: [] }]);
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31);
  });
});

describe("nombreArchivoGeneral: el rango real, sin dos puntos", () => {
  it("lleva el inicio y el fin del rango pedido", () => {
    const nombre = nombreArchivoGeneral({
      inicio: new Date("2026-08-19T14:32:00"),
      fin: new Date("2026-08-20T14:32:00"),
    });
    expect(nombre).toBe("excel-general-historico_2026-08-19T14-32_2026-08-20T14-32.xlsx");
  });

  it("no lleva ':' — Windows no lo admite en un nombre de archivo", () => {
    const nombre = nombreArchivoGeneral({ inicio: new Date(), fin: new Date() });
    expect(nombre).not.toContain(":");
  });
});
