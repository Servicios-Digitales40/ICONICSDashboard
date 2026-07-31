import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
