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

import { datosACSV, nombreArchivo, notaDeCobertura, notaDeProcedencia, prepararSvgParaExportar } from "@/Demo-EVA/lib/exportar.js";
import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { pointName } from "@shared/eva/tanque/senales.js";

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

/*
 * ── LAS NOTAS `#` VAN DELANTE, ASÍ QUE NO SE INDEXA POR POSICIÓN ──────
 *
 * Estas pruebas hacían `split(CRLF)[0]` para leer la cabecera y `.slice(1)`
 * para las filas. Funcionaba mientras la cabecera fuera siempre la primera
 * línea; al añadir la cabecera de procedencia (Plan 24 F3) dejó de serlo y seis
 * pruebas se pusieron en rojo de golpe — ninguna por un fallo del exportador.
 *
 * Se arregla localizando la cabecera por su CONTENIDO en vez de por su sitio, y
 * eso es más fuerte que reajustar los índices a la posición nueva: una prueba
 * que sabe «la cabecera es la línea que empieza por instante_iso» sobrevive a la
 * siguiente nota que alguien ponga delante, y sigue fallando de verdad si la
 * cabecera desaparece.
 */
const LINEAS = (csv) => csv.split("\r\n");
const esNota = (linea) => linea.startsWith("#") || linea.startsWith('"#');
const cabeceraDe = (csv) => LINEAS(csv).find((l) => l.startsWith("instante_iso"));
const filasDe = (csv) => {
  const lineas = LINEAS(csv);
  const i = lineas.findIndex((l) => l.startsWith("instante_iso"));
  return lineas.slice(i + 1);
};

describe("datosACSV: una fila por muestra, con procedencia y sin inventar calidad", () => {
  it("la cabecera lleva la unidad cuando el tag la declara", () => {
    expect(cabeceraDe(datosACSV(SENAL_NIVEL, DOS_PUNTOS))).toBe("instante_iso,hora_local,valor (%)");
  });

  it("sin unidad declarada, la cabecera no inventa una", () => {
    expect(cabeceraDe(datosACSV(SENAL_SIN_UNIDAD, DOS_PUNTOS))).toBe("instante_iso,hora_local,valor");
  });

  it("cada fila lleva el instante en ISO y el valor, en el orden de los datos", () => {
    const filas = filasDe(datosACSV(SENAL_NIVEL, DOS_PUNTOS));
    expect(filas).toHaveLength(2);
    expect(filas[0]).toContain(DOS_PUNTOS[0].t.toISOString());
    expect(filas[0]).toContain("62.5");
    expect(filas[1]).toContain(DOS_PUNTOS[1].t.toISOString());
  });

  it("sin datos no hay ninguna fila — ni una vacía", () => {
    expect(filasDe(datosACSV(SENAL_NIVEL, []))).toHaveLength(0);
  });

  it("la cabecera de procedencia va antes de la de columnas, y sólo como comentario", () => {
    const lineas = LINEAS(datosACSV(SENAL_NIVEL, DOS_PUNTOS));
    const iCabecera = lineas.findIndex((l) => l.startsWith("instante_iso"));

    // Todo lo que va delante de la cabecera es una nota `#`: nada que Excel
    // pueda confundir con datos.
    expect(iCabecera).toBeGreaterThan(0);
    expect(lineas.slice(0, iCabecera).every(esNota)).toBe(true);
  });

  /*
   * `locale` se añadió para que la hora local de la fila —y la fecha de la
   * nota de cobertura— salgan en el idioma del tablero y no siempre en
   * "es-MX", que era el valor fijo de antes. Sin argumento se sigue
   * comportando como antes: "es-MX" es su valor por defecto.
   */
  it("sin locale, sigue formateando como es-MX (el valor por defecto)", () => {
    const filas = filasDe(datosACSV(SENAL_NIVEL, DOS_PUNTOS));
    expect(filas[0]).toContain(DOS_PUNTOS[0].t.toLocaleString("es-MX"));
  });

  it("con locale en-US, la hora de la fila se escribe en inglés", () => {
    const filas = filasDe(datosACSV(SENAL_NIVEL, DOS_PUNTOS, null, "en-US"));
    expect(filas[0]).toContain(DOS_PUNTOS[0].t.toLocaleString("en-US"));
    expect(filas[0]).not.toContain(DOS_PUNTOS[0].t.toLocaleString("es-MX"));
  });
});

describe("notaDeCobertura: la fecha del comentario respeta el locale pedido", () => {
  const COBERTURA = {
    tramos: 10, tramosConDato: 6, completa: false,
    desde: new Date("2026-08-19T00:00:00"), hasta: new Date("2026-08-24T00:00:00"),
  };

  it("con locale en-US, las fechas del rango van en inglés", () => {
    const nota = notaDeCobertura(COBERTURA, null, "en-US");
    expect(nota).toContain(COBERTURA.desde.toLocaleDateString("en-US"));
    expect(nota).toContain(COBERTURA.hasta.toLocaleDateString("en-US"));
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

/* ── La procedencia del archivo (Plan 24 F3 · USO-09) ────────────────── */

describe("notaDeProcedencia: un CSV que se puede defender solo meses después", () => {
  const PUNTO = pointName("nivelTanque");

  it("declara el tag entero, la máquina con su PLC y el agregado", () => {
    const nota = notaDeProcedencia({ senal: { ...SENAL_NIVEL, historizado: true }, punto: PUNTO });

    expect(nota).toContain(PUNTO);
    // Del registro, no de un literal: si alguien cambia el PLC en
    // `sistemas.js`, el archivo tiene que seguir diciendo la verdad.
    expect(nota).toContain(SISTEMA.tanque.plc);
    expect(nota).toContain(SISTEMA.tanque.series.agregado);
  });

  it("cada línea es un comentario `#`: Excel no la confunde con datos", () => {
    const nota = notaDeProcedencia({ senal: SENAL_NIVEL, punto: PUNTO });

    for (const linea of nota.split("\r\n")) {
      expect(linea.startsWith("#") || linea.startsWith('"#')).toBe(true);
    }
  });

  it("sin punto no inventa máquina: es el cruce que este archivo no puede reintroducir", () => {
    const nota = notaDeProcedencia({ senal: SENAL_NIVEL, punto: null });

    expect(nota).not.toContain(SISTEMA.tanque.plc);
    expect(nota).not.toContain(SISTEMA.vibraciones.plc);
    // Pero sigue fechando la exportación: lo que no se sabe se calla, lo que
    // sí se sabe se dice.
    expect(nota).toMatch(/# exportado:/);
  });

  it("una señal sin serie propia no promete un agregado que no tiene", () => {
    const nota = notaDeProcedencia({
      senal: { ...SENAL_NIVEL, historizado: false }, punto: PUNTO,
    });
    expect(nota).not.toMatch(/# agregado:/);
  });

  it("sin señal no hay nota, en vez de una nota vacía", () => {
    expect(notaDeProcedencia({ senal: null })).toBeNull();
  });

  it("la del tanque y la de vibraciones no se pueden confundir", () => {
    const delTanque = notaDeProcedencia({ senal: SENAL_NIVEL, punto: PUNTO });
    const deVibra = notaDeProcedencia({
      senal: { key: "x", corto: "x" }, punto: SISTEMA.vibraciones.puntos()[0],
    });

    expect(delTanque).toContain(SISTEMA.tanque.plc);
    expect(deVibra).toContain(SISTEMA.vibraciones.plc);
    expect(deVibra).not.toContain(SISTEMA.tanque.plc);
  });
});
