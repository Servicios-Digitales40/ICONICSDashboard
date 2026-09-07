/**
 * exportarTodo.test.js
 * ------------------------------------------------------------------
 * El «Exportar todo» de la vista Detalle (`lib/exportarTodo.js`), que desde
 * el Plan 22 F1 es UN CSV en formato largo y ya no un .xlsx de cinco hojas.
 *
 * Sustituye a `exportarExcel.test.js`, y comprueba lo mismo que aquél más lo
 * que el libro de Excel no llevaba: las tres afirmaciones que el plan pide
 * —mismas columnas, un hueco que sale como hueco y no como cero, y la
 * cobertura del rango dentro del archivo (Plan 21 F7)—.
 *
 * Mismo criterio que `exportar.test.js`: se prueban las piezas PURAS
 * —`armarCSVGeneral`, `nombreArchivoGeneral`— y no la descarga, que la
 * dispara `descargarCSV` y ya está descrita en la cabecera de `exportar.js`.
 *
 * Sin `@vitest-environment jsdom`: armar texto no toca el DOM, así que corre
 * igual de bien —y más rápido— en el entorno `node` por defecto.
 */
import { describe, expect, it } from "vitest";

import { armarCSVGeneral, nombreArchivoGeneral } from "@/Demo-EVA/lib/exportarTodo.js";

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

/** Cobertura completa: la forma que devuelve `leerSerie()` cuando no falta nada. */
const COMPLETA = {
  tramos: 2,
  tramosConDato: 2,
  completa: true,
  desde: DOS_PUNTOS[0].t,
  hasta: DOS_PUNTOS[1].t,
};

function seriesDeEjemplo() {
  return SENALES_DEMO.map((senal) => ({ senal, datos: DOS_PUNTOS, cobertura: COMPLETA }));
}

/** Las líneas del CSV, separando las notas `#` del cuerpo con cabecera. */
function partir(csv) {
  const lineas = csv.split("\r\n");
  const notas = lineas.filter((l) => l.startsWith("#"));
  const cuerpo = lineas.slice(notas.length);
  return { notas, cabecera: cuerpo[0], filas: cuerpo.slice(1) };
}

/**
 * Las celdas de una fila, respetando las comillas.
 *
 * No es un lujo: `hora_local` en es-MX es «19/8/2026, 2:32:00 p. m.» y LLEVA
 * una coma, así que va entrecomillada en toda fila. Un `split(",")` a secas
 * parte esa celda en dos y desplaza las siguientes — la primera versión de
 * este archivo lo hacía y falló al leer el valor, no al escribirlo.
 */
