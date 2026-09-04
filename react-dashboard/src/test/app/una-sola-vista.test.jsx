// @vitest-environment jsdom
/**
 * una-sola-vista.test.jsx
 * ------------------------------------------------------------------
 * La guarda de la invariante §2.12 del Plan 20: **esta aplicación tiene una
 * sola vista.**
 *
 * ── POR QUÉ HACE FALTA UNA PRUEBA PARA ESTO ────────────────────────
 *
 * Porque volver a tener veintidós pantallas no pasa de golpe: pasa añadiendo
 * la segunda. Este proyecto ya recorrió ese camino una vez —la cabecera vieja
 * de `app/routes/routes.jsx` lo cuenta: una constante `SOLO_DEMO_EVA` que se
 * limitaba a quitar entradas del sidebar mientras las rutas seguían ahí,
 * navegables y viajando en el bundle— y el borrado de la Fase 3 sólo se
 * sostiene si algo protesta cuando alguien reabre la puerta.
 *
 * Una regla escrita en un documento no protesta. Ésta sí.
 *
 * ── QUÉ COMPRUEBA, EXACTAMENTE ─────────────────────────────────────
 *
 * Que no ha vuelto la MECÁNICA de navegación: ni un registro de rutas, ni un
 * sidebar, ni un enrutador. No comprueba cuántos componentes hay ni prohíbe
 * los cajones — un cajón es contenido dentro de la única vista, no un destino.
 *
 * Si algún día la decisión cambia, esta prueba se borra **a propósito y en su
 * propio commit**, que es justo lo que se quiere: que sea una decisión y no un
 * descuido.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Desde el directorio de trabajo, y no desde `import.meta.url`: vitest
 * transforma los módulos, así que ahí `import.meta.url` no siempre es una URL
 * `file:` y `fileURLToPath` lanza. `vitest.config` fija la raíz en
 * `react-dashboard/`, que es donde `npm test` corre.
 */
const SRC = join(process.cwd(), "src");

/**
 * El código, sin comentarios.
 *
 * Hace falta porque este proyecto documenta a fondo LO QUE SE FUE: `App.jsx`
 * explica que ya no hay `lazy()` por vista, y `lib/motion.js` menciona
 * `useNavegacion` al contar de dónde venía un helper. Buscar sobre el texto
 * crudo daba positivo en las dos, es decir, la guarda acusaba a las cabeceras
 * que explican precisamente que la navegación se fue.
 *
 * Es aproximado a propósito —no es un parser— y basta: lo que busca son
 * identificadores e imports, que en código real no viven dentro de una cadena.
 */
function sinComentarios(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Todos los archivos de `src/`, menos las propias pruebas. */
function fuentes(dir = SRC, encontrados = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== "test") fuentes(ruta, encontrados);
    } else if (/\.(js|jsx)$/.test(entrada.name)) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

describe("§2.12 — una sola vista", () => {
  it("no ha vuelto un registro de rutas ni un enrutador", () => {
    /*
     * Se buscan las señales de que existe NAVEGACIÓN, no la palabra «ruta»,
     * que aparece legítimamente en comentarios y en rutas de API.
     */
    const senales = [
      [/from\s+["']react-router/, "react-router"],
      [/\bexport\s+const\s+ROUTES\b/, "un registro ROUTES"],
      [/\bexport\s+const\s+NAV_GROUPS\b/, "grupos de navegación"],
      [/\buseNavegacion\b/, "el hook de navegación"],
    ];

    const culpables = [];
    for (const archivo of fuentes()) {
      const contenido = sinComentarios(readFileSync(archivo, "utf8"));
      for (const [patron, que] of senales) {
        if (patron.test(contenido)) culpables.push(`${archivo}: ${que}`);
      }
    }

    expect(
      culpables,
      "Volvió la navegación. Si es a propósito, borra esta prueba en su propio " +
        "commit y actualiza docs/PLAN-20-ASISTENTE.md §2.12."
    ).toEqual([]);
  });

  it("App.jsx monta el asistente y nada más", () => {
    const app = sinComentarios(readFileSync(join(SRC, "app", "App.jsx"), "utf8"));

    expect(app).toMatch(/<Asistente\s*\/>/);
    /*
     * `lazy(` era el mecanismo con el que se cargaba cada vista bajo demanda.
     * Sin destinos no hay nada que cargar bajo demanda, así que su vuelta
     * significa que volvieron las pantallas.
     */
    expect(app).not.toMatch(/\blazy\(/);
  });
});
