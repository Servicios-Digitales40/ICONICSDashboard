#!/usr/bin/env node
/**
 * scripts/verificar-historia.mjs
 * ------------------------------------------------------------------
 * Comprueba que el HISTORIADOR de ICONICS responde a lo que el
 * comparativo le va a pedir.
 *
 * El comparativo ya no simula: cada lado lee del historiador la serie
 * horaria de los cuatro factores del OEE y el cierre de los contadores.
 * Si esa lectura falla, la vista lo dice con todas las letras — pero para
 * SABER POR QUÉ falla hace falta preguntárselo al servidor punto por
 * punto, que es lo que hace este script.
 *
 * ── QUÉ DISTINGUE ──────────────────────────────────────────────────
 *
 * Tres fallos que en la pantalla se ven igual y no tienen nada que ver:
 *
 *   · el backend puente no está levantado        → error de conexión
 *   · la ruta /History del servidor ICONICS falla → 500 para CUALQUIER
 *     punto, incluso uno inventado (síntoma de servicio caído o mal
 *     configurado, no de un tag que falte)
 *   · el punto no está historizado                → responde, pero vacío
 *
 * El segundo caso es el que conviene detectar rápido: no se arregla
 * tocando el frontend.
 *
 * ── ES REEJECUTABLE ────────────────────────────────────────────────
 *
 * Lánzalo cada vez que cambie la configuración de logging del
 * historiador, o ante cualquier "el comparativo no muestra nada".
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   1. Levanta el backend puente:  node backend/server.mjs
 *   2. Ejecuta:                    node scripts/verificar-historia.mjs
 *
 * Opciones por variable de entorno:
 *   API_BASE  base del backend   (por defecto http://localhost:3001)
 *   DIA       día a consultar    (por defecto hoy, formato YYYY-MM-DD)
 *   TODAS     "1" para recorrer las 10 máquinas en vez de una muestra
 *
 * Código de salida: 0 si el historiador entrega datos, 1 si no.
 */
import { AREAS, historyPointName, TAGS } from "../react-dashboard/src/lib/iconics/tagCatalog.js";

const API_BASE = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/+$/, "");
const TODAS = process.env.TODAS === "1";

const c = {
  reset: "\x1b[0m", rojo: "\x1b[31m", verde: "\x1b[32m",
  ambar: "\x1b[33m", gris: "\x1b[90m", negrita: "\x1b[1m",
};

/* Mismos agregados, intervalos y formato de fecha que usa la app: si aquí
   funcionara con otros parámetros, la comprobación no probaría nada.

   `Interpolative` y no `Average`: el segundo revienta con 500 en `OEE` y
   `OEE_Cal`, los dos tags que pueden traer Infinity. Ver el comentario de
   AGREGADO en lib/iconics/transport.js. */
const FACTORES = ["oee", "disponibilidad", "rendimiento", "calidad"];
const CONTADORES = ["aprobadas", "rechazadas", "tMuerto"];
const AGREGADO = "Interpolative";
const INTERVALO = "01:00:00";

const p2 = (n) => String(n).padStart(2, "0");

