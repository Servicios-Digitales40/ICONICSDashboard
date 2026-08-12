/**
 * verificar-bundle.mjs
 * ------------------------------------------------------------------
 * ¿Se está colando la pila 3D en el arranque?
 *
 * ── POR QUÉ ESTE SCRIPT ────────────────────────────────────────────
 *
 * `three` + r3f + drei pesan del orden del bundle entero de planta. Que eso no
 * lo pague quien abre «Planta» depende de dos cosas que fallan en silencio:
 *
 *  1. Las vistas 3D se cargan con `lazy()`. Un import estático desde
 *     cualquier archivo del arranque —un barril, una constante compartida—
 *     las trae al trozo principal y la aplicación sigue funcionando igual.
 *  2. `manualChunks` reparte por PAQUETE, no por quién lo usa. Un paquete
 *     nuevo en el árbol de drei que no esté en `PAQUETES_3D` cae en el
 *     catch-all `vendor`, que SÍ es de carga inmediata.
 *
 * En los dos casos el síntoma es el mismo: nada se rompe y la pantalla de
 * planta tarda el doble en arrancar. Este script lo convierte en un fallo
 * ruidoso.
 *
 * ── CÓMO SE USA ────────────────────────────────────────────────────
 *
 *     cd react-dashboard && npm run build      # build de planta
 *     node ../scripts/verificar-bundle.mjs
 *
 * Sin argumentos comprueba `react-dashboard/dist`. Devuelve 0 si todo está en
 * su sitio y 1 con el detalle si no.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(process.argv[2] ?? join(AQUI, "..", "react-dashboard", "dist"));

/**
 * Presupuesto del arranque de planta, en KB.
 *
 * Es el tamaño medido antes de instalar la pila 3D (11-ago-2026) con un margen
 * del 10 % para el crecimiento normal de la aplicación. No es una métrica de
 * vanidad: es lo que detecta que `three` ha entrado por la puerta de atrás,
 * porque cualquier fuga de esa pila mueve la cifra en cientos de KB, no en
 * decenas.
 *
 * Si crece por una razón legítima, se sube el número Y se dice por qué.
 */
const PRESUPUESTO_KB = { index: 170, vendor: 90 };

/** Rastros inequívocos de que la pila 3D está dentro de un archivo. */
const HUELLAS_3D = [
  "THREE.WebGLRenderer",
  "BufferGeometry",
  "PerspectiveCamera",
  "@react-three/fiber",
];

const kb = (bytes) => +(bytes / 1024).toFixed(2);

function assets() {
  const dir = join(DIST, "assets");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => ({ nombre: f, ruta: join(dir, f), bytes: statSync(join(dir, f)).size }));
  } catch {
    console.error(`✖ No hay build que revisar en ${DIST}\n  Ejecuta primero: cd react-dashboard && npm run build`);
    process.exit(1);
  }
}

/** Los trozos que descarga el navegador ANTES de que nadie navegue. */
function trozosDeArranque() {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const entrada = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);

  // El HTML sólo enlaza la entrada; sus importaciones estáticas viajan igual.
  // Se resuelven leyendo los `import` del propio archivo, que Vite deja como
  // rutas literales a /assets/.
  const vistos = new Set();
  const pendientes = [...entrada];

  while (pendientes.length) {
    const f = pendientes.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);

    let código;
    try { código = readFileSync(join(DIST, "assets", f), "utf8"); } catch { continue; }

    // `import "./x.js"` / `from"./x.js"` — estáticos. Los dinámicos van con
    // `import(` y ésos son justamente los que NO cuentan.
    for (const m of código.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[^"';]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) {
      pendientes.push(m[1]);
    }
  }
  return vistos;
}

const fallos = [];
const archivos = assets();
const arranque = trozosDeArranque();

console.log(`Build: ${DIST}\n`);

/* 1 · Ningún trozo de arranque puede contener la pila 3D. ------------ */
for (const a of archivos) {
  if (!arranque.has(a.nombre)) continue;
  const código = readFileSync(a.ruta, "utf8");
  const huella = HUELLAS_3D.find((h) => código.includes(h));
  if (huella) {
    fallos.push(
      `${a.nombre} es de carga inmediata y contiene la pila 3D (rastro: «${huella}»).\n` +
      `    Alguien importa una vista 3D de forma estática, o falta un paquete en PAQUETES_3D de vite.config.js.`
    );
  }
}

/* 2 · Los trozos del arranque no se salen del presupuesto. ----------- */
for (const [prefijo, techo] of Object.entries(PRESUPUESTO_KB)) {
  const candidatos = archivos.filter((x) => x.nombre.startsWith(`${prefijo}-`));

  /*
   * Más de un trozo con el mismo prefijo hace ambigua la medición, y el modo
   * de fallo es silencioso: se mediría el primero que apareciera y el techo
   * dejaría de comprobar nada. Pasó al diferir el asistente con `lazy()`
   * importando su barril `index.js`, que produjo un segundo `index-*.js` de
   * 7 KB — y este guion lo dio por bueno frente al techo de 170.
   *
   * Se arregla en el origen (importando el componente y no el barril), pero
   * la comprobación se queda: es más barato que volver a descubrirlo.
   */
  if (candidatos.length > 1) {
    fallos.push(
      `Hay ${candidatos.length} trozos que empiezan por «${prefijo}-»: ` +
      `${candidatos.map((x) => x.nombre).join(", ")}.\n` +
      `    No se puede saber cuál es el del arranque. Importa el componente concreto ` +
      `en vez de un barril \`index.js\` en el \`lazy()\` que lo generó.`
    );
    continue;
  }

  const a = candidatos[0];
  if (!a) continue;
  const tam = kb(a.bytes);
  const ok = tam <= techo;
  console.log(`  ${ok ? "✔" : "✖"} ${prefijo.padEnd(8)} ${String(tam).padStart(8)} KB  (techo ${techo} KB)`);
  if (!ok) fallos.push(`${a.nombre} ocupa ${tam} KB y el techo son ${techo} KB.`);
}

/* 3 · Si hay trozo `three`, tiene que estar FUERA del arranque. ------ */
const three = archivos.find((x) => x.nombre.startsWith("three-"));
if (three) {
  const diferido = !arranque.has(three.nombre);
  console.log(`  ${diferido ? "✔" : "✖"} three    ${String(kb(three.bytes)).padStart(8)} KB  (${diferido ? "diferido" : "EN EL ARRANQUE"})`);
  if (!diferido) fallos.push(`${three.nombre} se descarga en el arranque; debería cargarse sólo al abrir una vista 3D.`);
} else {
  console.log("  · sin trozo `three` (build sin las vistas 3D — normal en el build de planta)");
}

console.log();
if (fallos.length) {
  console.error(`✖ ${fallos.length} problema(s):\n`);
  fallos.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
  process.exit(1);
}
console.log("✔ El arranque no paga la pila 3D.");
