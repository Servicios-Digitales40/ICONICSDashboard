// @vitest-environment jsdom
/**
 * exportar.test.js
 * ------------------------------------------------------------------
 * Plan 13, Fase 5 (F5): llevarse una gráfica del historiador como CSV o
 * PNG. Se prueban las tres piezas puras del módulo —`nombreArchivo`,
 * `datosACSV`, `prepararSvgParaExportar`— y nada de lo que orquesta
 * `canvas`: jsdom no lo implementa (`getContext` da `null`, `toBlob` nunca
 * llama a su callback, comprobado antes de escribir esto), así que
 * `descargarPNG` en sí queda para la revisión en pantalla del Plan 13 (§6).
 */
import { describe, expect, it } from "vitest";

import { datosACSV, nombreArchivo, prepararSvgParaExportar } from "@/Demo-EVA/lib/exportar.js";

const SENAL_NIVEL = { key: "nivelTanque", corto: "Nivel", unidad: "%" };
const SENAL_SIN_UNIDAD = { key: "presionRelativa", corto: "Presión", unidad: "" };

const DOS_PUNTOS = [
  { t: new Date("2026-08-19T14:32:00"), valor: 62.5 },
  { t: new Date("2026-08-20T14:32:00"), valor: 71.2 },
];

describe("nombreArchivo: describe lo que HAY en el archivo, no lo que se pidió", () => {
  it("lleva el slug de la señal, el primer y el último instante, y el agregado", () => {
    const nombre = nombreArchivo(SENAL_NIVEL, DOS_PUNTOS, "csv");
    expect(nombre).toBe("nivel_2026-08-19T14-32_2026-08-20T14-32_average.csv");
  });

  it("un acento en el nombre de la señal no llega al archivo", () => {
    const nombre = nombreArchivo(SENAL_SIN_UNIDAD, DOS_PUNTOS, "png");
    expect(nombre).toMatch(/^presion_/);
    expect(nombre).not.toMatch(/[^\x00-\x7F]/); // ningún carácter fuera de ASCII
  });

  it("sin datos, no inventa un rango: sólo el nombre de la señal", () => {
    expect(nombreArchivo(SENAL_NIVEL, [], "csv")).toBe("nivel.csv");
    expect(nombreArchivo(SENAL_NIVEL, null, "csv")).toBe("nivel.csv");
  });

  it("los dos puntos de la hora no llegan al nombre: Windows no los admite en un archivo", () => {
    const nombre = nombreArchivo(SENAL_NIVEL, DOS_PUNTOS, "csv");
    expect(nombre).not.toContain(":");
  });
});

describe("datosACSV: una fila por muestra, con procedencia y sin inventar calidad", () => {
  it("la cabecera lleva la unidad cuando el tag la declara", () => {
    const csv = datosACSV(SENAL_NIVEL, DOS_PUNTOS);
    expect(csv.split("\r\n")[0]).toBe("instante_iso,hora_local,valor (%)");
  });

  it("sin unidad declarada, la cabecera no inventa una", () => {
    const csv = datosACSV(SENAL_SIN_UNIDAD, DOS_PUNTOS);
    expect(csv.split("\r\n")[0]).toBe("instante_iso,hora_local,valor");
  });

  it("cada fila lleva el instante en ISO y el valor, en el orden de los datos", () => {
    const filas = datosACSV(SENAL_NIVEL, DOS_PUNTOS).split("\r\n").slice(1);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toContain(DOS_PUNTOS[0].t.toISOString());
    expect(filas[0]).toContain("62.5");
    expect(filas[1]).toContain(DOS_PUNTOS[1].t.toISOString());
  });

  it("sin datos, sólo queda la cabecera — no una fila vacía", () => {
    expect(datosACSV(SENAL_NIVEL, []).split("\r\n")).toHaveLength(1);
  });
});

describe("prepararSvgParaExportar: fondo y título dentro de la imagen", () => {
  function svgDeMentira() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "320");
    svg.setAttribute("height", "150");
    const trazo = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trazo.setAttribute("d", "M0,0 L10,10");
    trazo.setAttribute("class", "trazo-de-verdad");
    svg.appendChild(trazo);
    return svg;
  }

  it("el resultado es un <svg> con un <rect> de fondo por delante de la gráfica", () => {
    const xml = prepararSvgParaExportar(svgDeMentira(), { titulo: "Nivel · Ayer", fondo: "#0B0E16" });
    expect(xml).toContain("<svg");
    expect(xml.indexOf("<rect")).toBeLessThan(xml.indexOf('class="trazo-de-verdad"'));
    expect(xml).toContain('fill="#0B0E16"');
  });

  it("el título viaja como <text> dentro del propio SVG, no como atributo aparte", () => {
    const xml = prepararSvgParaExportar(svgDeMentira(), { titulo: "Nivel del tanque · 19-20 ago", fondo: "#fff" });
    expect(xml).toContain("<text");
    expect(xml).toContain("Nivel del tanque");
  });

  it("el trazo original sigue presente: el título no lo sustituye, lo acompaña", () => {
    const xml = prepararSvgParaExportar(svgDeMentira(), { titulo: "x", fondo: "#fff" });
    expect(xml).toContain('class="trazo-de-verdad"');
  });

  it("el alto crece para dejar sitio al título, sin recortar la gráfica original", () => {
    const xml = prepararSvgParaExportar(svgDeMentira(), { titulo: "x", fondo: "#fff" });
    const alto = Number(xml.match(/height="(\d+)"/)[1]);
    expect(alto).toBeGreaterThan(150); // 150 = alto original de svgDeMentira()
  });

  it("no toca el <svg> real: el original sigue con su trazo, sin envolver", () => {
    const original = svgDeMentira();
    prepararSvgParaExportar(original, { titulo: "x", fondo: "#fff" });
    expect(original.querySelector(".trazo-de-verdad")).toBeTruthy();
    expect(original.querySelector("rect")).toBeNull();
  });
});
