import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Qué build es este. Se resuelve aquí, en la compilación, y no en el
 * despliegue: si dependiera de que alguien exporte una variable antes de
 * `npm run build`, el día que se olvide la pantalla dirá una versión que no
 * es la suya — y una versión equivocada es peor que ninguna.
 *
 * Se admite `VITE_APP_VERSION` del entorno para que un empaquetado desde CI
 * pueda imponer su propia etiqueta. Sin git (compilando desde un zip) queda
 * vacío y el Topbar no pinta nada, que es lo honesto.
 */
function versionDelBuild() {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    return execSync("git describe --always --dirty --tags", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

/**
 * El cierre de dependencias de la pila 3D (three + r3f + drei), para apartarlo
 * en su propio trozo.
 *
 * ── POR QUÉ HACE FALTA LA LISTA ENTERA Y NO BASTA `three` ──────────
 *
 * Las dos vistas 3D se cargan con `lazy()`, así que su código no viaja en el
 * arranque. Pero `manualChunks` reparte por PAQUETE, no por quién lo usa: el
 * catch-all `return "vendor"` de abajo se lleva todo lo que no reconozca, y
 * "vendor" SÍ es de carga inmediata. Sin esta lista, las dependencias
 * transitivas de drei —`zustand`, `react-reconciler`, `three-stdlib`,
 * `troika-*`…— acabarían en el trozo que descarga la pantalla de Planta,
 * y el `lazy()` no serviría de nada.
 *
 * `react-reconciler` es el ejemplo de por qué la regla de React de abajo no lo
 * salva: su patrón exige `react/` y ahí pone `react-reconciler/`.
 *
 * ── CÓMO SE REGENERA ───────────────────────────────────────────────
 *
 * Es el listado de paquetes que añadió la instalación de la pila 3D, menos los
 * de tipos y los de herramientas (no entran en el bundle):
 *
 *     git diff package-lock.json | grep -E '^\+\s+"node_modules/'
 *
 * La comprobación de verdad no es esta lista sino el `dist`: si al añadir algo
 * a 3D crecen `index` o `vendor`, es que un paquete nuevo se coló por el
 * catch-all. Ver `scripts/verificar-bundle.mjs`.
 */
const PAQUETES_3D = [
  "three", "three-stdlib", "three-mesh-bvh", "@react-three", "@react-spring",
  "@use-gesture", "@monogrid", "@mediapipe", "@dimforge", "@tweenjs",
  "camera-controls", "maath", "meshline", "meshoptimizer", "potpack",
  "troika-three-text", "troika-three-utils", "troika-worker-utils",
  "webgl-constants", "webgl-sdf-generator", "glsl-noise", "draco3d",
  "detect-gpu", "stats-gl", "stats.js", "hls.js", "fflate",
  "zustand", "react-reconciler", "react-use-measure", "react-composer",
  "its-fine", "suspend-react", "tunnel-rat", "use-sync-external-store",
  "utility-types", "is-promise", "promise-worker-transferable", "lie",
  "immediate", "buffer", "base64-js", "ieee754",
];

/**
 * ¿El módulo pertenece a la pila 3D?
 *
 * Se extrae el nombre de paquete COMPLETO que sigue a `node_modules/` y se
 * compara por igualdad, no con `includes`, para que `three` no capture un
 * futuro `three-cualquier-cosa` que no tenga nada que ver.
 *
 * Los paquetes con ámbito valen por su ámbito entero: en la lista basta poner
 * `@react-three` para que entren `fiber` y `drei`.
 */
function esDe3D(id) {
  const m = id.replace(/\\/g, "/").match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (!m) return false;
  const [ambito] = m[1].split("/");
  return PAQUETES_3D.includes(m[1]) || (m[1].startsWith("@") && PAQUETES_3D.includes(ambito));
}

// Configuración mínima de Vite: el plugin de React para JSX/Fast Refresh,
// más dos alias: "@" -> src/ y "@shared" -> ../shared/.
//
// Los alias se mantienen al mínimo a propósito: cada uno es un segundo
// sistema de nombres que hay que sincronizar entre este archivo Y
// jsconfig.json Y el árbol de carpetas.
//
// "@shared" es la excepción que justifica la regla, y por eso son dos y no
// tres: apunta FUERA de src/, así que "@" no puede alcanzarlo por mucho que
// se estire. `shared/` vive en la raíz del repositorio porque lo importan dos
// programas distintos —este frontend y el backend de Node—, y ninguno de los
// dos puede ser su dueño. La alternativa era un relativo de tres niveles
// (`../../../shared/...`) que se rompe al mover cualquier archivo.
//
// Regla de uso: alias para cruzar de módulo, relativo dentro del propio
// módulo. Ver jsconfig.json para el equivalente que consume el editor.
export default defineConfig({
  plugins: [react()],

  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(versionDelBuild()),
  },

  build: {
    /*
     * Un solo archivo de 755 KB significa que cambiar una etiqueta obliga a
     * la pantalla a descargarse recharts otra vez. Separando las librerías
     * —que cambian cuando se actualizan, o sea casi nunca— del código de la
     * aplicación, un despliegue normal sólo invalida la parte pequeña.
     *
     * No reduce el peso del PRIMER arranque: recharts entra igual porque lo
     * usa la vista de Planta, que es la ruta por defecto. Lo que mejora es
     * cada arranque posterior a un despliegue, que en un wallboard es el
     * caso que se repite.
     */
    rollupOptions: {
      output: {
        /*
         * Se reparte por la RUTA del módulo y no por una lista de nombres de
         * paquete: listar `react-dom` no captura `react-dom/client`, que es lo
         * que importa `main.jsx`, y el resultado era un chunk de React vacío
         * con React entero dentro del de gráficas.
         */
        manualChunks(id) {
          /*
           * El ayudante de precarga de Vite (`__vitePreload`), que es lo que
           * ejecuta cada `import()` diferido.
           *
           * No vive en node_modules, así que sin esta línea cae en el
           * `return` de abajo y lo coloca Rollup — que lo metió DENTRO del
           * trozo `three`. El efecto era silencioso y grave: el trozo de
           * entrada importaba el ayudante, con él los 840 KB de la pila 3D, y
           * el `index.html` acababa con un `modulepreload` de three. Las dos
           * vistas 3D seguían siendo diferidas y aun así la pantalla de
           * Planta descargaba three.js en el arranque.
           *
           * Va a `vendor`, que es de carga inmediata igualmente.
           */
          if (id.includes("vite/preload-helper")) return "vendor";

          if (!id.includes("node_modules")) return;
          if (esDe3D(id)) return "three";
          if (/[\\/]node_modules[\\/](recharts|d3-|victory|decimal)/.test(id)) return "charts";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },

  resolve: {
    // fileURLToPath y no __dirname: package.json declara "type": "module".
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },

  // Vitest hereda de aquí el alias "@", así que las pruebas importan igual
  // que la app y no hace falta un segundo mapa de rutas que sincronizar.
  // Eso es lo que permite que TODA la suite viva en src/test/ (en un árbol
  // que espeja src/) sin que ninguna prueba dependa de su propia ubicación.
  // Ver src/test/README.md para el índice de qué cubre cada carpeta.
  //
  // El entorno por defecto es `node`, que es lo que quiere la mayoría de la
  // suite (dominio, motor de polling, rollup): JS puro y rápido. Los pocos
  // archivos que necesitan DOM lo piden por sí mismos con la directiva
  //     // @vitest-environment jsdom
  // en su primera línea. Es más explícito que un glob en la configuración:
  // se ve al abrir el archivo, y no queda escondido aquí.
  test: {
    // Rellena ResizeObserver y matchMedia, que jsdom no trae y Recharts sí
    // usa. Es inocuo en las pruebas de node: comprueba antes de definir.
    setupFiles: ["./src/test/setup.js"],
  },
});
