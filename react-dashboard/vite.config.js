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

// Configuración mínima de Vite: el plugin de React para JSX/Fast Refresh,
// más un único alias "@" -> src/.
//
// Un solo alias a propósito: cada alias extra es un segundo sistema de
// nombres que hay que sincronizar entre este archivo Y jsconfig.json Y el
// árbol de carpetas. Con uno solo, el árbol es la única fuente de verdad.
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
          if (!id.includes("node_modules")) return;
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
