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
 *
 * `vendor` sube de 90 a 210 (31-ago-2026): medido en 201.93 KB tras instalar
 * `@tanstack/react-query` para el fetching puntual (`ExploradorAssets.jsx`,
 * `PrediccionBeta.jsx` — ver `lib/queryClient.js`), que no tiene regla propia
 * en `manualChunks` y cae en el catch-all. De esos 201.93 KB, 161.84 ya
 * eran de antes de esta instalación —el techo de 90 llevaba un tiempo roto,
 * sin relación con este cambio—; react-query sólo puso los ~40 KB restantes.
 * Que el número sea ahora generoso no lo deja como estaba: sigue habiendo
 * margen que investigar en lo que ya se acumulaba en `vendor` antes de hoy.
 *
 * ── `vendor` sube de 210 a 270 (08-09-2026), por i18n ──────────────
 *
 * Medido: 206.85 KB antes, **264.01 KB** después de `i18next` +
 * `react-i18next` + `i18next-browser-languagedetector`. Son **+57,16 KB**, y
 * el reparto es ~40 de i18next, ~15 de react-i18next y ~2 del detector; los
 * doce namespaces de los dos idiomas juntos no llegan a 10 KB de JSON.
 *
 * Se sube en vez de trocearlo, y conviene saber por qué: i18n es del ARRANQUE.
 * La primera pantalla ya necesita sus textos, así que darle trozo propio —como
 * tenía `xlsx`— no quitaría un solo byte del camino crítico; sólo movería el
 * número a una casilla que este guion no mira, que es la versión elegante de
 * subir el techo para callarlo.
 *
 * Lo que este número NO es: una autorización para seguir engordando. `vendor`
 * lleva dos subidas en nueve días y ya pesa más que el resto del arranque
 * junto. `COD-07` (presupuesto de bundle, Plan 26) tiene ahora bastante más
 * trabajo del que tenía, y su punto de partida es preguntarse qué hacen ahí
 * los 161,84 KB que ya estaban antes de react-query.
 *
 * ── Y UNA TRAMPA QUE ESTA SUBIDA CASI ESCONDE ──────────────────────
 *
 * Al instalar i18n, este mismo guion destapó algo peor que 57 KB: la pila 3D
 * ENTERA —827 KB— se coló en el arranque. `react-i18next` depende de
 * `use-sync-external-store`, que estaba en `PAQUETES_3D` de `vite.config.js`
 * porque hasta entonces sólo lo usaba zustand; eso creó un ciclo
 * `vendor → three → vendor` y Rollup precargó los dos. Se arregló sacándolo de
 * esa lista. Sin la comprobación de abajo, la subida del techo habría sido lo
 * único visible y el problema de verdad habría pasado desapercibido.
 *
 * ── `index` sube de 170 a 200 (08-09-2026), por los DICCIONARIOS ───
 *
 * Ojo: esto no es la subida de `vendor` de arriba otra vez. Aquélla fue la
 * LIBRERÍA de i18n; ésta es el TEXTO. Cuando se escribió el párrafo anterior
 * los namespaces «no llegaban a 10 KB»; al terminar la migración son **103 KB
 * de JSON** entre los dos idiomas, y ése es el precio real de traducir un
 * tablero entero — no un descuido.
 *
 * Medido: `index` 92,21 KB antes de i18n → 183,17 KB con todos los
 * diccionarios dentro. Antes de tocar el número se sacó lo que de verdad no es
 * de arranque: `prediction.json` (17 KB, los dos idiomas) viaja ahora en el
 * chunk de las vistas del módulo de Predicción, que ya se cargaban en diferido
 * — ver `modulos/prediccion/i18n.js`. Con eso, **169,08 KB**.
 *
 * Y aun así se sube, porque 169,08 de 170 es menos de 1 KB de margen: el techo
 * habría saltado con la siguiente frase que alguien tradujera, y un guion que
 * se rompe por trabajo normal deja de leerse. 200 deja ~31 KB.
 *
 * ── LO QUE NO SE HIZO, Y ES LA SIGUIENTE PALANCA ───────────────────
 *
 * Cargar sólo el idioma activo. Hoy el arranque lleva español E inglés
 * completos, y casi ninguna sesión usa los dos: diferir el que no está puesto
 * quitaría ~40 KB del camino crítico, y el momento de bajarlo —cuando alguien
 * pulsa el selector— es un clic deliberado donde un instante de espera no
 * molesta. No se ha hecho aquí porque `fallbackLng` obliga a que el español
 * esté SIEMPRE, así que el cambio tiene que esperar al chunk antes de
 * `changeLanguage()` y eso merece hacerse con calma, no al final de una tanda.
 *
 * Queda anotado a propósito: la diferencia entre subir un techo y esconder un
 * problema es decir cuál era la alternativa y por qué no se tomó todavía.
 */
const PRESUPUESTO_KB = { index: 200, vendor: 270 };

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

/*
 * 4 · Que `xlsx` NO vuelva. Aquí había un bloque hermano del de `three` que
 * vigilaba que el trozo de SheetJS siguiera diferido; desde el Plan 22 F1 la
 * dependencia ya no existe —el «Exportar todo» de Detalle escribe un CSV, ver
 * `Demo-EVA/lib/exportarTodo.js`— y su regla en `manualChunks` se retiró con
 * ella.
 *
 * La comprobación se invierte en vez de borrarse: sin regla propia, un `xlsx`
 * reinstalado por cualquier motivo caería en el catch-all de `vendor`, que SÍ
 * es de carga inmediata, y sumaría ~276 KB al arranque sin romper nada
 * visible. Es el mismo modo de fallo silencioso del bloque de arriba, con el
 * paquete del que ya sabemos que lo provoca.
 */
const HUELLAS_XLSX = [/["'`]xlsx["'`]/, /SheetJS/];
const xlsxEnAlgunTrozo = archivos.find((a) => {
  const código = readFileSync(a.ruta, "utf8");
  return HUELLAS_XLSX.some((h) => h.test(código));
});
if (xlsxEnAlgunTrozo) {
  console.log(`  ✖ xlsx     ha vuelto, dentro de ${xlsxEnAlgunTrozo.nombre}`);
  fallos.push(
    `${xlsxEnAlgunTrozo.nombre} contiene rastros de \`xlsx\`, que el Plan 22 F1 (SEG-05) retiró. ` +
      "Sin su regla en `manualChunks` cae en `vendor`, que es de carga inmediata."
  );
} else {
  console.log("  ✔ xlsx     fuera del árbol (Plan 22 F1)");
}

console.log();
if (fallos.length) {
  console.error(`✖ ${fallos.length} problema(s):\n`);
  fallos.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
  process.exit(1);
}
console.log("✔ El arranque no paga la pila 3D.");
