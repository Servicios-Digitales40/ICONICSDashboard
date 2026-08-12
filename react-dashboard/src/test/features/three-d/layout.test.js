/**
 * layout.test.js
 * ------------------------------------------------------------------
 * La distribución de la maqueta contra el catálogo de ICONICS.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * `LAYOUT` es una tabla escrita a mano y `tagCatalog.js` es la fuente de
 * verdad de qué máquinas existen. Los dos se mueven por su cuenta, y cuando se
 * separan **no falla nada**: una máquina nueva en el catálogo simplemente no
 * aparece en la maqueta, y en un plano de planta lo que no está no se echa de
 * menos. Sería la peor clase de fallo, porque la pantalla sigue pareciendo
 * completa.
 *
 * Lo mismo con los solapes: dos máquinas en la misma coordenada se ven como
 * una, y el conteo cuadra en todos los sitios menos en la pantalla.
 */
import { describe, expect, it } from "vitest";

import { listMachines } from "@shared/tagCatalog.js";
import {
  ESCALA_MAQUETA,
  FILAS,
  LAYOUT,
  RADIO_PISO,
  maquinasColocadas,
  posicionDe,
  tramos,
} from "@/features/three-d/lib/layout.js";

const CATALOGO = listMachines();

/** Huella de la máquina en la maqueta: 2.3 × 1.5 del modelo, a escala. */
const ANCHO = 2.3 * ESCALA_MAQUETA;
const FONDO = 1.5 * ESCALA_MAQUETA;

describe("cobertura del catálogo", () => {
  it("están las 10 máquinas reales, ni una más ni una menos", () => {
    expect(Object.keys(LAYOUT).sort()).toEqual(CATALOGO.map((m) => m.id).sort());
    expect(maquinasColocadas()).toHaveLength(CATALOGO.length);
  });

  it("no hay posiciones para máquinas que no existen", () => {
    // Cazaría un id mal escrito («LIN/12», «REC/12»), que sin esto se
    // traduciría en una máquina que falta y otra que sobra sin avisar.
    const ids = new Set(CATALOGO.map((m) => m.id));
    for (const id of Object.keys(LAYOUT)) {
      expect(ids.has(id), `"${id}" no está en el catálogo`).toBe(true);
    }
  });

  it("una máquina desconocida no cae en el origen", () => {
    // Devolver (0,0) apilaría los desconocidos unos sobre otros en el centro
    // de la planta, que es un fallo muy difícil de leer en pantalla.
    expect(posicionDe("LIN/99")).toBeNull();
    expect(posicionDe(undefined)).toBeNull();
  });
});

describe("la planta se ve entera y sin solapes", () => {
  it("ningún par de máquinas se pisa", () => {
    const puestas = maquinasColocadas();

    for (let i = 0; i < puestas.length; i++) {
      for (let j = i + 1; j < puestas.length; j++) {
        const a = puestas[i].pos;
        const b = puestas[j].pos;
        const separadas = Math.abs(a.x - b.x) >= ANCHO || Math.abs(a.z - b.z) >= FONDO;
        expect(separadas, `${puestas[i].id} y ${puestas[j].id} se solapan`).toBe(true);
      }
    }
  });

  it("todas caben dentro del suelo", () => {
    // Una máquina fuera del disco flota sobre el vacío, y con la rejilla
    // debajo es sorprendentemente fácil no darse cuenta al ajustar la tabla.
    for (const { id, pos } of maquinasColocadas()) {
      const radio = Math.hypot(Math.abs(pos.x) + ANCHO / 2, Math.abs(pos.z) + FONDO / 2);
      expect(radio, `${id} se sale del suelo`).toBeLessThan(RADIO_PISO);
    }
  });
});

describe("pasillos", () => {
  it("las filas sólo mencionan máquinas colocadas", () => {
    for (const fila of FILAS) {
      for (const id of fila) {
        expect(posicionDe(id), `"${id}" está en FILAS pero no en LAYOUT`).not.toBeNull();
      }
    }
  });

  it("toda máquina pertenece exactamente a una fila", () => {
    const enFilas = FILAS.flat();
    expect(new Set(enFilas).size, "hay una máquina repetida en FILAS").toBe(enFilas.length);
    expect(enFilas.sort()).toEqual(CATALOGO.map((m) => m.id).sort());
  });

  it("hay un tramo por cada par consecutivo", () => {
    // Tres filas de 3, 4 y 3 → 2 + 3 + 2 = 7 tramos.
    expect(tramos()).toHaveLength(FILAS.reduce((n, f) => n + f.length - 1, 0));
    for (const t of tramos()) {
      expect(t.a).not.toEqual(t.b);
    }
  });
});
