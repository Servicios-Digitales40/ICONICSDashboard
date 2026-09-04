/**
 * verificar-bundle.mjs
 * ------------------------------------------------------------------
 * Sigue siendo pequeno el arranque, y sigue fuera lo que se echo?
 *
 * -- QUE VIGILABA ANTES, Y POR QUE AHORA ES OTRA COSA ---------------
 *
 * Vigilaba que la pila 3D no se colara en el trozo de arranque. Con
 * `three` + r3f + drei instalados eso fallaba en silencio de dos maneras --un
 * import estatico que anulaba un `lazy()`, o un paquete nuevo del arbol de
 * drei que caia en el catch-all `vendor`-- y el sintoma era que la pantalla
 * de Planta tardaba el doble en abrir sin que nada se rompiera.
 *
 * La Fase 3 del Plan 20 desinstalo `three`, `@react-three/*`, `recharts` y
 * `xlsx`. Asi que la pregunta cambia: ya no es «esta diferido?» sino
 * **«ha vuelto?»**, que es una guarda mas fuerte. Un `npm install three`
 * hecho por costumbre, o un componente copiado de la rama del tablero, es
 * exactamente el modo de fallo que este archivo existe para hacer ruidoso.
 *
 * Y el presupuesto de tamano deja de ser decorativo: medido contra un
 * arranque de 89 + 110 KB, un techo de 170 + 210 no detectaria ni que se
 * duplicara la aplicacion entera.
 *
 * -- COMO SE USA ---------------------------------------------------
 *
 *     cd react-dashboard && npm run build
 *     node ../scripts/verificar-bundle.mjs
 *
 * Sin argumentos comprueba `react-dashboard/dist`. Devuelve 0 si todo esta en
 * su sitio y 1 con el detalle si no.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(process.argv[2] ?? join(AQUI, "..", "react-dashboard", "dist"));

/**
 * Presupuesto del arranque, en KB.
 *
 * **Remedido el 04-09-2026, al terminar la Fase 5**: `index` 98,88 KB y
 * `vendor` 125,18 KB. Los techos son eso con un ~12 % de margen.
 *
 * ── POR QUE SUBEN RESPECTO A LA FASE 3, Y POR QUE NO ES TAPAR NADA ──
 *
 * Los anteriores (102 / 126) se midieron contra una aplicacion **incompleta**:
 * la Fase 3 habia borrado el tablero pero todavia no existian ni el login ni
 * los cajones. Medir el techo contra media aplicacion y despues subirlo al
 * acabarla no es relajar la regla, es cerrar una medicion que se tomo pronto.
 *
 * Lo que crecio, y su motivo:
 *
 *  - `index` +10 KB: el login, el proveedor de sesion, la unica puerta a la
 *    API y el armazon de la pantalla completa con sus tres estados.
 *  - `vendor` +16 KB: los cajones usan `useQuery`, que arrastra mas superficie
 *    de TanStack Query que el `QueryClient` pelado que habia antes.
 *
 * Los tres cajones NO cuentan aqui: van en sus propios trozos, diferidos, y
 * eso es precisamente lo que este guion cazo — estaticos ponian `index` en
 * 126,58 KB y quien entra a hacer una sola pregunta los pagaba enteros.
 *
 * La regla de siempre sigue en pie: si crece por una razon legitima, se sube
 * el numero Y se dice por que. Si crece sin motivo, esto lo dice.
 */
const PRESUPUESTO_KB = { index: 110, vendor: 140 };

/**
 * Librerias que se echaron en la Fase 3 y no deben volver a entrar.
 *
 * Se busca por RASTRO en el codigo emitido y no en `package.json`: una
 * dependencia puede llegar de rebote --transitiva de otra, o copiada dentro de
 * un componente-- sin figurar como directa. Cada entrada es una cadena que
 * solo puede estar ahi si la libreria esta.
 */
const DESTERRADAS = [
  ["la pila 3D", ["THREE.WebGLRenderer", "PerspectiveCamera", "@react-three/fiber"]],
  ["recharts", ["CartesianGrid", "recharts"]],
  ["xlsx", ["SheetJS"]],
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

/* 1 · Nada de lo desterrado puede haber vuelto, ni siquiera diferido. */
for (const a of archivos) {
  const codigo = readFileSync(a.ruta, "utf8");
  for (const [nombre, huellas] of DESTERRADAS) {
    const huella = huellas.find((h) => codigo.includes(h));
    if (!huella) continue;
    fallos.push(
      `${a.nombre} contiene ${nombre} (rastro: \u00ab${huella}\u00bb).\n` +
      `    La Fase 3 del Plan 20 la desinstal\u00f3: esta aplicaci\u00f3n es una sola vista, sin 3D\n` +
      `    ni gr\u00e1ficas. Si vuelve a hacer falta, se decide en su propio commit y se quita\n` +
      `    de DESTERRADAS en scripts/verificar-bundle.mjs.`
    );
  }
}
if (!fallos.length) {
  console.log(`  \u2714 sin rastro de ${DESTERRADAS.map(([n]) => n).join(", ")}`);
}

/* 2 · Los trozos del arranque no se salen del presupuesto. ----------- */
for (const [prefijo, techo] of Object.entries(PRESUPUESTO_KB)) {
  const candidatos = archivos.filter((x) => x.nombre.startsWith(`${prefijo}-`));

  /*
   * M\u00e1s de un trozo con el mismo prefijo hace ambigua la medici\u00f3n, y el modo
   * de fallo es silencioso: se medir\u00eda el primero que apareciera y el techo
   * dejar\u00eda de comprobar nada. Pas\u00f3 al diferir el asistente con `lazy()`
   * importando su barril, que produjo un segundo `index-*.js` de 7 KB -- y
   * este guion lo dio por bueno frente al techo de 170.
   */
  if (candidatos.length > 1) {
    fallos.push(
      `Hay ${candidatos.length} trozos que empiezan por \u00ab${prefijo}-\u00bb: ` +
      `${candidatos.map((x) => x.nombre).join(", ")}.\n` +
      `    No se puede saber cu\u00e1l es el del arranque. Importa el componente concreto ` +
      `en vez de un barril en el lazy() que lo gener\u00f3.`
    );
    continue;
  }

  const a = candidatos[0];
  if (!a) {
    fallos.push(`No hay ning\u00fan trozo \u00ab${prefijo}-\u00bb en el build: cambi\u00f3 el reparto de vite.config.js.`);
    continue;
  }
  const tam = kb(a.bytes);
  const ok = tam <= techo;
  console.log(`  ${ok ? "\u2714" : "\u2716"} ${prefijo.padEnd(8)} ${String(tam).padStart(8)} KB  (techo ${techo} KB)`);
  if (!ok) fallos.push(`${a.nombre} ocupa ${tam} KB y el techo son ${techo} KB.`);
}

console.log();
if (fallos.length) {
  console.error(`✖ ${fallos.length} problema(s):\n`);
  fallos.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
  process.exit(1);
}
console.log("✔ El arranque es el de una sola vista.");
