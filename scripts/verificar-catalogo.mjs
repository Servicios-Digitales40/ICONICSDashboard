#!/usr/bin/env node
/**
 * scripts/verificar-catalogo.mjs
 * ------------------------------------------------------------------
 * Contrasta el CATÁLOGO DE TAGS del frontend contra el servidor real.
 *
 * Lee de una vez todos los puntos que la aplicación va a pedir y reporta
 * cuáles no existen, cuáles vuelven con mala calidad y cuáles traen un
 * valor inutilizable.
 *
 * ── PARA QUÉ SIRVE ─────────────────────────────────────────────────
 *
 * El catálogo se derivó del Excel de configuración, no del servidor. Son
 * dos artefactos distintos que pueden divergir: un tag renombrado, una
 * máquina que aún no se ha dado de alta, una propiedad que se quedó sin
 * expresión. Sin esta comprobación, esa divergencia se manifiesta como
 * huecos silenciosos repartidos por la interfaz, y depurarla obliga a ir
 * vista por vista adivinando.
 *
 * Aquí se resuelve en una ejecución y con nombres concretos.
 *
 * ── ES REEJECUTABLE, NO DE UN SOLO USO ─────────────────────────────
 *
 * No es un paso de puesta en marcha: conviene lanzarlo cada vez que
 * cambie la configuración de ICONICS, y ante cualquier «falta un dato en
 * el panel». Por eso vive en `scripts/` y no en una carpeta de arranque.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   1. Levanta el backend puente:   node backend/server.mjs
 *   2. Ejecuta:                     node scripts/verificar-catalogo.mjs
 *
 * Opciones por variable de entorno:
 *   API_BASE   base del backend      (por defecto http://localhost:3001)
 *   LOTE       puntos por petición   (por defecto 50)
 *
 * Código de salida: 0 si todo responde, 1 si hay algún problema — para
 * poder encadenarlo en un script de despliegue.
 */
import { AREAS, pointName, tagsForArea, TAGS } from "../react-dashboard/src/lib/iconics/tagCatalog.js";
import { QUALITY_GOOD, isGoodQuality } from "../react-dashboard/src/lib/iconics/quality.js";

const API_BASE = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/+$/, "");
const LOTE = Number(process.env.LOTE ?? 50);

const c = {
  reset: "\x1b[0m", rojo: "\x1b[31m", verde: "\x1b[32m",
  ambar: "\x1b[33m", gris: "\x1b[90m", negrita: "\x1b[1m",
};

/** Todos los puntos que la aplicación puede llegar a pedir. */
function todosLosPuntos() {
  const salida = [];
  for (const areaId of Object.keys(AREAS)) {
    for (const machineId of AREAS[areaId].machineIds) {
      for (const tag of tagsForArea(areaId)) {
        salida.push({
          punto: pointName(areaId, machineId, tag),
          maquina: `${areaId}/${machineId}`,
          tag,
          propiedad: TAGS[tag],
        });
      }
    }
  }
  return salida;
}

const trocear = (xs, n) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function leerLote(puntos) {
  const query = puntos.map((p) => encodeURIComponent(p.punto)).join(",");
  const res = await fetch(`${API_BASE}/api/iconics/data/batch?points=${query}`);

  if (!res.ok) {
    throw new Error(`El backend respondió ${res.status} ${res.statusText}`);
  }
  const cuerpo = await res.json();
  if (cuerpo?.ok === false) throw new Error(cuerpo.error ?? "error desconocido");

  return cuerpo.payload ?? {};
}

async function main() {
  const puntos = todosLosPuntos();
  const lotes = trocear(puntos, LOTE);

  console.log(`${c.negrita}Verificación del catálogo de tags${c.reset}`);
  console.log(`${c.gris}backend : ${API_BASE}${c.reset}`);
  console.log(`${c.gris}puntos  : ${puntos.length} en ${lotes.length} lote(s) de ${LOTE}${c.reset}\n`);

  const ausentes = [];
  const malaCalidad = [];
  const sinValor = [];
  let correctos = 0;

  for (const [i, lote] of lotes.entries()) {
    process.stdout.write(`${c.gris}lote ${i + 1}/${lotes.length}…${c.reset}\r`);

    let mapa;
    try {
      mapa = await leerLote(lote);
    } catch (err) {
      console.error(`\n${c.rojo}No se pudo consultar el backend:${c.reset} ${err.message}`);
      console.error(`${c.gris}¿Está levantado?  node backend/server.mjs${c.reset}`);
      process.exit(1);
    }

    for (const p of lote) {
      const entrada = mapa[p.punto];

      if (!entrada?.ok) {
        ausentes.push(p);
        continue;
      }

      const payload = entrada.payload ?? {};
      const calidad = payload.quality ?? payload.Quality ?? null;
      const valor = payload.value ?? payload.Value ?? null;

      if (!isGoodQuality(calidad)) {
        malaCalidad.push({ ...p, calidad });
      } else if (valor === null || (typeof valor === "number" && !Number.isFinite(valor))) {
        sinValor.push({ ...p, valor });
      } else {
        correctos += 1;
      }
    }
  }

  /* ── Informe ───────────────────────────────────────────────────── */

  const bloque = (titulo, color, items, detalle) => {
    if (!items.length) return;
    console.log(`\n${color}${c.negrita}${titulo} (${items.length})${c.reset}`);
    // Agrupado por máquina: si falla una máquina entera se ve de un
    // vistazo, en vez de leer 14 líneas casi idénticas.
    const porMaquina = items.reduce((acc, x) => {
      (acc[x.maquina] ??= []).push(detalle(x));
      return acc;
    }, {});
    for (const [maquina, detalles] of Object.entries(porMaquina)) {
      console.log(`  ${maquina.padEnd(8)} ${detalles.join(", ")}`);
    }
  };

  console.log(`\r${" ".repeat(30)}\r`);
  console.log(`${c.verde}✓ correctos${c.reset}          ${correctos}`);

  bloque("✗ NO EXISTEN en el servidor", c.rojo, ausentes, (x) => x.propiedad);
  bloque(`⚠ MALA CALIDAD (≠ ${QUALITY_GOOD})`, c.ambar, malaCalidad,
    (x) => `${x.propiedad}[q=${x.calidad}]`);
  bloque("⚠ SIN VALOR utilizable", c.ambar, sinValor,
    (x) => `${x.propiedad}=${x.valor}`);

  const problemas = ausentes.length + malaCalidad.length + sinValor.length;

  console.log();
  if (!problemas) {
    console.log(`${c.verde}${c.negrita}El catálogo coincide con el servidor.${c.reset}`);
    process.exit(0);
  }

  console.log(`${c.negrita}${problemas} punto(s) con problemas de ${puntos.length}.${c.reset}`);
  if (ausentes.length) {
    console.log(`${c.gris}Los AUSENTES suelen ser tags renombrados o no configurados:`);
    console.log(`revisa docs/TAGS.md y el catálogo en tagCatalog.js.${c.reset}`);
  }
  if (malaCalidad.length) {
    console.log(`${c.gris}La MALA CALIDAD suele venir del PLC o de una consulta SQL vacía`);
    console.log(`(T_Ciclo_Teo y T_Inac_plan salen de la base Proceso_Data).${c.reset}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`${c.rojo}Fallo inesperado:${c.reset}`, err);
  process.exit(1);
});