function marcaLocal(d) {
  const min = -d.getTimezoneOffset();
  const signo = min >= 0 ? "+" : "-";
  const off = `${signo}${p2(Math.floor(Math.abs(min) / 60))}:${p2(Math.abs(min) % 60)}`;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${off}`;
}

function rangoDelDia(iso) {
  const inicio = new Date(`${iso}T00:00:00`);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { startDate: marcaLocal(inicio), endDate: marcaLocal(fin) };
}

const hoy = new Date();
const DIA = process.env.DIA ?? `${hoy.getFullYear()}-${p2(hoy.getMonth() + 1)}-${p2(hoy.getDate())}`;

async function leerHistoria(pointName, { aggregate, interval }) {
  const params = new URLSearchParams({ pointName, ...rangoDelDia(DIA), aggregate, interval });
  const res = await fetch(`${API_BASE}/api/iconics/history?${params}`);
  const cuerpo = await res.json().catch(() => null);

  if (!res.ok || cuerpo?.ok === false) {
    return { ok: false, status: res.status, error: cuerpo?.error ?? `HTTP ${res.status}`, payload: cuerpo?.payload };
  }
  return { ok: true, muestras: Array.isArray(cuerpo.data) ? cuerpo.data : [] };
}

/**
 * Estado de la licencia, leído del propio servidor (`$info:`).
 *
 * Es la PRIMERA comprobación por una razón aprendida a golpes: con el
 * servidor en modo Demo, la lectura histórica por Web API está
 * desactivada y `/History` devuelve 500 para cualquier punto. Sin mirar
 * aquí, ese 500 parece un servicio roto o un tag mal escrito, y se
 * pierden horas buscando en el sitio equivocado.
 */
async function revisarLicencia() {
  const puntos = [
    "$info:Overview.Tier",
    "$info:Overview.Edition",
    "$info:Overview.ExpirationDate",
    "$info:Features.HistorianOn",
    "$info:Features.FwxWebApiOn",
  ];

  try {
    const query = puntos.map((p) => encodeURIComponent(p)).join(",");
    const res = await fetch(`${API_BASE}/api/iconics/data/batch?points=${query}`);
    const cuerpo = await res.json();
    const mapa = cuerpo?.payload ?? {};
    const valor = (p) => mapa[p]?.payload?.value ?? null;

    return {
      tier: valor("$info:Overview.Tier"),
      edicion: valor("$info:Overview.Edition"),
      expira: valor("$info:Overview.ExpirationDate"),
      historian: valor("$info:Features.HistorianOn"),
      webapi: valor("$info:Features.FwxWebApiOn"),
    };
  } catch {
    return null;
  }
}

/** Máquinas a sondear: una por área basta para diagnosticar el servicio. */
function maquinas() {
  const salida = [];
  for (const areaId of Object.keys(AREAS)) {
    const ids = AREAS[areaId].machineIds;
    for (const machineId of TODAS ? ids : ids.slice(0, 1)) {
      salida.push({ areaId, machineId, etiqueta: `${areaId}/${machineId}` });
    }
  }
  return salida;
}

async function main() {
  console.log(`${c.negrita}Verificación del historiador (hda:)${c.reset}`);
  console.log(`${c.gris}backend : ${API_BASE}${c.reset}`);
  console.log(`${c.gris}día     : ${DIA}${c.reset}`);
  console.log(`${c.gris}alcance : ${TODAS ? "las 10 máquinas" : "una máquina por área (TODAS=1 para todas)"}${c.reset}\n`);

  // El modo Demo es un AVISO, no un veredicto. Se comprobó contra este
  // servidor que en Demo la lectura histórica SÍ responde; lo que Demo
  // garantiza es que el servidor se apaga cada 2 h, y entonces todo falla
  // a la vez. Conviene saberlo al leer el informe, no en vez de leerlo.
  const lic = await revisarLicencia();
  const enDemo = String(lic?.tier ?? "").toLowerCase() === "demo";
  if (lic?.tier) {
    const color = enDemo ? c.ambar : c.verde;
    console.log(`${color}licencia: ${lic.tier}${lic.edicion ? ` · ${lic.edicion}` : ""}${lic.expira ? ` · expira ${lic.expira}` : ""}${c.reset}`);
    if (enDemo) {
      console.log(`${c.gris}          en Demo el servidor se apaga cada 2 h; si TODO falla, mira la hora.${c.reset}`);
    }
    console.log();
  }

  // Primero un punto que NO existe. Si un inexistente devuelve el mismo
  // error que los reales, el problema es del SERVICIO y no del catálogo,
  // y no tiene sentido leer el informe tag por tag.
  const centinela = await leerHistoria("hda:\\Configuration\\NO_EXISTE:NADA", {
    aggregate: AGREGADO, interval: INTERVALO,
  });

  let conDatos = 0;
  let vacios = 0;
  const fallos = [];

  for (const m of maquinas()) {
    const lecturas = await Promise.all(
      [...FACTORES, ...CONTADORES].map(async (tag) => [
        tag,
        await leerHistoria(historyPointName(m.areaId, m.machineId, tag), { aggregate: AGREGADO, interval: INTERVALO }),
      ])
    );

    const detalle = lecturas.map(([tag, r]) => {
      if (!r.ok) {
        fallos.push({ maquina: m.etiqueta, tag, error: r.error, status: r.status });
        return `${c.rojo}${TAGS[tag]}✗${c.reset}`;
      }
      if (!r.muestras.length) {
        vacios += 1;
        return `${c.ambar}${TAGS[tag]}∅${c.reset}`;
      }
      conDatos += 1;
      return `${c.verde}${TAGS[tag]}:${r.muestras.length}${c.reset}`;
    });

    console.log(`  ${m.etiqueta.padEnd(8)} ${detalle.join(" ")}`);
  }

  /* ── Informe ───────────────────────────────────────────────────── */

  console.log();
  console.log(`${c.verde}✓ con muestras${c.reset}   ${conDatos}`);
  console.log(`${c.ambar}∅ sin muestras${c.reset}   ${vacios}   ${c.gris}(el punto responde pero ese día no tiene datos)${c.reset}`);
  console.log(`${c.rojo}✗ con error${c.reset}      ${fallos.length}`);

  // Que TODO falle, incluido un punto inventado, apunta al servicio y no
  // al catálogo. Con el servidor en Demo, la causa más probable es que se
  // haya cumplido la ventana de 2 horas.
  if (fallos.length === conDatos + vacios + fallos.length && !centinela.ok) {
    console.log(`\n${c.rojo}${c.negrita}Falla TODA lectura histórica, incluso la de un punto inventado.${c.reset}`);
    console.log(`${c.gris}  ${centinela.error} (HTTP ${centinela.status})`);
    console.log(`Eso descarta el catálogo de tags: el problema es del servicio.`);
    if (enDemo) {
      console.log(`El servidor está en Demo y solo concede 2 h por arranque: reinicia`);
      console.log(`los servicios GENESIS (o instala la licencia) y repite.`);
    }
    console.log(`El motivo exacto lo escribe el propio servidor en:`);
    console.log(`  C:\\ProgramData\\ICONICS\\11\\Logs\\IcoWebAPIService.log.xml`);
    console.log(`busca «HistoryController: Historical read failed».${c.reset}`);
    process.exit(1);
  }

  if (fallos.length) {
    console.log(`\n${c.rojo}${c.negrita}Puntos con error${c.reset}`);
    for (const f of fallos.slice(0, 20)) {
      console.log(`  ${f.maquina.padEnd(8)} ${TAGS[f.tag].padEnd(16)} ${f.error}`);
    }
    console.log(`${c.gris}Lo más habitual: al tag le falta la casilla «Is Collected» en la`);
    console.log(`configuración del Data Historian, con su Signal Name apuntando a`);
    console.log(`ac:RESONAC/<área>/<máquina>/<propiedad>.${c.reset}`);
    process.exit(1);
  }

  if (!conDatos) {
    console.log(`\n${c.ambar}${c.negrita}El historiador responde, pero no hay ni una muestra del ${DIA}.${c.reset}`);
    console.log(`${c.gris}Prueba con DIA=YYYY-MM-DD de un día con producción, o revisa qué`);
    console.log(`tags están dados de alta en el grupo de logging.${c.reset}`);
    process.exit(1);
  }

  console.log(`\n${c.verde}${c.negrita}El historiador entrega datos: el comparativo puede leerlos.${c.reset}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${c.rojo}Fallo inesperado:${c.reset}`, err);
  console.error(`${c.gris}¿Está levantado el backend?  node backend/server.mjs${c.reset}`);
  process.exit(1);
});