function celdas(fila) {
  const salida = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < fila.length; i++) {
    const c = fila[i];
    if (entreComillas) {
      if (c === '"' && fila[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else actual += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") {
      salida.push(actual);
      actual = "";
    } else actual += c;
  }

  salida.push(actual);
  return salida;
}

describe("armarCSVGeneral: una fila por muestra, con la señal como columna", () => {
  it("la cabecera declara las cinco columnas, con `senal` y `unidad` propias del formato largo", () => {
    const { cabecera } = partir(armarCSVGeneral(seriesDeEjemplo()));
    expect(cabecera).toBe("senal,instante_iso,hora_local,valor,unidad");
  });

  it("hay una fila por muestra de cada señal — cinco señales de dos puntos son diez filas", () => {
    const { filas } = partir(armarCSVGeneral(seriesDeEjemplo()));
    expect(filas).toHaveLength(10);
  });

  it("las filas van agrupadas por señal y en orden dentro de cada una, como las hojas del libro que sustituye", () => {
    const { filas } = partir(armarCSVGeneral(seriesDeEjemplo()));

    expect(filas.slice(0, 2).map((f) => celdas(f)[0])).toEqual(["Nivel", "Nivel"]);
    expect(celdas(filas[0])[1]).toBe(DOS_PUNTOS[0].t.toISOString());
    expect(celdas(filas[1])[1]).toBe(DOS_PUNTOS[1].t.toISOString());
    expect(celdas(filas[2])[0]).toBe("Temperatura");
  });

  it("la unidad viaja por fila: en la misma columna conviven %, °C, bar y V", () => {
    const { filas } = partir(armarCSVGeneral(seriesDeEjemplo()));
    const unidadDe = (nombre) => celdas(filas.find((f) => f.startsWith(`${nombre},`))).at(-1);

    expect(unidadDe("Nivel")).toBe("%");
    expect(unidadDe("Temperatura")).toBe("°C");
    expect(unidadDe("Presión")).toBe("bar");
  });

  it("sin unidad declarada, la columna queda vacía y no se inventa una", () => {
    const { filas } = partir(armarCSVGeneral(seriesDeEjemplo()));
    const flujo = filas.find((f) => f.startsWith("Flujo,"));
    expect(celdas(flujo).at(-1)).toBe("");
  });

  it("el valor sale tal cual llegó, sin redondear", () => {
    const { filas } = partir(armarCSVGeneral(seriesDeEjemplo()));
    expect(celdas(filas[0])[3]).toBe("62.5");
  });

  it("una celda con coma o comillas se escapa, y no parte la fila en dos", () => {
    const senal = { key: "x", corto: 'Nivel, "alto"', unidad: "%" };
    const { filas } = partir(armarCSVGeneral([{ senal, datos: [DOS_PUNTOS[0]], cobertura: COMPLETA }]));
    expect(filas[0]).toContain('"Nivel, ""alto"""');
  });
});

describe("armarCSVGeneral: un hueco sale como hueco, nunca como cero", () => {
  it("una señal sin muestras deja una nota que la NOMBRA — en formato largo, sin ella desaparecería del archivo", () => {
    const series = [
      { senal: SENALES_DEMO[0], datos: DOS_PUNTOS, cobertura: COMPLETA },
      { senal: SENALES_DEMO[1], datos: [], cobertura: null, motivo: null },
    ];
    const { notas, filas } = partir(armarCSVGeneral(series));

    expect(notas).toHaveLength(1);
    expect(notas[0]).toContain("Temperatura");
    expect(notas[0]).toContain("sin datos en el rango pedido");
    expect(filas).toHaveLength(2); // sólo las de Nivel
  });

  it("no fabrica una fila de valor 0 por la señal que no trajo nada", () => {
    const csv = armarCSVGeneral([{ senal: SENALES_DEMO[0], datos: [], cobertura: null }]);
    const { filas } = partir(csv);

    expect(filas).toHaveLength(0);
    expect(csv).not.toContain(",0,");
  });

  it("el `motivo` de leerSerie llega al archivo: «no historizada» no es lo mismo que «el historiador no devolvió nada»", () => {
    const conMotivo = armarCSVGeneral([
      { senal: SENALES_DEMO[0], datos: [], motivo: "Esta señal no registra histórico" },
    ]);
    const sinMotivo = armarCSVGeneral([{ senal: SENALES_DEMO[0], datos: [], motivo: null }]);

    expect(conMotivo).toContain("Motivo: Esta señal no registra histórico");
    expect(sinMotivo).toContain("El historiador no devolvió ninguna muestra");
  });
});

describe("armarCSVGeneral: la cobertura del rango viaja dentro del archivo", () => {
  const INCOMPLETA = {
    tramos: 10,
    tramosConDato: 7,
    completa: false,
    desde: DOS_PUNTOS[0].t,
    hasta: DOS_PUNTOS[1].t,
  };

  it("una cobertura incompleta deja su nota, con el nombre de la señal delante", () => {
    const series = [{ senal: SENALES_DEMO[0], datos: DOS_PUNTOS, cobertura: INCOMPLETA }];
    const { notas } = partir(armarCSVGeneral(series));

    expect(notas[0]).toContain("Nivel:");
    expect(notas[0]).toContain("3 de los 10 tramos del rango pedido no tienen registro");
  });

  it("cada señal declara SU cobertura: dos incompletas son dos notas atribuibles", () => {
    const series = [
      { senal: SENALES_DEMO[0], datos: DOS_PUNTOS, cobertura: INCOMPLETA },
      { senal: SENALES_DEMO[1], datos: DOS_PUNTOS, cobertura: COMPLETA },
      { senal: SENALES_DEMO[2], datos: DOS_PUNTOS, cobertura: INCOMPLETA },
    ];
    const { notas } = partir(armarCSVGeneral(series));

    expect(notas).toHaveLength(2);
    expect(notas[0]).toContain("Nivel:");
    expect(notas[1]).toContain("Flujo:");
  });

  it("con todo completo el archivo no lleva ni una nota: el ruido se reserva para lo que falta", () => {
    const { notas } = partir(armarCSVGeneral(seriesDeEjemplo()));
    expect(notas).toHaveLength(0);
  });

  it("las notas van ANTES de la cabecera, como comentarios `#`, para que Excel y pandas no las tomen por columnas", () => {
    const csv = armarCSVGeneral([{ senal: SENALES_DEMO[0], datos: DOS_PUNTOS, cobertura: INCOMPLETA }]);
    expect(csv.startsWith("#")).toBe(true);
    expect(csv.split("\r\n")[1]).toBe("senal,instante_iso,hora_local,valor,unidad");
  });
});

describe("nombreArchivoGeneral: el rango pedido, el agregado y ningún ':'", () => {
  const RANGO = {
    inicio: new Date("2026-08-19T14:32:00"),
    fin: new Date("2026-08-20T14:32:00"),
  };

  it("lleva el inicio, el fin y el agregado que de verdad contiene", () => {
    expect(nombreArchivoGeneral(RANGO)).toBe(
      "historico-general_2026-08-19T14-32_2026-08-20T14-32_average.csv"
    );
  });

  it("no lleva ':' — Windows no lo admite en un nombre de archivo", () => {
    expect(nombreArchivoGeneral({ inicio: new Date(), fin: new Date() })).not.toContain(":");
  });
});
